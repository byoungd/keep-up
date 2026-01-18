/**
 * Cowork Runtime Tests
 */

import { describe, expect, it, vi } from "vitest";
import { CoworkRuntime } from "../cowork/runtime";
import type { AgentOrchestrator } from "../orchestrator/orchestrator";
import { createAuditLogger } from "../security";
import { createTaskQueue } from "../tasks";
import type { AgentState } from "../types";

describe("CoworkRuntime", () => {
  it("enqueues tasks and exposes summaries", async () => {
    const queue = createTaskQueue({ maxConcurrent: 1 });
    const auditLogger = createAuditLogger();
    let resolveRun: (() => void) | null = null;
    let resolveStarted: (() => void) | null = null;

    const runStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });

    const orchestrator = {
      runWithRunId: vi.fn(async () => {
        resolveStarted?.();
        await new Promise<void>((resolve) => {
          resolveRun = resolve;
        });
        return {
          turn: 0,
          messages: [],
          pendingToolCalls: [],
          status: "complete",
          agentId: "agent-test",
        } satisfies AgentState;
      }),
    } as unknown as AgentOrchestrator;

    const runtime = new CoworkRuntime({
      orchestrator,
      taskQueue: queue,
      auditLogger,
      outputRoots: ["/outputs"],
    });

    const taskId = await runtime.enqueueTask("Generate report", "Report Task");
    await runStarted;

    auditLogger.log({
      timestamp: 1,
      toolName: "file:write",
      action: "result",
      input: { path: "/outputs/report.md" },
      sandboxed: true,
      correlationId: taskId,
    });

    resolveRun?.();

    const result = await runtime.waitForTask(taskId);

    expect(orchestrator.runWithRunId).toHaveBeenCalledWith("Generate report", taskId);
    expect(result?.runId).toBe(taskId);
    expect(result?.summary?.outputs).toEqual([{ path: "/outputs/report.md", kind: "document" }]);
    expect(runtime.getTaskSummary(taskId)).toEqual(result?.summary);
  });
});
