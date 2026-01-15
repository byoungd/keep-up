/**
 * SQLite-based session store.
 * Drop-in replacement for JsonStore-based sessionStore.
 */

import type { CoworkSession } from "@ku0/agent-runtime";
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
    INSERT INTO sessions (session_id, user_id, device_id, platform, mode, grants, connectors, created_at)
    VALUES ($sessionId, $userId, $deviceId, $platform, $mode, $grants, $connectors, $createdAt)
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
        mode = $mode, grants = $grants, connectors = $connectors, ended_at = $endedAt
    WHERE session_id = $sessionId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM sessions WHERE session_id = $sessionId
  `);

  function rowToSession(row: Record<string, unknown>): CoworkSession {
    return {
      sessionId: row.session_id as string,
      userId: row.user_id as string,
      deviceId: row.device_id as string,
      platform: row.platform as CoworkSession["platform"],
      mode: row.mode as CoworkSession["mode"],
      grants: JSON.parse(row.grants as string),
      connectors: JSON.parse(row.connectors as string),
      createdAt: row.created_at as number,
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
      insertStmt.run({
        $sessionId: session.sessionId,
        $userId: session.userId,
        $deviceId: session.deviceId,
        $platform: session.platform,
        $mode: session.mode,
        $grants: JSON.stringify(session.grants),
        $connectors: JSON.stringify(session.connectors),
        $createdAt: session.createdAt,
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
      updateStmt.run({
        $sessionId: updated.sessionId,
        $userId: updated.userId,
        $deviceId: updated.deviceId,
        $platform: updated.platform,
        $mode: updated.mode,
        $grants: JSON.stringify(updated.grants),
        $connectors: JSON.stringify(updated.connectors),
        $endedAt: null,
      });
      return updated;
    },

    async delete(sessionId: string): Promise<boolean> {
      const result = deleteStmt.run({ $sessionId: sessionId });
      return result.changes > 0;
    },
  };
}
