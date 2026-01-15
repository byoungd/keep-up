/**
 * SQLite-based task store.
 * Drop-in replacement for JsonStore-based taskStore.
 */

import type { CoworkTask } from "@ku0/agent-runtime";
import { getDatabase } from "./database";

export interface SqliteTaskStore {
  getAll(): Promise<CoworkTask[]>;
  getById(taskId: string): Promise<CoworkTask | null>;
  getBySession(sessionId: string): Promise<CoworkTask[]>;
  create(task: CoworkTask): Promise<CoworkTask>;
  update(taskId: string, updater: (task: CoworkTask) => CoworkTask): Promise<CoworkTask | null>;
  delete(taskId: string): Promise<boolean>;
}

export async function createSqliteTaskStore(): Promise<SqliteTaskStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO tasks (task_id, session_id, title, prompt, status, created_at, updated_at)
    VALUES ($taskId, $sessionId, $title, $prompt, $status, $createdAt, $updatedAt)
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM tasks ORDER BY created_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM tasks WHERE task_id = $taskId
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM tasks WHERE session_id = $sessionId ORDER BY created_at ASC
  `);

  const updateStmt = db.prepare(`
    UPDATE tasks
    SET title = $title, prompt = $prompt, status = $status, updated_at = $updatedAt
    WHERE task_id = $taskId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM tasks WHERE task_id = $taskId
  `);

  function rowToTask(row: Record<string, unknown>): CoworkTask {
    return {
      taskId: row.task_id as string,
      sessionId: row.session_id as string,
      title: row.title as string,
      prompt: row.prompt as string,
      status: row.status as CoworkTask["status"],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  function getById(taskId: string): CoworkTask | null {
    const row = selectByIdStmt.get({ $taskId: taskId }) as Record<string, unknown> | null;
    return row ? rowToTask(row) : null;
  }

  return {
    async getAll(): Promise<CoworkTask[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToTask);
    },

    async getById(taskId: string): Promise<CoworkTask | null> {
      return getById(taskId);
    },

    async getBySession(sessionId: string): Promise<CoworkTask[]> {
      const rows = selectBySessionStmt.all({ $sessionId: sessionId }) as Record<string, unknown>[];
      return rows.map(rowToTask);
    },

    async create(task: CoworkTask): Promise<CoworkTask> {
      insertStmt.run({
        $taskId: task.taskId,
        $sessionId: task.sessionId,
        $title: task.title,
        $prompt: task.prompt,
        $status: task.status,
        $createdAt: task.createdAt,
        $updatedAt: task.updatedAt,
      });
      return task;
    },

    async update(
      taskId: string,
      updater: (task: CoworkTask) => CoworkTask
    ): Promise<CoworkTask | null> {
      const existing = getById(taskId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      updateStmt.run({
        $taskId: updated.taskId,
        $title: updated.title,
        $prompt: updated.prompt,
        $status: updated.status,
        $updatedAt: updated.updatedAt,
      });
      return updated;
    },

    async delete(taskId: string): Promise<boolean> {
      const result = deleteStmt.run({ $taskId: taskId });
      return result.changes > 0;
    },
  };
}
