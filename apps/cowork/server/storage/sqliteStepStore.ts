/**
 * SQLite-based task step store.
 */

import { getDatabase } from "./database";
import type { CoworkTaskStepRecord } from "./types";

export interface SqliteStepStore {
  getById(stepId: string): Promise<CoworkTaskStepRecord | null>;
  getByTask(taskId: string): Promise<CoworkTaskStepRecord[]>;
  create(step: CoworkTaskStepRecord): Promise<CoworkTaskStepRecord>;
  update(
    stepId: string,
    updater: (step: CoworkTaskStepRecord) => CoworkTaskStepRecord
  ): Promise<CoworkTaskStepRecord | null>;
}

export async function createSqliteStepStore(): Promise<SqliteStepStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO task_steps
    (step_id, task_id, name, input, additional_input, status, output, additional_output, artifacts, is_last, created_at, updated_at)
    VALUES ($stepId, $taskId, $name, $input, $additionalInput, $status, $output, $additionalOutput, $artifacts, $isLast, $createdAt, $updatedAt)
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM task_steps WHERE step_id = $stepId
  `);

  const selectByTaskStmt = db.prepare(`
    SELECT * FROM task_steps WHERE task_id = $taskId ORDER BY created_at ASC
  `);

  const updateStmt = db.prepare(`
    UPDATE task_steps
    SET name = $name,
        input = $input,
        additional_input = $additionalInput,
        status = $status,
        output = $output,
        additional_output = $additionalOutput,
        artifacts = $artifacts,
        is_last = $isLast,
        updated_at = $updatedAt
    WHERE step_id = $stepId
  `);

  function rowToStep(row: Record<string, unknown>): CoworkTaskStepRecord {
    return {
      stepId: row.step_id as string,
      taskId: row.task_id as string,
      name: row.name as string | undefined,
      input: row.input as string,
      additionalInput: parseMetadata(row.additional_input),
      status: row.status as CoworkTaskStepRecord["status"],
      output: row.output as string | undefined,
      additionalOutput: parseMetadata(row.additional_output),
      artifacts: parseArtifacts(row.artifacts),
      isLast: Boolean(row.is_last),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  function getById(stepId: string): CoworkTaskStepRecord | null {
    const row = selectByIdStmt.get({ $stepId: stepId }) as Record<string, unknown> | null;
    return row ? rowToStep(row) : null;
  }

  return {
    async getById(stepId: string): Promise<CoworkTaskStepRecord | null> {
      return getById(stepId);
    },

    async getByTask(taskId: string): Promise<CoworkTaskStepRecord[]> {
      const rows = selectByTaskStmt.all({ $taskId: taskId }) as Record<string, unknown>[];
      return rows.map(rowToStep);
    },

    async create(step: CoworkTaskStepRecord): Promise<CoworkTaskStepRecord> {
      insertStmt.run({
        $stepId: step.stepId,
        $taskId: step.taskId,
        $name: step.name ?? null,
        $input: step.input,
        $additionalInput: JSON.stringify(step.additionalInput ?? {}),
        $status: step.status,
        $output: step.output ?? null,
        $additionalOutput: JSON.stringify(step.additionalOutput ?? {}),
        $artifacts: JSON.stringify(step.artifacts ?? []),
        $isLast: step.isLast ? 1 : 0,
        $createdAt: step.createdAt,
        $updatedAt: step.updatedAt,
      });
      return step;
    },

    async update(
      stepId: string,
      updater: (step: CoworkTaskStepRecord) => CoworkTaskStepRecord
    ): Promise<CoworkTaskStepRecord | null> {
      const existing = getById(stepId);
      if (!existing) {
        return null;
      }
      const updated = updater(existing);
      updateStmt.run({
        $stepId: updated.stepId,
        $name: updated.name ?? null,
        $input: updated.input,
        $additionalInput: JSON.stringify(updated.additionalInput ?? {}),
        $status: updated.status,
        $output: updated.output ?? null,
        $additionalOutput: JSON.stringify(updated.additionalOutput ?? {}),
        $artifacts: JSON.stringify(updated.artifacts ?? []),
        $isLast: updated.isLast ? 1 : 0,
        $updatedAt: updated.updatedAt,
      });
      return updated;
    },
  };
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseArtifacts(raw: unknown): string[] {
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
