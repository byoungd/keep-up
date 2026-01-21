import { SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import { describe, expect, it, vi } from "vitest";
import type { IGitExecutor } from "../gitServer";
import { GitToolServer } from "../gitServer";
import type { GitCommit, GitStash, GitStatus, SemanticDiffAnalysis } from "../types";

function createExecutor() {
  const status: GitStatus = {
    branch: "main",
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

  const commit: GitCommit = {
    hash: "abc",
    shortHash: "abc",
    message: "test",
    author: "tester",
    authorEmail: "tester@example.com",
    date: new Date(),
    parents: [],
  };

  const stash: GitStash = {
    index: 0,
    message: "stash",
    branch: "main",
    date: new Date(),
  };

  const semantic: SemanticDiffAnalysis = {
    summary: "none",
    categories: [],
    affectedSymbols: [],
    riskLevel: "low",
  };

  const executor = {
    status: vi.fn(async () => status),
    diff: vi.fn(async () => []),
    add: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    commit: vi.fn(async () => commit),
    log: vi.fn(async () => []),
    branches: vi.fn(async () => []),
    checkout: vi.fn(async () => undefined),
    pull: vi.fn(async () => undefined),
    push: vi.fn(async () => undefined),
    stash: vi.fn(async () => stash),
    stashPop: vi.fn(async () => undefined),
    semanticDiff: vi.fn(async () => semantic),
    suggestCommitMessage: vi.fn(async () => ({
      subject: "chore: update",
      confidence: 0.5,
      type: "chore",
    })),
    detectConflicts: vi.fn(async () => []),
    resolveConflict: vi.fn(async () => undefined),
  };

  return executor;
}

describe("GitToolServer", () => {
  const context: ToolContext = { security: SECURITY_PRESETS.safe };

  it("rejects add when files are missing", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool({ name: "add", arguments: { files: "   " } }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.add).not.toHaveBeenCalled();
  });

  it("rejects commit when message is missing", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool({ name: "commit", arguments: { message: " " } }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.commit).not.toHaveBeenCalled();
  });

  it("rejects checkout when branch is missing", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool({ name: "checkout", arguments: { branch: "" } }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.checkout).not.toHaveBeenCalled();
  });

  it("rejects invalid conflict strategy", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool(
      { name: "resolve_conflict", arguments: { file: "index.ts", strategy: "invalid" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.resolveConflict).not.toHaveBeenCalled();
  });

  it("normalizes log limits and validates file arguments", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool(
      { name: "log", arguments: { limit: 5.7, file: " README.md " } },
      context
    );

    expect(result.success).toBe(true);
    expect(executor.log).toHaveBeenCalledWith({ limit: 5, file: "README.md" });
  });

  it("rejects diff when file is invalid", async () => {
    const executor = createExecutor();
    const server = new GitToolServer({}, executor as unknown as IGitExecutor);

    const result = await server.callTool({ name: "diff", arguments: { file: 123 } }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.diff).not.toHaveBeenCalled();
  });
});
