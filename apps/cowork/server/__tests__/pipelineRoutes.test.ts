import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createPipelineRunner } from "../pipelines/pipelineRunner";
import type { PipelineDefinition, PipelineRunRecord } from "../pipelines/pipelineSchema";
import type { PipelineStore } from "../pipelines/pipelineStore";
import { createPipelineRoutes } from "../routes/pipelines";

class MockPipelineStore implements PipelineStore {
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

describe("Pipeline routes", () => {
  let app: Hono;
  let store: MockPipelineStore;

  beforeEach(() => {
    store = new MockPipelineStore();
    const runner = createPipelineRunner({ store });
    app = createPipelineRoutes({ store, runner });
  });

  it("creates and lists pipelines", async () => {
    const res = await app.request("/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Pipeline",
        description: "Runs a stage",
        stages: [
          {
            stageId: "stage-1",
            name: "Command",
            type: "command",
            command: "echo ok",
          },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const list = await app.request("/pipelines");
    expect(list.status).toBe(200);
    const data = (await list.json()) as { pipelines: PipelineDefinition[] };
    expect(data.pipelines.length).toBe(1);
  });

  it("runs pipelines via run and webhook endpoints", async () => {
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-1",
      name: "Test Pipeline",
      description: "Runs a stage",
      stages: [
        {
          stageId: "stage-1",
          name: "Command",
          type: "command",
          command: "echo ok",
        },
      ],
      version: "1.0.0",
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const runRes = await app.request("/pipelines/pipeline-1/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { key: "value" } }),
    });
    expect(runRes.status).toBe(202);

    const webhookRes = await app.request("/pipelines/triggers/webhook/pipeline-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "ping" }),
    });
    expect(webhookRes.status).toBe(202);
  });
});
