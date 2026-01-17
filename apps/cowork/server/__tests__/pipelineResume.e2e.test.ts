import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPipelineRunner } from "../pipelines/pipelineRunner";
import type { PipelineDefinition, PipelineRunRecord } from "../pipelines/pipelineSchema";
import { createPipelineStore } from "../pipelines/pipelineStore";
import { closeDatabase } from "../storage/database";

async function waitForRun(
  store: Awaited<ReturnType<typeof createPipelineStore>>,
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

describe("Pipeline resume (e2e)", () => {
  let stateDir = "";
  let originalStateDir: string | undefined;

  beforeAll(async () => {
    originalStateDir = process.env.COWORK_STATE_DIR;
    stateDir = await mkdtemp(join(tmpdir(), "cowork-pipeline-e2e-"));
    process.env.COWORK_STATE_DIR = stateDir;
  });

  afterAll(async () => {
    closeDatabase();
    if (originalStateDir) {
      process.env.COWORK_STATE_DIR = originalStateDir;
    } else {
      delete process.env.COWORK_STATE_DIR;
    }
    if (stateDir) {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it("resumes pending runs after restart", async () => {
    const store = await createPipelineStore();
    const now = Date.now();
    const pipeline: PipelineDefinition = {
      pipelineId: "pipeline-resume",
      name: "Resume Pipeline",
      description: "Ensures pending runs resume",
      version: "1.0.0",
      stages: [
        {
          stageId: "stage-1",
          name: "Echo",
          type: "command",
          command: `node -e "console.log('resume-ok')"`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    await store.createPipeline(pipeline);

    const run: PipelineRunRecord = {
      runId: "run-resume-1",
      pipelineId: pipeline.pipelineId,
      status: "pending",
      stageIndex: 0,
      input: { env: "e2e" },
      output: undefined,
      stageResults: pipeline.stages.map((stage) => ({
        stageId: stage.stageId,
        status: "pending",
        attempts: 0,
      })),
      createdAt: now,
      updatedAt: now,
    };
    await store.createRun(run);

    const resumedStore = await createPipelineStore();
    const runner = createPipelineRunner({ store: resumedStore });
    await runner.resumePendingRuns();

    const completed = await waitForRun(resumedStore, run.runId, "completed");
    expect(completed?.status).toBe("completed");
    expect(completed?.stageResults[0]?.status).toBe("completed");
  });
});
