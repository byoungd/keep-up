/**
 * Cowork Task Runner Tests
 */

import { describe, expect, it, vi } from "vitest";
import { type CoworkAgentTaskResult, CoworkTaskRunner } from "../cowork/taskRunner";
import type { AgentOrchestrator } from "../orchestrator/orchestrator";
import { createAuditLogger } from "../security";
import { createTaskQueue } from "../tasks";
import type { AgentState } from "../types";

describe("CoworkTaskRunner", () => {
  it("builds summaries from audit entries", async () => {
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

    const runner = new CoworkTaskRunner({
      queue,
      orchestrator,
      auditLogger,
      outputRoots: ["/outputs"],
    });

    const taskId = await runner.enqueueTask("Generate report");
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

    const result = await queue.waitFor<CoworkAgentTaskResult>(taskId);
    const summary = result.value?.summary;

    expect(summary?.outputs).toEqual([{ path: "/outputs/report.md", kind: "document" }]);
  });
});
