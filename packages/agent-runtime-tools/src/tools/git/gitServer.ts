/**
 * Git Tool Server Implementation
 *
 * MCP-compatible tool server for git operations.
 */

import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
} from "@ku0/agent-runtime-core";
import type {
  CommitOptions,
  ConflictInfo,
  ConflictStrategy,
  DiffCategory,
  GeneratedCommitMessage,
  GitBranch,
  GitCommit,
  GitConfig,
  GitDiff,
  GitStash,
  GitStatus,
  IGitOperations,
  SemanticDiffAnalysis,
} from "./types";

// ============================================================================
// Git Tool Server
// ============================================================================

/**
 * MCP tool server for git operations.
 */
export class GitToolServer implements MCPToolServer, IGitOperations {
  readonly name = "git";
  readonly version = "1.0.0";
  readonly description = "Git operations with intelligent diff analysis";

  private readonly executor: IGitExecutor;

  constructor(_config: Partial<GitConfig> = {}, executor?: IGitExecutor) {
    this.executor = executor ?? new MockGitExecutor();
  }

  listTools(): MCPTool[] {
    return [
      {
        name: "status",
        description: "Get repository status (branch, staged, modified, untracked files)",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "diff",
        description: "Get diff of changes (working tree or staged)",
        inputSchema: {
          type: "object",
          properties: {
            staged: {
              type: "boolean",
              description: "Show staged changes only",
            },
            file: {
              type: "string",
              description: "Show diff for specific file",
            },
          },
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "add",
        description: "Stage files for commit",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
              description: "Files to stage (use '.' for all)",
            },
          },
          required: ["files"],
        },
        annotations: {
          requiresConfirmation: false,
          policyAction: "connector.action",
        },
      },
      {
        name: "commit",
        description: "Commit staged changes",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Commit message",
            },
            all: {
              type: "boolean",
              description: "Stage and commit all changes",
            },
            amend: {
              type: "boolean",
              description: "Amend previous commit",
            },
          },
          required: ["message"],
        },
        annotations: {
          requiresConfirmation: true,
          policyAction: "connector.action",
        },
      },
      {
        name: "log",
        description: "Show commit history",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum commits to show (default: 10)",
            },
            file: {
              type: "string",
              description: "Show history for specific file",
            },
          },
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "branches",
        description: "List branches",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "checkout",
        description: "Switch to a branch",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "Branch name",
            },
            create: {
              type: "boolean",
              description: "Create new branch",
            },
          },
          required: ["branch"],
        },
        annotations: {
          requiresConfirmation: true,
          policyAction: "connector.action",
        },
      },
      {
        name: "semantic_diff",
        description: "Get intelligent analysis of changes",
        inputSchema: {
          type: "object",
          properties: {
            staged: {
              type: "boolean",
              description: "Analyze staged changes only",
            },
          },
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "suggest_commit",
        description: "Generate a commit message suggestion based on changes",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "conflicts",
        description: "Detect and list merge conflicts",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          policyAction: "connector.read",
        },
      },
      {
        name: "resolve_conflict",
        description: "Resolve a merge conflict",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "File with conflict",
            },
            strategy: {
              type: "string",
              enum: ["ours", "theirs", "merge"],
              description: "Resolution strategy",
            },
          },
          required: ["file", "strategy"],
        },
        annotations: {
          requiresConfirmation: true,
          policyAction: "connector.action",
        },
      },
    ];
  }

  async callTool(call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    try {
      const args = call.arguments ?? {};

      switch (call.name) {
        case "status":
          return await this.handleStatus();

        case "diff":
          return await this.handleDiff(args as { staged?: boolean; file?: string });

        case "add":
          return await this.handleAdd(args as { files: string | string[] });

        case "commit":
          return await this.handleCommit(args as unknown as CommitOptions);

        case "log":
          return await this.handleLog(args as { limit?: number; file?: string });

        case "branches":
          return await this.handleBranches();

        case "checkout":
          return await this.handleCheckout(args as { branch: string; create?: boolean });

        case "semantic_diff":
          return await this.handleSemanticDiff(args as { staged?: boolean });

        case "suggest_commit":
          return await this.handleSuggestCommit();

        case "conflicts":
          return await this.handleConflicts();

        case "resolve_conflict":
          return await this.handleResolveConflict(
            args as { file: string; strategy: ConflictStrategy }
          );

        default:
          return {
            success: false,
            content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
            error: { code: "RESOURCE_NOT_FOUND", message: `Unknown tool: ${call.name}` },
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: "text", text: `Git error: ${message}` }],
        error: { code: "EXECUTION_FAILED", message },
      };
    }
  }

  // ============================================================================
  // IGitOperations Implementation
  // ============================================================================

  async status(): Promise<GitStatus> {
    return this.executor.status();
  }

  async diff(options?: { staged?: boolean; file?: string }): Promise<GitDiff[]> {
    return this.executor.diff(options);
  }

  async add(files: string | string[]): Promise<void> {
    return this.executor.add(files);
  }

  async reset(files: string | string[]): Promise<void> {
    return this.executor.reset(files);
  }

  async commit(options: CommitOptions): Promise<GitCommit> {
    return this.executor.commit(options);
  }

  async log(options?: { limit?: number; file?: string }): Promise<GitCommit[]> {
    return this.executor.log(options);
  }

  async branches(): Promise<GitBranch[]> {
    return this.executor.branches();
  }

  async checkout(branch: string, options?: { create?: boolean }): Promise<void> {
    return this.executor.checkout(branch, options);
  }

  async pull(options?: { rebase?: boolean }): Promise<void> {
    return this.executor.pull(options);
  }

  async push(options?: { force?: boolean; setUpstream?: string }): Promise<void> {
    return this.executor.push(options);
  }

  async stash(message?: string): Promise<GitStash> {
    return this.executor.stash(message);
  }

  async stashPop(index?: number): Promise<void> {
    return this.executor.stashPop(index);
  }

  async semanticDiff(options?: { staged?: boolean }): Promise<SemanticDiffAnalysis> {
    const diffs = await this.diff(options);
    return analyzeSemanticDiff(diffs);
  }

  async suggestCommitMessage(diffs?: GitDiff[]): Promise<GeneratedCommitMessage> {
    const diffData = diffs ?? (await this.diff({ staged: true }));
    return generateCommitMessage(diffData);
  }

  async detectConflicts(): Promise<ConflictInfo[]> {
    return this.executor.detectConflicts();
  }

  async resolveConflict(file: string, strategy: ConflictStrategy): Promise<void> {
    return this.executor.resolveConflict(file, strategy);
  }

  // ============================================================================
  // Tool Handlers
  // ============================================================================

  private async handleStatus(): Promise<MCPToolResult> {
    const status = await this.status();

    const lines: string[] = [
      `Branch: ${status.branch}`,
      status.upstream ? `Upstream: ${status.upstream} (${status.ahead}↑ ${status.behind}↓)` : "",
      "",
    ];

    if (status.staged.length > 0) {
      lines.push("Staged:");
      for (const file of status.staged) {
        lines.push(`  ${file.status}: ${file.path}`);
      }
    }

    if (status.modified.length > 0) {
      lines.push("Modified:");
      for (const file of status.modified) {
        lines.push(`  ${file.status}: ${file.path}`);
      }
    }

    if (status.untracked.length > 0) {
      lines.push("Untracked:");
      for (const file of status.untracked) {
        lines.push(`  ${file}`);
      }
    }

    if (status.conflicted.length > 0) {
      lines.push("Conflicts:");
      for (const file of status.conflicted) {
        lines.push(`  ${file.path}`);
      }
    }

    if (status.clean) {
      lines.push("Working tree clean");
    }

    return {
      success: true,
      content: [{ type: "text", text: lines.filter(Boolean).join("\n") }],
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles diff generation with multiple options and outputs
  private async handleDiff(options: { staged?: boolean; file?: string }): Promise<MCPToolResult> {
    const diffs = await this.diff(options);

    if (diffs.length === 0) {
      return {
        success: true,
        content: [{ type: "text", text: "No changes" }],
      };
    }

    const lines: string[] = [];
    for (const diff of diffs) {
      lines.push(`--- ${diff.oldPath ?? diff.file}`);
      lines.push(`+++ ${diff.file}`);
      lines.push(`Status: ${diff.status} (+${diff.additions} -${diff.deletions})`);

      if (!diff.binary) {
        for (const hunk of diff.hunks) {
          lines.push(
            `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${hunk.header ? ` ${hunk.header}` : ""}`
          );

          for (const line of hunk.lines) {
            const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
            lines.push(`${prefix}${line.content}`);
          }
        }
      } else {
        lines.push("(binary file)");
      }
      lines.push("");
    }

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleAdd(args: { files: string | string[] }): Promise<MCPToolResult> {
    await this.add(args.files);
    const files = Array.isArray(args.files) ? args.files : [args.files];

    return {
      success: true,
      content: [{ type: "text", text: `Staged: ${files.join(", ")}` }],
    };
  }

  private async handleCommit(args: CommitOptions): Promise<MCPToolResult> {
    const commit = await this.commit(args);

    return {
      success: true,
      content: [
        {
          type: "text",
          text: `Committed: ${commit.shortHash} ${commit.message}`,
        },
      ],
    };
  }

  private async handleLog(args: { limit?: number; file?: string }): Promise<MCPToolResult> {
    const commits = await this.log(args);

    const lines = commits.map(
      (c) => `${c.shortHash} ${c.date.toISOString().split("T")[0]} ${c.author}: ${c.message}`
    );

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleBranches(): Promise<MCPToolResult> {
    const branches = await this.branches();

    const lines = branches.map((b) => {
      const current = b.current ? "* " : "  ";
      const remote = b.remote ? ` -> ${b.remote}/${b.upstream}` : "";
      const sync =
        b.ahead !== undefined || b.behind !== undefined
          ? ` [${b.ahead ?? 0}↑ ${b.behind ?? 0}↓]`
          : "";
      return `${current}${b.name}${remote}${sync}`;
    });

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleCheckout(args: { branch: string; create?: boolean }): Promise<MCPToolResult> {
    await this.checkout(args.branch, { create: args.create });

    return {
      success: true,
      content: [
        {
          type: "text",
          text: args.create
            ? `Created and switched to branch: ${args.branch}`
            : `Switched to branch: ${args.branch}`,
        },
      ],
    };
  }

  private async handleSemanticDiff(args: { staged?: boolean }): Promise<MCPToolResult> {
    const analysis = await this.semanticDiff(args);

    const lines: string[] = [
      "## Summary",
      analysis.summary,
      "",
      `Risk Level: ${analysis.riskLevel}`,
      "",
    ];

    if (analysis.categories.length > 0) {
      lines.push("## Categories");
      for (const cat of analysis.categories) {
        lines.push(`- ${cat.type}: ${cat.name} (${cat.files.length} files)`);
      }
    }

    if (analysis.affectedSymbols.length > 0) {
      lines.push("");
      lines.push("## Affected Symbols");
      for (const symbol of analysis.affectedSymbols.slice(0, 10)) {
        lines.push(`- ${symbol}`);
      }
    }

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleSuggestCommit(): Promise<MCPToolResult> {
    const suggestion = await this.suggestCommitMessage();

    const lines: string[] = ["## Suggested Commit Message", "", suggestion.subject];

    if (suggestion.body) {
      lines.push("");
      lines.push(suggestion.body);
    }

    lines.push("");
    lines.push(`Type: ${suggestion.type ?? "chore"}`);
    lines.push(`Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`);

    if (suggestion.breaking) {
      lines.push("⚠️ Breaking change");
    }

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleConflicts(): Promise<MCPToolResult> {
    const conflicts = await this.detectConflicts();

    if (conflicts.length === 0) {
      return {
        success: true,
        content: [{ type: "text", text: "No conflicts detected" }],
      };
    }

    const lines: string[] = [`Found ${conflicts.length} conflicts:`];
    for (const conflict of conflicts) {
      lines.push(`\n## ${conflict.file}`);
      lines.push(`Markers: ${conflict.markers.length}`);
    }

    return {
      success: true,
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }

  private async handleResolveConflict(args: {
    file: string;
    strategy: ConflictStrategy;
  }): Promise<MCPToolResult> {
    await this.resolveConflict(args.file, args.strategy);

    return {
      success: true,
      content: [
        {
          type: "text",
          text: `Resolved conflict in ${args.file} using ${args.strategy} strategy`,
        },
      ],
    };
  }
}

// ============================================================================
// Git Executor Interface
// ============================================================================

/**
 * Interface for git command execution.
 */
export interface IGitExecutor extends IGitOperations {}

// ============================================================================
// Mock Git Executor
// ============================================================================

/**
 * Mock git executor for testing.
 */
export class MockGitExecutor implements IGitExecutor {
  async status(): Promise<GitStatus> {
    return {
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
  }

  async diff(_options?: { staged?: boolean; file?: string }): Promise<GitDiff[]> {
    return [];
  }

  async add(_files: string | string[]): Promise<void> {
    // Mock implementation
  }

  async reset(_files: string | string[]): Promise<void> {
    // Mock implementation
  }

  async commit(options: CommitOptions): Promise<GitCommit> {
    return {
      hash: "abc123def456",
      shortHash: "abc123d",
      message: options.message,
      author: "Test User",
      authorEmail: "test@example.com",
      date: new Date(),
      parents: [],
    };
  }

  async log(_options?: { limit?: number; file?: string }): Promise<GitCommit[]> {
    return [];
  }

  async branches(): Promise<GitBranch[]> {
    return [{ name: "main", current: true }];
  }

  async checkout(_branch: string, _options?: { create?: boolean }): Promise<void> {
    // Mock implementation
  }

  async pull(_options?: { rebase?: boolean }): Promise<void> {
    // Mock implementation
  }

  async push(_options?: { force?: boolean; setUpstream?: string }): Promise<void> {
    // Mock implementation
  }

  async stash(message?: string): Promise<GitStash> {
    return {
      index: 0,
      message: message ?? "WIP",
      branch: "main",
      date: new Date(),
    };
  }

  async stashPop(_index?: number): Promise<void> {
    // Mock implementation
  }

  async semanticDiff(_options?: { staged?: boolean }): Promise<SemanticDiffAnalysis> {
    return {
      summary: "No changes",
      categories: [],
      affectedSymbols: [],
      riskLevel: "low",
    };
  }

  async suggestCommitMessage(_diffs?: GitDiff[]): Promise<GeneratedCommitMessage> {
    return {
      subject: "chore: update files",
      confidence: 0.5,
      type: "chore",
    };
  }

  async detectConflicts(): Promise<ConflictInfo[]> {
    return [];
  }

  async resolveConflict(_file: string, _strategy: ConflictStrategy): Promise<void> {
    // Mock implementation
  }
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/**
 * Analyze diffs semantically.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: semantic diff analysis considers multiple scoring paths
function analyzeSemanticDiff(diffs: GitDiff[]): SemanticDiffAnalysis {
  if (diffs.length === 0) {
    return {
      summary: "No changes",
      categories: [],
      affectedSymbols: [],
      riskLevel: "low",
    };
  }

  const categories: Map<string, { type: DiffCategory["type"]; files: string[] }> = new Map();
  const affectedSymbols: string[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const diff of diffs) {
    totalAdditions += diff.additions;
    totalDeletions += diff.deletions;

    // Categorize by file type
    const ext = diff.file.split(".").pop() ?? "";
    let category = "other";
    let type: DiffCategory["type"] = "chore";

    if (["ts", "tsx", "js", "jsx"].includes(ext)) {
      category = "source";
      type = "feature";
    } else if (["test.ts", "spec.ts"].some((s) => diff.file.includes(s))) {
      category = "tests";
      type = "test";
    } else if (["md", "mdx"].includes(ext)) {
      category = "docs";
      type = "docs";
    } else if (["css", "scss"].includes(ext)) {
      category = "styles";
      type = "style";
    }

    const existing = categories.get(category);
    if (existing) {
      existing.files.push(diff.file);
    } else {
      categories.set(category, { type, files: [diff.file] });
    }

    // Extract affected symbols from hunk headers
    for (const hunk of diff.hunks) {
      if (hunk.header) {
        affectedSymbols.push(hunk.header);
      }
    }
  }

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" = "low";
  if (totalAdditions + totalDeletions > 500) {
    riskLevel = "high";
  } else if (totalAdditions + totalDeletions > 100) {
    riskLevel = "medium";
  }

  return {
    summary: `${diffs.length} files changed (+${totalAdditions} -${totalDeletions})`,
    categories: Array.from(categories.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      files: data.files,
    })),
    affectedSymbols: [...new Set(affectedSymbols)],
    riskLevel,
  };
}

/**
 * Generate commit message from diffs.
 */
function generateCommitMessage(diffs: GitDiff[]): GeneratedCommitMessage {
  if (diffs.length === 0) {
    return {
      subject: "chore: empty commit",
      confidence: 0.3,
      type: "chore",
    };
  }

  const analysis = analyzeSemanticDiff(diffs);

  // Determine primary type
  const typeMap: Record<string, number> = {};
  for (const cat of analysis.categories) {
    typeMap[cat.type] = (typeMap[cat.type] ?? 0) + cat.files.length;
  }

  let primaryType: "feat" | "fix" | "docs" | "style" | "refactor" | "test" | "chore" = "chore";
  let maxCount = 0;
  for (const [type, count] of Object.entries(typeMap)) {
    if (count > maxCount) {
      maxCount = count;
      primaryType = type as typeof primaryType;
    }
  }

  // Generate subject
  let subject = "";
  if (diffs.length === 1) {
    const file = diffs[0].file.split("/").pop() ?? diffs[0].file;
    subject = `${primaryType}: update ${file}`;
  } else {
    subject = `${primaryType}: update ${diffs.length} files`;
  }

  // Generate body
  let body: string | undefined;
  if (diffs.length > 1) {
    body = `Files changed:\n${diffs.map((d) => `- ${d.file}`).join("\n")}`;
  }

  return {
    subject,
    body,
    confidence: 0.7,
    type: primaryType,
    breaking: false,
  };
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a git tool server.
 */
export function createGitToolServer(
  config?: Partial<GitConfig>,
  executor?: IGitExecutor
): GitToolServer {
  return new GitToolServer(config, executor);
}
