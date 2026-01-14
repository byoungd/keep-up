import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPendingConfirmation,
  listPendingTaskConfirmations,
  resolvePendingConfirmation,
} from "../confirmationStore";

const createWorkspaceRoot = () =>
  path.join(tmpdir(), `keepup-confirmations-${Date.now()}-${Math.random().toString(36).slice(2)}`);

describe("confirmationStore", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    workspaceRoot = createWorkspaceRoot();
    process.env.KEEPUP_WORKSPACE_ROOT = workspaceRoot;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.KEEPUP_WORKSPACE_ROOT = undefined;
    return fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("resolves pending confirmations", async () => {
    const { confirmationId, promise } = await createPendingConfirmation({ requestId: "req-1" });
    const result = await resolvePendingConfirmation({
      confirmationId,
      confirmed: true,
      requestId: "req-1",
    });

    expect(result.status).toBe("resolved");
    await expect(promise).resolves.toBe(true);
  });

  it("returns not_found for unknown confirmations", async () => {
    const result = await resolvePendingConfirmation({
      confirmationId: "missing",
      confirmed: false,
    });

    expect(result.status).toBe("not_found");
  });

  it("expires confirmations after the timeout", async () => {
    const { confirmationId, promise } = await createPendingConfirmation({
      requestId: "req-2",
      timeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(promise).resolves.toBe(false);
    const result = await resolvePendingConfirmation({
      confirmationId,
      confirmed: true,
      requestId: "req-2",
    });

    expect(result.status).toBe("expired");
  });

  it("lists pending task confirmations for stream recovery", async () => {
    const { confirmationId } = await createPendingConfirmation({
      requestId: "req-3",
      metadata: {
        taskId: "task-123",
        toolName: "write_file",
        description: "Write README",
        risk: "high",
        arguments: { path: "README.md" },
      },
    });

    await createPendingConfirmation({
      requestId: "req-4",
      metadata: {
        toolName: "bash",
        description: "No task metadata",
        risk: "low",
        arguments: { command: "ls" },
      },
    });

    const pending = await listPendingTaskConfirmations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      confirmationId,
      requestId: "req-3",
      taskId: "task-123",
      toolName: "write_file",
      risk: "high",
    });
    expect(pending[0]?.arguments).toEqual({ path: "README.md" });
  });
});
