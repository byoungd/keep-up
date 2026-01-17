import { getDatabase } from "../storage/database";
import type { PipelineDefinition, PipelineRunRecord, PipelineRunStatus } from "./pipelineSchema";
import { pipelineRunSchema, pipelineSchema } from "./pipelineSchema";

export interface PipelineStore {
  getAllPipelines(): Promise<PipelineDefinition[]>;
  getPipelineById(pipelineId: string): Promise<PipelineDefinition | null>;
  createPipeline(input: PipelineDefinition): Promise<PipelineDefinition>;
  updatePipeline(
    pipelineId: string,
    updater: (pipeline: PipelineDefinition) => PipelineDefinition
  ): Promise<PipelineDefinition | null>;
  createRun(run: PipelineRunRecord): Promise<PipelineRunRecord>;
  updateRun(
    runId: string,
    updater: (run: PipelineRunRecord) => PipelineRunRecord
  ): Promise<PipelineRunRecord | null>;
  getRunById(runId: string): Promise<PipelineRunRecord | null>;
  listRunsByStatus(statuses: PipelineRunStatus[]): Promise<PipelineRunRecord[]>;
}

export async function createPipelineStore(): Promise<PipelineStore> {
  const db = await getDatabase();

  const insertPipelineStmt = db.prepare(`
    INSERT INTO pipelines (
      pipeline_id,
      name,
      description,
      pipeline,
      created_at,
      updated_at
    ) VALUES (
      $pipelineId,
      $name,
      $description,
      $pipeline,
      $createdAt,
      $updatedAt
    )
  `);

  const updatePipelineStmt = db.prepare(`
    UPDATE pipelines
    SET name = $name,
      description = $description,
      pipeline = $pipeline,
      updated_at = $updatedAt
    WHERE pipeline_id = $pipelineId
  `);

  const selectPipelineStmt = db.prepare(`
    SELECT * FROM pipelines WHERE pipeline_id = $pipelineId
  `);

  const selectAllPipelinesStmt = db.prepare(`
    SELECT * FROM pipelines ORDER BY updated_at DESC
  `);

  const insertRunStmt = db.prepare(`
    INSERT INTO pipeline_runs (
      run_id,
      pipeline_id,
      status,
      stage_index,
      input,
      output,
      stage_results,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
    ) VALUES (
      $runId,
      $pipelineId,
      $status,
      $stageIndex,
      $input,
      $output,
      $stageResults,
      $error,
      $createdAt,
      $updatedAt,
      $startedAt,
      $completedAt
    )
  `);

  const updateRunStmt = db.prepare(`
    UPDATE pipeline_runs
    SET status = $status,
      stage_index = $stageIndex,
      input = $input,
      output = $output,
      stage_results = $stageResults,
      error = $error,
      updated_at = $updatedAt,
      started_at = $startedAt,
      completed_at = $completedAt
    WHERE run_id = $runId
  `);

  const selectRunStmt = db.prepare(`
    SELECT * FROM pipeline_runs WHERE run_id = $runId
  `);

  function rowToPipeline(row: Record<string, unknown>): PipelineDefinition {
    const parsed = JSON.parse(row.pipeline as string) as PipelineDefinition;
    return pipelineSchema.parse(parsed);
  }

  function rowToRun(row: Record<string, unknown>): PipelineRunRecord {
    const parsed: PipelineRunRecord = {
      runId: row.run_id as string,
      pipelineId: row.pipeline_id as string,
      status: row.status as PipelineRunRecord["status"],
      stageIndex: row.stage_index as number,
      input: row.input ? JSON.parse(row.input as string) : undefined,
      output: row.output ? JSON.parse(row.output as string) : undefined,
      stageResults: row.stage_results
        ? (JSON.parse(row.stage_results as string) as PipelineRunRecord["stageResults"])
        : [],
      error: row.error ? (row.error as string) : undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      startedAt: row.started_at ? (row.started_at as number) : undefined,
      completedAt: row.completed_at ? (row.completed_at as number) : undefined,
    };
    return pipelineRunSchema.parse(parsed);
  }

  async function getPipelineById(pipelineId: string): Promise<PipelineDefinition | null> {
    const row = selectPipelineStmt.get({ pipelineId }) as Record<string, unknown> | undefined;
    return row ? rowToPipeline(row) : null;
  }

  async function getRunById(runId: string): Promise<PipelineRunRecord | null> {
    const row = selectRunStmt.get({ runId }) as Record<string, unknown> | undefined;
    return row ? rowToRun(row) : null;
  }

  return {
    async getAllPipelines(): Promise<PipelineDefinition[]> {
      const rows = selectAllPipelinesStmt.all() as Record<string, unknown>[];
      return rows.map(rowToPipeline);
    },

    getPipelineById,

    async createPipeline(input: PipelineDefinition): Promise<PipelineDefinition> {
      const pipeline = pipelineSchema.parse(input);
      insertPipelineStmt.run({
        pipelineId: pipeline.pipelineId,
        name: pipeline.name,
        description: pipeline.description ?? "",
        pipeline: JSON.stringify(pipeline),
        createdAt: pipeline.createdAt,
        updatedAt: pipeline.updatedAt,
      });
      return pipeline;
    },

    async updatePipeline(
      pipelineId: string,
      updater: (pipeline: PipelineDefinition) => PipelineDefinition
    ): Promise<PipelineDefinition | null> {
      const existing = await getPipelineById(pipelineId);
      if (!existing) {
        return null;
      }
      const updated = pipelineSchema.parse(updater(existing));
      const updatedAt = Date.now();
      const next = { ...updated, updatedAt };
      updatePipelineStmt.run({
        pipelineId,
        name: next.name,
        description: next.description ?? "",
        pipeline: JSON.stringify(next),
        updatedAt,
      });
      return next;
    },

    async createRun(run: PipelineRunRecord): Promise<PipelineRunRecord> {
      const record = pipelineRunSchema.parse(run);
      insertRunStmt.run({
        runId: record.runId,
        pipelineId: record.pipelineId,
        status: record.status,
        stageIndex: record.stageIndex,
        input: record.input ? JSON.stringify(record.input) : null,
        output: record.output ? JSON.stringify(record.output) : null,
        stageResults: JSON.stringify(record.stageResults ?? []),
        error: record.error ?? null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        startedAt: record.startedAt ?? null,
        completedAt: record.completedAt ?? null,
      });
      return record;
    },

    async updateRun(
      runId: string,
      updater: (run: PipelineRunRecord) => PipelineRunRecord
    ): Promise<PipelineRunRecord | null> {
      const existing = await getRunById(runId);
      if (!existing) {
        return null;
      }
      const updated = pipelineRunSchema.parse(updater(existing));
      const updatedAt = Date.now();
      const next = { ...updated, updatedAt };
      updateRunStmt.run({
        runId,
        status: next.status,
        stageIndex: next.stageIndex,
        input: next.input ? JSON.stringify(next.input) : null,
        output: next.output ? JSON.stringify(next.output) : null,
        stageResults: JSON.stringify(next.stageResults ?? []),
        error: next.error ?? null,
        updatedAt,
        startedAt: next.startedAt ?? null,
        completedAt: next.completedAt ?? null,
      });
      return next;
    },

    getRunById,

    async listRunsByStatus(statuses: PipelineRunStatus[]): Promise<PipelineRunRecord[]> {
      if (statuses.length === 0) {
        return [];
      }
      const placeholders = statuses.map((_, index) => `$status${index}`).join(", ");
      const stmt = db.prepare(`SELECT * FROM pipeline_runs WHERE status IN (${placeholders})`);
      const params = Object.fromEntries(
        statuses.map((status, index) => [`status${index}`, status])
      );
      const rows = stmt.all(params) as Record<string, unknown>[];
      return rows.map(rowToRun);
    },
  };
}
