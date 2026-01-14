import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createWorkspaceRoot = () =>
  path.join(tmpdir(), `keepup-taskstore-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe("taskStore", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = createWorkspaceRoot();
    process.env.KEEPUP_WORKSPACE_ROOT = workspaceRoot;
  });

  afterEach(async () => {
    process.env.KEEPUP_WORKSPACE_ROOT = undefined;
    vi.resetModules();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("marks in-flight tasks as cancelled after restart", async () => {
    const { recordTaskSnapshot, getArchivedTaskSnapshots } = await import("../taskStore");
    await recordTaskSnapshot({
      taskId: "task-1",
      name: "Background task",
      prompt: "do work",
      status: "running",
      progress: 40,
      createdAt: Date.now(),
    });

    const beforeRestart = await getArchivedTaskSnapshots();
    expect(beforeRestart[0]?.status).toBe("running");

    vi.resetModules();
    const { getArchivedTaskSnapshots: reloadSnapshots } = await import("../taskStore");
    const afterRestart = await reloadSnapshots();

    expect(afterRestart[0]?.status).toBe("cancelled");
    expect(afterRestart[0]?.error).toBe("Task interrupted by server restart.");
  });
});
