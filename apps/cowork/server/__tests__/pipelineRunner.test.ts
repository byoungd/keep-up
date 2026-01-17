import { describe, expect, it } from "vitest";
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
});
