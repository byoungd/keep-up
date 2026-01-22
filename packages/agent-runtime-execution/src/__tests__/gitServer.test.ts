/**
 * Git Tool Server Tests
 *
 * Comprehensive tests for git operations including:
 * - Status, diff, commit operations
 * - Branch management
 * - Semantic diff analysis
 * - Conflict detection and resolution
 * - Error handling
 */

import type {
  CommitOptions,
  ConflictInfo,
  ConflictStrategy,
  GeneratedCommitMessage,
  GitBranch,
  GitCommit,
  GitDiff,
  GitStash,
  GitStatus,
  SemanticDiffAnalysis,
} from "@ku0/agent-runtime-tools";
import {
  createGitToolServer,
  GitToolServer,
  type IGitExecutor,
  MockGitExecutor,
} from "@ku0/agent-runtime-tools";
import { beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "../types";

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(): ToolContext {
  return {
    security: {
      policy: {
        name: "test",
        permissions: {
          bash: { enabled: true },
          file: { enabled: true, read: true, write: true },
          network: { enabled: false },
          code: { enabled: true },
        },
        resourceLimits: {
          maxExecutionTime: 30000,
          maxMemory: 256 * 1024 * 1024,
          maxOutputSize: 1024 * 1024,
          maxConcurrentTools: 5,
        },
        sandbox: {
          enabled: false,
          workingDirectory: "/test/project",
        },
        confirmation: {
          requireForDestructive: false,
          requireForNetwork: false,
          requireForSensitive: false,
        },
      },
      sandbox: {
        enabled: false,
        workingDirectory: "/test/project",
      },
    },
    permissions: {},
    traceId: "test-trace-id",
    agentId: "test-agent",
  };
}

// ============================================================================
// Custom Mock Executor for Testing
// ============================================================================

class TestGitExecutor implements IGitExecutor {
  // Configurable state for testing
  public statusResult: GitStatus = {
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    staged: [],
    modified: [],
    untracked: [],
    conflicted: [],
    clean: true,
    rebasing: false,
    merging: false,
  };

  public diffResult: GitDiff[] = [];
  public logResult: GitCommit[] = [];
  public branchesResult: GitBranch[] = [{ name: "main", current: true }];
  public conflictsResult: ConflictInfo[] = [];
  public stashResult: GitStash = {
    index: 0,
    message: "WIP",
    branch: "main",
    date: new Date(),
  };

  public lastCommitOptions?: CommitOptions;
  public lastAddedFiles?: string | string[];
  public lastCheckoutBranch?: string;
  public lastCheckoutCreate?: boolean;
  public lastResolveFile?: string;
  public lastResolveStrategy?: ConflictStrategy;

  public throwOnCommit = false;
  public throwOnCheckout = false;
  public throwOnPush = false;

  async status(): Promise<GitStatus> {
    return this.statusResult;
  }

  async diff(_options?: { staged?: boolean; file?: string }): Promise<GitDiff[]> {
    return this.diffResult;
  }

  async add(files: string | string[]): Promise<void> {
    this.lastAddedFiles = files;
  }

  async reset(_files: string | string[]): Promise<void> {
    // Mock implementation
  }

  async commit(options: CommitOptions): Promise<GitCommit> {
    if (this.throwOnCommit) {
      throw new Error("Commit failed: pre-commit hook rejected");
    }
    this.lastCommitOptions = options;
    return {
      hash: "abc123def456789",
      shortHash: "abc123d",
      message: options.message,
      author: "Test User",
      authorEmail: "test@example.com",
      date: new Date(),
      parents: ["parent123"],
    };
  }

  async log(_options?: { limit?: number; file?: string }): Promise<GitCommit[]> {
    return this.logResult;
  }

  async branches(): Promise<GitBranch[]> {
    return this.branchesResult;
  }

  async checkout(branch: string, options?: { create?: boolean }): Promise<void> {
    if (this.throwOnCheckout) {
      throw new Error("Checkout failed: uncommitted changes");
    }
    this.lastCheckoutBranch = branch;
    this.lastCheckoutCreate = options?.create;
  }

  async pull(_options?: { rebase?: boolean }): Promise<void> {
    // Mock implementation
  }

  async push(_options?: { force?: boolean; setUpstream?: string }): Promise<void> {
    if (this.throwOnPush) {
      throw new Error("Push failed: remote rejected");
    }
  }

  async stash(_message?: string): Promise<GitStash> {
    return this.stashResult;
  }

  async stashPop(_index?: number): Promise<void> {
    // Mock implementation
  }

  async semanticDiff(_options?: { staged?: boolean }): Promise<SemanticDiffAnalysis> {
    return {
      summary: "Test changes",
      categories: [],
      affectedSymbols: [],
      riskLevel: "low",
    };
  }

  async suggestCommitMessage(_diffs?: GitDiff[]): Promise<GeneratedCommitMessage> {
    return {
      subject: "chore: test commit",
      confidence: 0.8,
      type: "chore",
    };
  }

  async detectConflicts(): Promise<ConflictInfo[]> {
    return this.conflictsResult;
  }

  async resolveConflict(file: string, strategy: ConflictStrategy): Promise<void> {
    this.lastResolveFile = file;
    this.lastResolveStrategy = strategy;
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("GitToolServer", () => {
  let server: GitToolServer;
  let executor: TestGitExecutor;
  let context: ToolContext;

  beforeEach(() => {
    executor = new TestGitExecutor();
    server = new GitToolServer({}, executor);
    context = createMockContext();
  });

  describe("listTools", () => {
    it("should list all git tools", () => {
      const tools = server.listTools();

      expect(tools).toHaveLength(11);
      expect(tools.map((t) => t.name)).toEqual([
        "status",
        "diff",
        "add",
        "commit",
        "log",
        "branches",
        "checkout",
        "semantic_diff",
        "suggest_commit",
        "conflicts",
        "resolve_conflict",
      ]);
    });

    it("should mark destructive operations as requiring confirmation", () => {
      const tools = server.listTools();

      const commit = tools.find((t) => t.name === "commit");
      const checkout = tools.find((t) => t.name === "checkout");
      const resolveConflict = tools.find((t) => t.name === "resolve_conflict");

      expect(commit?.annotations?.requiresConfirmation).toBe(true);
      expect(checkout?.annotations?.requiresConfirmation).toBe(true);
      expect(resolveConflict?.annotations?.requiresConfirmation).toBe(true);
    });

    it("should not require confirmation for read-only operations", () => {
      const tools = server.listTools();

      const status = tools.find((t) => t.name === "status");
      const diff = tools.find((t) => t.name === "diff");
      const log = tools.find((t) => t.name === "log");

      expect(status?.annotations?.requiresConfirmation).toBeUndefined();
      expect(diff?.annotations?.requiresConfirmation).toBeUndefined();
      expect(log?.annotations?.requiresConfirmation).toBeUndefined();
    });
  });

  describe("status", () => {
    it("should return clean status", async () => {
      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Branch: main");
      expect(result.content[0].text).toContain("Working tree clean");
    });

    it("should show staged files", async () => {
      executor.statusResult = {
        ...executor.statusResult,
        staged: [{ path: "src/index.ts", status: "modified" }],
        clean: false,
      };

      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Staged:");
      expect(result.content[0].text).toContain("src/index.ts");
    });

    it("should show modified files", async () => {
      executor.statusResult = {
        ...executor.statusResult,
        modified: [{ path: "README.md", status: "modified" }],
        clean: false,
      };

      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Modified:");
      expect(result.content[0].text).toContain("README.md");
    });

    it("should show untracked files", async () => {
      executor.statusResult = {
        ...executor.statusResult,
        untracked: ["new-file.ts", "temp.txt"],
        clean: false,
      };

      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Untracked:");
      expect(result.content[0].text).toContain("new-file.ts");
      expect(result.content[0].text).toContain("temp.txt");
    });

    it("should show conflicted files", async () => {
      executor.statusResult = {
        ...executor.statusResult,
        conflicted: [{ path: "package.json", status: "modified" }],
        merging: true,
        clean: false,
      };

      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Conflicts:");
      expect(result.content[0].text).toContain("package.json");
    });

    it("should show ahead/behind counts", async () => {
      executor.statusResult = {
        ...executor.statusResult,
        ahead: 2,
        behind: 1,
      };

      const result = await server.callTool({ name: "status", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("2↑");
      expect(result.content[0].text).toContain("1↓");
    });
  });

  describe("diff", () => {
    it("should return no changes message when clean", async () => {
      const result = await server.callTool({ name: "diff", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe("No changes");
    });

    it("should show file diffs", async () => {
      executor.diffResult = [
        {
          file: "src/index.ts",
          status: "modified",
          additions: 5,
          deletions: 2,
          binary: false,
          hunks: [
            {
              oldStart: 10,
              oldLines: 3,
              newStart: 10,
              newLines: 6,
              header: "function main()",
              lines: [
                { type: "context", content: "  const x = 1;" },
                { type: "remove", content: "  const y = 2;" },
                { type: "add", content: "  const y = 3;" },
                { type: "add", content: "  const z = 4;" },
              ],
            },
          ],
        },
      ];

      const result = await server.callTool({ name: "diff", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("--- src/index.ts");
      expect(result.content[0].text).toContain("+++ src/index.ts");
      expect(result.content[0].text).toContain("+5 -2");
      expect(result.content[0].text).toContain("function main()");
      expect(result.content[0].text).toContain("-  const y = 2;");
      expect(result.content[0].text).toContain("+  const y = 3;");
    });

    it("should handle binary files", async () => {
      executor.diffResult = [
        {
          file: "image.png",
          status: "added",
          additions: 0,
          deletions: 0,
          binary: true,
          hunks: [],
        },
      ];

      const result = await server.callTool({ name: "diff", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("(binary file)");
    });

    it("should show renamed files", async () => {
      executor.diffResult = [
        {
          file: "src/newName.ts",
          oldPath: "src/oldName.ts",
          status: "renamed",
          additions: 0,
          deletions: 0,
          binary: false,
          hunks: [],
        },
      ];

      const result = await server.callTool({ name: "diff", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("--- src/oldName.ts");
      expect(result.content[0].text).toContain("+++ src/newName.ts");
    });
  });

  describe("add", () => {
    it("should stage a single file", async () => {
      const result = await server.callTool(
        { name: "add", arguments: { files: "src/index.ts" } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastAddedFiles).toEqual(["src/index.ts"]);
      expect(result.content[0].text).toContain("Staged: src/index.ts");
    });

    it("should stage multiple files", async () => {
      const result = await server.callTool(
        { name: "add", arguments: { files: ["src/a.ts", "src/b.ts"] } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastAddedFiles).toEqual(["src/a.ts", "src/b.ts"]);
      expect(result.content[0].text).toContain("src/a.ts");
      expect(result.content[0].text).toContain("src/b.ts");
    });

    it("should stage all files with dot", async () => {
      const result = await server.callTool({ name: "add", arguments: { files: "." } }, context);

      expect(result.success).toBe(true);
      expect(executor.lastAddedFiles).toEqual(["."]);
    });
  });

  describe("commit", () => {
    it("should create a commit with message", async () => {
      const result = await server.callTool(
        { name: "commit", arguments: { message: "feat: add new feature" } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastCommitOptions?.message).toBe("feat: add new feature");
      expect(result.content[0].text).toContain("Committed: abc123d");
      expect(result.content[0].text).toContain("feat: add new feature");
    });

    it("should support commit with all flag", async () => {
      await server.callTool(
        { name: "commit", arguments: { message: "fix: bug fix", all: true } },
        context
      );

      expect(executor.lastCommitOptions?.all).toBe(true);
    });

    it("should support amend option", async () => {
      await server.callTool(
        { name: "commit", arguments: { message: "updated message", amend: true } },
        context
      );

      expect(executor.lastCommitOptions?.amend).toBe(true);
    });

    it("should handle commit failure", async () => {
      executor.throwOnCommit = true;

      const result = await server.callTool(
        { name: "commit", arguments: { message: "test" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.content[0].text).toContain("Git error");
      expect(result.content[0].text).toContain("pre-commit hook rejected");
    });
  });

  describe("log", () => {
    it("should return empty log", async () => {
      const result = await server.callTool({ name: "log", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe("");
    });

    it("should show commit history", async () => {
      executor.logResult = [
        {
          hash: "abc123",
          shortHash: "abc123",
          message: "feat: add feature",
          author: "John Doe",
          authorEmail: "john@example.com",
          date: new Date("2024-01-15"),
          parents: [],
        },
        {
          hash: "def456",
          shortHash: "def456",
          message: "fix: bug fix",
          author: "Jane Doe",
          authorEmail: "jane@example.com",
          date: new Date("2024-01-14"),
          parents: [],
        },
      ];

      const result = await server.callTool({ name: "log", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("abc123");
      expect(result.content[0].text).toContain("feat: add feature");
      expect(result.content[0].text).toContain("John Doe");
      expect(result.content[0].text).toContain("def456");
      expect(result.content[0].text).toContain("fix: bug fix");
    });
  });

  describe("branches", () => {
    it("should list branches", async () => {
      executor.branchesResult = [
        { name: "main", current: true, ahead: 0, behind: 0 },
        { name: "feature/test", current: false, remote: "origin", upstream: "feature/test" },
        { name: "develop", current: false, ahead: 2, behind: 1 },
      ];

      const result = await server.callTool({ name: "branches", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("* main");
      expect(result.content[0].text).toContain("feature/test");
      expect(result.content[0].text).toContain("develop");
      expect(result.content[0].text).toContain("2↑");
    });
  });

  describe("checkout", () => {
    it("should switch to existing branch", async () => {
      const result = await server.callTool(
        { name: "checkout", arguments: { branch: "develop" } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastCheckoutBranch).toBe("develop");
      expect(executor.lastCheckoutCreate).toBeUndefined();
      expect(result.content[0].text).toContain("Switched to branch: develop");
    });

    it("should create and switch to new branch", async () => {
      const result = await server.callTool(
        { name: "checkout", arguments: { branch: "feature/new", create: true } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastCheckoutBranch).toBe("feature/new");
      expect(executor.lastCheckoutCreate).toBe(true);
      expect(result.content[0].text).toContain("Created and switched to branch");
    });

    it("should handle checkout failure", async () => {
      executor.throwOnCheckout = true;

      const result = await server.callTool(
        { name: "checkout", arguments: { branch: "dirty-branch" } },
        context
      );

      expect(result.success).toBe(false);
      expect(result.content[0].text).toContain("uncommitted changes");
    });
  });

  describe("semantic_diff", () => {
    it("should return semantic analysis", async () => {
      executor.diffResult = [
        {
          file: "src/index.ts",
          status: "modified",
          additions: 50,
          deletions: 10,
          binary: false,
          hunks: [
            {
              oldStart: 1,
              oldLines: 10,
              newStart: 1,
              newLines: 50,
              header: "class MyClass",
              lines: [],
            },
          ],
        },
      ];

      const result = await server.callTool({ name: "semantic_diff", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Summary");
      expect(result.content[0].text).toContain("Risk Level");
    });
  });

  describe("suggest_commit", () => {
    it("should suggest commit message", async () => {
      const result = await server.callTool({ name: "suggest_commit", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Suggested Commit Message");
      expect(result.content[0].text).toContain("Confidence");
    });
  });

  describe("conflicts", () => {
    it("should return no conflicts message when clean", async () => {
      const result = await server.callTool({ name: "conflicts", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toBe("No conflicts detected");
    });

    it("should list conflicts", async () => {
      executor.conflictsResult = [
        {
          file: "package.json",
          markers: [{ start: 10, end: 20, ours: "1.0.0", theirs: "2.0.0" }],
          ours: "version 1.0.0",
          theirs: "version 2.0.0",
        },
        {
          file: "src/index.ts",
          markers: [{ start: 5, end: 15, ours: "old code", theirs: "new code" }],
          ours: "old",
          theirs: "new",
        },
      ];

      const result = await server.callTool({ name: "conflicts", arguments: {} }, context);

      expect(result.success).toBe(true);
      expect(result.content[0].text).toContain("Found 2 conflicts");
      expect(result.content[0].text).toContain("package.json");
      expect(result.content[0].text).toContain("src/index.ts");
    });
  });

  describe("resolve_conflict", () => {
    it("should resolve conflict with ours strategy", async () => {
      const result = await server.callTool(
        { name: "resolve_conflict", arguments: { file: "package.json", strategy: "ours" } },
        context
      );

      expect(result.success).toBe(true);
      expect(executor.lastResolveFile).toBe("package.json");
      expect(executor.lastResolveStrategy).toBe("ours");
      expect(result.content[0].text).toContain("Resolved conflict");
      expect(result.content[0].text).toContain("ours strategy");
    });

    it("should resolve conflict with theirs strategy", async () => {
      await server.callTool(
        { name: "resolve_conflict", arguments: { file: "src/index.ts", strategy: "theirs" } },
        context
      );

      expect(executor.lastResolveStrategy).toBe("theirs");
    });
  });

  describe("unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await server.callTool({ name: "unknown_tool", arguments: {} }, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("RESOURCE_NOT_FOUND");
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });

  describe("factory function", () => {
    it("should create server with default config", () => {
      const server = createGitToolServer();
      expect(server).toBeInstanceOf(GitToolServer);
      expect(server.name).toBe("git");
    });

    it("should create server with custom config", () => {
      const server = createGitToolServer({ autoStage: true });
      expect(server).toBeInstanceOf(GitToolServer);
    });

    it("should create server with custom executor", () => {
      const customExecutor = new TestGitExecutor();
      const server = createGitToolServer({}, customExecutor);
      expect(server).toBeInstanceOf(GitToolServer);
    });
  });

  describe("MockGitExecutor", () => {
    it("should return default clean status", async () => {
      const mockExecutor = new MockGitExecutor();
      const status = await mockExecutor.status();

      expect(status.branch).toBe("main");
      expect(status.clean).toBe(true);
    });

    it("should return empty diff", async () => {
      const mockExecutor = new MockGitExecutor();
      const diffs = await mockExecutor.diff();

      expect(diffs).toEqual([]);
    });

    it("should return mock commit", async () => {
      const mockExecutor = new MockGitExecutor();
      const commit = await mockExecutor.commit({ message: "test" });

      expect(commit.message).toBe("test");
      expect(commit.shortHash).toBeDefined();
    });
  });
});

describe("Semantic Diff Analysis", () => {
  let server: GitToolServer;
  let executor: TestGitExecutor;

  beforeEach(() => {
    executor = new TestGitExecutor();
    server = new GitToolServer({}, executor);
  });

  it("should categorize source files", async () => {
    executor.diffResult = [
      {
        file: "src/component.tsx",
        status: "modified",
        additions: 10,
        deletions: 5,
        binary: false,
        hunks: [],
      },
    ];

    const analysis = await server.semanticDiff();

    expect(analysis.categories.length).toBeGreaterThan(0);
  });

  it("should detect high risk changes", async () => {
    executor.diffResult = [
      {
        file: "src/core.ts",
        status: "modified",
        additions: 300,
        deletions: 250,
        binary: false,
        hunks: [],
      },
    ];

    const analysis = await server.semanticDiff();

    expect(analysis.riskLevel).toBe("high");
  });

  it("should detect medium risk changes", async () => {
    executor.diffResult = [
      {
        file: "src/utils.ts",
        status: "modified",
        additions: 80,
        deletions: 30,
        binary: false,
        hunks: [],
      },
    ];

    const analysis = await server.semanticDiff();

    expect(analysis.riskLevel).toBe("medium");
  });

  it("should detect low risk changes", async () => {
    executor.diffResult = [
      {
        file: "README.md",
        status: "modified",
        additions: 5,
        deletions: 2,
        binary: false,
        hunks: [],
      },
    ];

    const analysis = await server.semanticDiff();

    expect(analysis.riskLevel).toBe("low");
  });
});

describe("Commit Message Generation", () => {
  let server: GitToolServer;
  let executor: TestGitExecutor;

  beforeEach(() => {
    executor = new TestGitExecutor();
    server = new GitToolServer({}, executor);
  });

  it("should generate message for single file", async () => {
    executor.diffResult = [
      {
        file: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 5,
        binary: false,
        hunks: [],
      },
    ];

    const suggestion = await server.suggestCommitMessage();

    expect(suggestion.subject).toContain("index.ts");
    expect(suggestion.confidence).toBeGreaterThan(0);
  });

  it("should generate message for multiple files", async () => {
    executor.diffResult = [
      {
        file: "src/a.ts",
        status: "modified",
        additions: 5,
        deletions: 2,
        binary: false,
        hunks: [],
      },
      {
        file: "src/b.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        binary: false,
        hunks: [],
      },
    ];

    const suggestion = await server.suggestCommitMessage();

    expect(suggestion.subject).toContain("2 files");
    expect(suggestion.body).toBeDefined();
  });

  it("should return empty commit message for no changes", async () => {
    executor.diffResult = [];

    const suggestion = await server.suggestCommitMessage();

    expect(suggestion.subject).toContain("empty");
    expect(suggestion.confidence).toBeLessThan(0.5);
  });
});
