import type { ToolExecutor } from "@ku0/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { createPipelineRunner } from "../pipelines/pipelineRunner";
import type { PipelineDefinition, PipelineRunRecord } from "../pipelines/pipelineSchema";
import type { PipelineStore } from "../pipelines/pipelineStore";

class MemoryPipelineStore implements PipelineStore {
  private readonly pipelines = new Map<string, PipelineDefinition>();
  private readonly runs = new Map<string, PipelineRunRecord>();

  async getAllPipelines(): Promise<PipelineDefinition[]> {
    return Array.from(this.pipelines.values());
  }

  async getPipelineById(pipelineId: string): Promise<PipelineDefinition | null> {
    return this.pipelines.get(pipelineId) ?? null;
  }

  async createPipeline(input: PipelineDefinition): Promise<PipelineDefinition> {
    this.pipelines.set(input.pipelineId, input);
    return input;
  }

  async updatePipeline(
    pipelineId: string,
    updater: (pipeline: PipelineDefinition) => PipelineDefinition
  ): Promise<PipelineDefinition | null> {
    const existing = this.pipelines.get(pipelineId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.pipelines.set(pipelineId, updated);
    return updated;
  }

  async createRun(run: PipelineRunRecord): Promise<PipelineRunRecord> {
    this.runs.set(run.runId, run);
    return run;
  }

  async updateRun(
    runId: string,
    updater: (run: PipelineRunRecord) => PipelineRunRecord
  ): Promise<PipelineRunRecord | null> {
    const existing = this.runs.get(runId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.runs.set(runId, updated);
    return updated;
  }

  async getRunById(runId: string): Promise<PipelineRunRecord | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRunsByStatus(statuses: PipelineRunRecord["status"][]): Promise<PipelineRunRecord[]> {
    return Array.from(this.runs.values()).filter((run) => statuses.includes(run.status));
  }
}

async function waitForRun(
  store: PipelineStore,
  runId: string,
  status: PipelineRunRecord["status"]
): Promise<PipelineRunRecord | null> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const run = await store.getRunById(runId);
    if (run && run.status === status) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return store.getRunById(runId);
}

describe("PipelineRunner", () => {
  it("throws when starting a run for a missing pipeline", async () => {
    const store = new MemoryPipelineStore();
    const runner = createPipelineRunner({ store });

    await expect(runner.startRun("missing")).rejects.toThrow("Pipeline not found");
  });

  it("executes command stages and marks run complete", async () => {
    const store = new MemoryPipelineStore();
    const runner = createPipelineRunner({ store });
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-1",
      name: "Smoke Pipeline",
      description: "Runs a simple command",
      version: "1.0.0",
      stages: [
        {
          stageId: "stage-1",
          name: "Echo",
          type: "command",
          command: `node -e "console.log('ok')"`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const run = await runner.startRun(pipeline.pipelineId, { env: "test" });
    const completed = await waitForRun(store, run.runId, "completed");

    expect(completed?.status).toBe("completed");
    expect(completed?.stageResults[0]?.status).toBe("completed");
  });

  it("fails a tool stage when the executor is missing", async () => {
    const store = new MemoryPipelineStore();
    const runner = createPipelineRunner({ store });
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-tool-missing",
      name: "Tool Stage Pipeline",
      description: "Runs a tool without an executor",
      version: "1.0.0",
      stages: [
        {
          stageId: "stage-1",
          name: "Tool",
          type: "tool",
          toolName: "tool:noop",
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const run = await runner.startRun(pipeline.pipelineId);
    const failed = await waitForRun(store, run.runId, "failed");

    expect(failed?.status).toBe("failed");
    expect(failed?.stageResults[0]?.status).toBe("failed");
    expect(failed?.stageResults[0]?.error).toBe("Tool executor not configured");
  });

  it("retries tool stages and succeeds after a retry", async () => {
    const store = new MemoryPipelineStore();
    let attempts = 0;
    const execute = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          success: false,
          content: [],
          error: { code: "EXECUTION_FAILED", message: "boom" },
        };
      }
      return {
        success: true,
        content: [{ type: "text", text: "ok" }],
      };
    });
    const toolExecutor: ToolExecutor = { execute };
    const runner = createPipelineRunner({ store, toolExecutor });
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-tool-retry",
      name: "Retry Pipeline",
      description: "Retries tool execution",
      version: "1.0.0",
      stages: [
        {
          stageId: "stage-1",
          name: "Tool",
          type: "tool",
          toolName: "tool:retry",
          retry: { maxAttempts: 2, backoffMs: 0 },
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const run = await runner.startRun(pipeline.pipelineId);
    const completed = await waitForRun(store, run.runId, "completed");

    expect(completed?.status).toBe("completed");
    expect(completed?.stageResults[0]?.attempts).toBe(2);
    expect(completed?.stageResults[0]?.status).toBe("completed");
    expect(completed?.stageResults[0]?.output).toContain("ok");
  });

  it("truncates oversized command output", async () => {
    const store = new MemoryPipelineStore();
    const runner = createPipelineRunner({ store, maxOutputBytes: 128 });
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-output-truncation",
      name: "Output Pipeline",
      description: "Truncates command output",
      version: "1.0.0",
      stages: [
        {
          stageId: "stage-1",
          name: "Spam",
          type: "command",
          command: `node -e "process.stdout.write('a'.repeat(2048))"`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const run = await runner.startRun(pipeline.pipelineId);
    const completed = await waitForRun(store, run.runId, "completed");

    expect(completed?.status).toBe("completed");
    expect(completed?.stageResults[0]?.status).toBe("completed");
    expect(completed?.stageResults[0]?.output).toContain("[output truncated]");
  });
});
