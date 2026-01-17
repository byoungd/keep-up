/**
 * SQLite-based artifact store.
 * Drop-in replacement for JsonStore-based artifactStore.
 */

import { getDatabase } from "./database";
import type { CoworkArtifactRecord } from "./types";

export interface SqliteArtifactStore {
  getAll(): Promise<CoworkArtifactRecord[]>;
  getById(artifactId: string): Promise<CoworkArtifactRecord | null>;
  getBySession(sessionId: string): Promise<CoworkArtifactRecord[]>;
  getByTask(taskId: string): Promise<CoworkArtifactRecord[]>;
  upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord>;
  delete(artifactId: string): Promise<boolean>;
}

function parseArtifactPayload(raw: unknown): CoworkArtifactRecord["artifact"] {
  if (typeof raw !== "string") {
    return { type: "markdown", content: "" };
  }
  try {
    return JSON.parse(raw) as CoworkArtifactRecord["artifact"];
  } catch {
    return { type: "markdown", content: "" };
  }
}

export async function createSqliteArtifactStore(): Promise<SqliteArtifactStore> {
  const db = await getDatabase();

  const selectAllStmt = db.prepare(`
    SELECT * FROM artifacts ORDER BY created_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM artifacts WHERE artifact_id = $artifactId
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM artifacts WHERE session_id = $sessionId ORDER BY created_at DESC
  `);

  const selectByTaskStmt = db.prepare(`
    SELECT * FROM artifacts WHERE task_id = $taskId ORDER BY created_at DESC
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO artifacts
      (artifact_id, session_id, task_id, title, type, artifact, source_path, version, status, applied_at, created_at, updated_at)
    VALUES
      ($artifactId, $sessionId, $taskId, $title, $type, $artifact, $sourcePath, $version, $status, $appliedAt, $createdAt, $updatedAt)
    ON CONFLICT(artifact_id) DO UPDATE SET
      session_id = excluded.session_id,
      task_id = excluded.task_id,
      title = excluded.title,
      type = excluded.type,
      artifact = excluded.artifact,
      source_path = excluded.source_path,
      version = excluded.version,
      status = excluded.status,
      applied_at = excluded.applied_at,
      updated_at = excluded.updated_at
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM artifacts WHERE artifact_id = $artifactId
  `);

  function rowToArtifact(row: Record<string, unknown>): CoworkArtifactRecord {
    return {
      artifactId: row.artifact_id as string,
      sessionId: row.session_id as string,
      taskId: row.task_id ? (row.task_id as string) : undefined,
      title: row.title as string,
      type: row.type as CoworkArtifactRecord["type"],
      artifact: parseArtifactPayload(row.artifact),
      sourcePath: row.source_path ? (row.source_path as string) : undefined,
      version: typeof row.version === "number" ? row.version : 1,
      status: (row.status as CoworkArtifactRecord["status"]) ?? "pending",
      appliedAt: row.applied_at ? (row.applied_at as number) : undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  function getById(artifactId: string): CoworkArtifactRecord | null {
    const row = selectByIdStmt.get({ $artifactId: artifactId }) as Record<string, unknown> | null;
    return row ? rowToArtifact(row) : null;
  }

  return {
    async getAll(): Promise<CoworkArtifactRecord[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToArtifact);
    },

    async getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
      return getById(artifactId);
    },

    async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
      const rows = selectBySessionStmt.all({ $sessionId: sessionId }) as Record<string, unknown>[];
      return rows.map(rowToArtifact);
    },

    async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
      const rows = selectByTaskStmt.all({ $taskId: taskId }) as Record<string, unknown>[];
      return rows.map(rowToArtifact);
    },

    async upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord> {
      upsertStmt.run({
        $artifactId: artifact.artifactId,
        $sessionId: artifact.sessionId,
        $taskId: artifact.taskId ?? null,
        $title: artifact.title,
        $type: artifact.type,
        $artifact: JSON.stringify(artifact.artifact),
        $sourcePath: artifact.sourcePath ?? null,
        $version: artifact.version,
        $status: artifact.status,
        $appliedAt: artifact.appliedAt ?? null,
        $createdAt: artifact.createdAt,
        $updatedAt: artifact.updatedAt,
      });
      return artifact;
    },

    async delete(artifactId: string): Promise<boolean> {
      const result = deleteStmt.run({ $artifactId: artifactId });
      return result.changes > 0;
    },
  };
}
