/**
 * SQLite-based workspace session store.
 */

import type { CoworkWorkspaceSession } from "@ku0/agent-runtime";
import { getDatabase } from "./database";

export interface SqliteWorkspaceSessionStore {
  getAll(): Promise<CoworkWorkspaceSession[]>;
  getById(workspaceSessionId: string): Promise<CoworkWorkspaceSession | null>;
  getBySession(sessionId: string): Promise<CoworkWorkspaceSession[]>;
  create(session: CoworkWorkspaceSession): Promise<CoworkWorkspaceSession>;
  update(
    workspaceSessionId: string,
    updater: (session: CoworkWorkspaceSession) => CoworkWorkspaceSession
  ): Promise<CoworkWorkspaceSession | null>;
  delete(workspaceSessionId: string): Promise<boolean>;
}

export async function createSqliteWorkspaceSessionStore(): Promise<SqliteWorkspaceSessionStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO workspace_sessions (
      workspace_session_id,
      session_id,
      workspace_id,
      kind,
      status,
      owner_agent_id,
      controller,
      controller_id,
      metadata,
      created_at,
      updated_at,
      ended_at
    ) VALUES (
      $workspaceSessionId,
      $sessionId,
      $workspaceId,
      $kind,
      $status,
      $ownerAgentId,
      $controller,
      $controllerId,
      $metadata,
      $createdAt,
      $updatedAt,
      $endedAt
    )
  `);

  const selectAllStmt = db.prepare(`
    SELECT * FROM workspace_sessions ORDER BY created_at DESC
  `);

  const selectByIdStmt = db.prepare(`
    SELECT * FROM workspace_sessions WHERE workspace_session_id = $workspaceSessionId
  `);

  const selectBySessionStmt = db.prepare(`
    SELECT * FROM workspace_sessions WHERE session_id = $sessionId ORDER BY created_at ASC
  `);

  const updateStmt = db.prepare(`
    UPDATE workspace_sessions
    SET
      workspace_id = $workspaceId,
      kind = $kind,
      status = $status,
      owner_agent_id = $ownerAgentId,
      controller = $controller,
      controller_id = $controllerId,
      metadata = $metadata,
      updated_at = $updatedAt,
      ended_at = $endedAt
    WHERE workspace_session_id = $workspaceSessionId
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM workspace_sessions WHERE workspace_session_id = $workspaceSessionId
  `);

  function rowToWorkspaceSession(row: Record<string, unknown>): CoworkWorkspaceSession {
    return {
      workspaceSessionId: row.workspace_session_id as string,
      sessionId: row.session_id as string,
      workspaceId: (row.workspace_id as string | null) ?? undefined,
      kind: row.kind as CoworkWorkspaceSession["kind"],
      status: row.status as CoworkWorkspaceSession["status"],
      ownerAgentId: (row.owner_agent_id as string | null) ?? undefined,
      controller: row.controller as CoworkWorkspaceSession["controller"],
      controllerId: (row.controller_id as string | null) ?? undefined,
      metadata: parseMetadata(row.metadata),
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      endedAt: (row.ended_at as number | null) ?? undefined,
    };
  }

  function getById(workspaceSessionId: string): CoworkWorkspaceSession | null {
    const row = selectByIdStmt.get({
      $workspaceSessionId: workspaceSessionId,
    }) as Record<string, unknown> | null;
    return row ? rowToWorkspaceSession(row) : null;
  }

  return {
    async getAll(): Promise<CoworkWorkspaceSession[]> {
      const rows = selectAllStmt.all() as Record<string, unknown>[];
      return rows.map(rowToWorkspaceSession);
    },

    async getById(workspaceSessionId: string): Promise<CoworkWorkspaceSession | null> {
      return getById(workspaceSessionId);
    },

    async getBySession(sessionId: string): Promise<CoworkWorkspaceSession[]> {
      const rows = selectBySessionStmt.all({ $sessionId: sessionId }) as Record<string, unknown>[];
      return rows.map(rowToWorkspaceSession);
    },

    async create(session: CoworkWorkspaceSession): Promise<CoworkWorkspaceSession> {
      insertStmt.run({
        $workspaceSessionId: session.workspaceSessionId,
        $sessionId: session.sessionId,
        $workspaceId: session.workspaceId ?? null,
        $kind: session.kind,
        $status: session.status,
        $ownerAgentId: session.ownerAgentId ?? null,
        $controller: session.controller,
        $controllerId: session.controllerId ?? null,
        $metadata: JSON.stringify(session.metadata ?? {}),
        $createdAt: session.createdAt,
        $updatedAt: session.updatedAt,
        $endedAt: session.endedAt ?? null,
      });
      return session;
    },

    async update(
      workspaceSessionId: string,
      updater: (session: CoworkWorkspaceSession) => CoworkWorkspaceSession
    ): Promise<CoworkWorkspaceSession | null> {
      const existing = getById(workspaceSessionId);
      if (!existing) {
        return null;
      }

      const updated = updater(existing);
      updateStmt.run({
        $workspaceSessionId: updated.workspaceSessionId,
        $workspaceId: updated.workspaceId ?? null,
        $kind: updated.kind,
        $status: updated.status,
        $ownerAgentId: updated.ownerAgentId ?? null,
        $controller: updated.controller,
        $controllerId: updated.controllerId ?? null,
        $metadata: JSON.stringify(updated.metadata ?? {}),
        $updatedAt: updated.updatedAt,
        $endedAt: updated.endedAt ?? null,
      });
      return updated;
    },

    async delete(workspaceSessionId: string): Promise<boolean> {
      const result = deleteStmt.run({ $workspaceSessionId: workspaceSessionId });
      return result.changes > 0;
    },
  };
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
