/**
 * SQLite-based session store.
 * Drop-in replacement for JsonStore-based sessionStore.
 */

import type { CoworkSession } from "@ku0/agent-runtime";
import { resolveSessionIsolation } from "../runtime/utils";
import { getDatabase } from "./database";

export interface SqliteSessionStore {
  getAll(): Promise<CoworkSession[]>;
  getById(sessionId: string): Promise<CoworkSession | null>;
  create(session: CoworkSession): Promise<CoworkSession>;
  update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null>;
  delete(sessionId: string): Promise<boolean>;
}

export async function createSqliteSessionStore(): Promise<SqliteSessionStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO sessions (session_id, user_id, device_id, platform, mode, grants, connectors, created_at, updated_at, project_id, isolation_level)
    VALUES ($sessionId, $userId, $deviceId, $platform, $mode, $grants, $connectors, $createdAt, $updatedAt, $projectId, $isolationLevel)
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM sessions ORDER BY created_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM sessions WHERE session_id = $sessionId
  `);

  const updateStmt = db.prepare(`
    UPDATE sessions
    SET user_id = $userId, device_id = $deviceId, platform = $platform,
        mode = $mode, grants = $grants, connectors = $connectors, updated_at = $updatedAt,
        ended_at = $endedAt, project_id = $projectId, isolation_level = $isolationLevel
    WHERE session_id = $sessionId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM sessions WHERE session_id = $sessionId
  `);

  function rowToSession(row: Record<string, unknown>): CoworkSession {
    const isolationLevel = resolveSessionIsolation({
      isolationLevel: row.isolation_level as CoworkSession["isolationLevel"] | undefined,
    });
    return {
      sessionId: row.session_id as string,
      userId: row.user_id as string,
      deviceId: row.device_id as string,
      platform: row.platform as CoworkSession["platform"],
      mode: row.mode as CoworkSession["mode"],
      grants: JSON.parse(row.grants as string),
      connectors: JSON.parse(row.connectors as string),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      projectId: (row.project_id as string) || undefined,
      isolationLevel,
    };
  }

  function getById(sessionId: string): CoworkSession | null {
    const row = selectByIdStmt.get({ $sessionId: sessionId }) as Record<string, unknown> | null;
    return row ? rowToSession(row) : null;
  }

  return {
    async getAll(): Promise<CoworkSession[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToSession);
    },

    async getById(sessionId: string): Promise<CoworkSession | null> {
      return getById(sessionId);
    },

    async create(session: CoworkSession): Promise<CoworkSession> {
      const isolationLevel = resolveSessionIsolation(session);
      insertStmt.run({
        $sessionId: session.sessionId,
        $userId: session.userId,
        $deviceId: session.deviceId,
        $platform: session.platform,
        $mode: session.mode,
        $grants: JSON.stringify(session.grants),
        $connectors: JSON.stringify(session.connectors),
        $createdAt: session.createdAt,
        $updatedAt: session.updatedAt || session.createdAt,
        $projectId: session.projectId || null,
        $isolationLevel: isolationLevel,
      });
      return session;
    },

    async update(
      sessionId: string,
      updater: (session: CoworkSession) => CoworkSession
    ): Promise<CoworkSession | null> {
      const existing = getById(sessionId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      const isolationLevel = resolveSessionIsolation(updated);
      updateStmt.run({
        $sessionId: updated.sessionId,
        $userId: updated.userId,
        $deviceId: updated.deviceId,
        $platform: updated.platform,
        $mode: updated.mode,
        $grants: JSON.stringify(updated.grants),
        $connectors: JSON.stringify(updated.connectors),
        $updatedAt: Date.now(),
        $endedAt: updated.endedAt || null,
        $projectId: updated.projectId || null,
        $isolationLevel: isolationLevel,
      });
      return updated;
    },

    async delete(sessionId: string): Promise<boolean> {
      const result = deleteStmt.run({ $sessionId: sessionId });
      return result.changes > 0;
    },
  };
}
