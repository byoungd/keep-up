/**
 * SQLite-based agent state checkpoint store.
 * Drop-in replacement for JsonStore-based checkpoints.
 */

import { getDatabase } from "./database";
import type { AgentStateCheckpointRecord } from "./types";

export interface SqliteAgentStateStore {
  getAll(): Promise<AgentStateCheckpointRecord[]>;
  getById(checkpointId: string): Promise<AgentStateCheckpointRecord | null>;
  getBySession(sessionId: string): Promise<AgentStateCheckpointRecord[]>;
  create(record: AgentStateCheckpointRecord): Promise<AgentStateCheckpointRecord>;
}

export async function createSqliteAgentStateStore(): Promise<SqliteAgentStateStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO agent_state_checkpoints
    (checkpoint_id, session_id, state, created_at, updated_at)
    VALUES ($checkpointId, $sessionId, $state, $createdAt, $updatedAt)
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM agent_state_checkpoints WHERE checkpoint_id = $checkpointId
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM agent_state_checkpoints ORDER BY created_at ASC
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM agent_state_checkpoints
    WHERE session_id = $sessionId
    ORDER BY created_at ASC
  `);

  function rowToRecord(row: Record<string, unknown>): AgentStateCheckpointRecord {
    return {
      checkpointId: row.checkpoint_id as string,
      sessionId: row.session_id as string,
      state: JSON.parse(row.state as string) as AgentStateCheckpointRecord["state"],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }

  return {
    async getAll(): Promise<AgentStateCheckpointRecord[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToRecord);
    },

    async getById(checkpointId: string): Promise<AgentStateCheckpointRecord | null> {
      const row = selectByIdStmt.get({
        $checkpointId: checkpointId,
      }) as Record<string, unknown> | null;
      return row ? rowToRecord(row) : null;
    },

    async getBySession(sessionId: string): Promise<AgentStateCheckpointRecord[]> {
      const rows = selectBySessionStmt.all({
        $sessionId: sessionId,
      }) as Record<string, unknown>[];
      return rows.map(rowToRecord);
    },

    async create(record: AgentStateCheckpointRecord): Promise<AgentStateCheckpointRecord> {
      insertStmt.run({
        $checkpointId: record.checkpointId,
        $sessionId: record.sessionId,
        $state: JSON.stringify(record.state),
        $createdAt: record.createdAt,
        $updatedAt: record.updatedAt,
      });
      return record;
    },
  };
}
