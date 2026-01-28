/**
 * SQLite-based session store.
 * Drop-in replacement for JsonStore-based sessionStore.
 */

import type { CoworkSession } from "@ku0/agent-runtime";
import { resolveSessionIsolationConfig } from "../runtime/utils";
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
    INSERT INTO sessions (
      session_id,
      user_id,
      device_id,
      platform,
      mode,
      grants,
      connectors,
      created_at,
      updated_at,
      project_id,
      isolation_level,
      sandbox_mode,
      tool_allowlist,
      tool_denylist
    )
    VALUES (
      $sessionId,
      $userId,
      $deviceId,
      $platform,
      $mode,
      $grants,
      $connectors,
      $createdAt,
      $updatedAt,
      $projectId,
      $isolationLevel,
      $sandboxMode,
      $toolAllowlist,
      $toolDenylist
    )
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
        ended_at = $endedAt, project_id = $projectId, isolation_level = $isolationLevel,
        sandbox_mode = $sandboxMode, tool_allowlist = $toolAllowlist, tool_denylist = $toolDenylist
    WHERE session_id = $sessionId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM sessions WHERE session_id = $sessionId
  `);

  function parseOptionalJsonArray(raw: unknown): string[] | undefined {
    if (raw === null || raw === undefined) {
      return undefined;
    }
    if (typeof raw !== "string") {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : undefined;
    } catch {
      return undefined;
    }
  }

  function rowToSession(row: Record<string, unknown>): CoworkSession {
    const resolved = resolveSessionIsolationConfig({
      isolationLevel: row.isolation_level as CoworkSession["isolationLevel"] | undefined,
      sandboxMode: row.sandbox_mode as CoworkSession["sandboxMode"] | undefined,
      toolAllowlist: parseOptionalJsonArray(row.tool_allowlist),
      toolDenylist: parseOptionalJsonArray(row.tool_denylist),
      userId: row.user_id as string,
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
      isolationLevel: resolved.isolationLevel,
      sandboxMode: resolved.sandboxMode,
      toolAllowlist: resolved.toolAllowlist,
      toolDenylist: resolved.toolDenylist,
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
      const resolved = resolveSessionIsolationConfig(session);
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
        $isolationLevel: resolved.isolationLevel,
        $sandboxMode: resolved.sandboxMode,
        $toolAllowlist: JSON.stringify(resolved.toolAllowlist ?? []),
        $toolDenylist: JSON.stringify(resolved.toolDenylist ?? []),
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
      const resolved = resolveSessionIsolationConfig(updated);
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
        $isolationLevel: resolved.isolationLevel,
        $sandboxMode: resolved.sandboxMode,
        $toolAllowlist: JSON.stringify(resolved.toolAllowlist ?? []),
        $toolDenylist: JSON.stringify(resolved.toolDenylist ?? []),
      });
      return updated;
    },

    async delete(sessionId: string): Promise<boolean> {
      const result = deleteStmt.run({ $sessionId: sessionId });
      return result.changes > 0;
    },
  };
}
