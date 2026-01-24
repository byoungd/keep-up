/**
 * SQLite-based workspace session event store.
 */

import type { CoworkWorkspaceEvent } from "@ku0/agent-runtime";
import type { CoworkWorkspaceEventInput } from "./contracts";
import { getDatabase } from "./database";

export interface SqliteWorkspaceEventStore {
  getByWorkspaceSession(
    workspaceSessionId: string,
    options?: { afterSequence?: number; limit?: number }
  ): Promise<CoworkWorkspaceEvent[]>;
  append(event: CoworkWorkspaceEventInput): Promise<CoworkWorkspaceEvent>;
  appendMany(events: CoworkWorkspaceEventInput[]): Promise<CoworkWorkspaceEvent[]>;
}

export async function createSqliteWorkspaceEventStore(): Promise<SqliteWorkspaceEventStore> {
  const db = await getDatabase();

  const insertStmt = db.prepare(`
    INSERT INTO workspace_events (
      event_id,
      workspace_session_id,
      session_id,
      sequence,
      timestamp,
      kind,
      payload,
      source
    ) VALUES (
      $eventId,
      $workspaceSessionId,
      $sessionId,
      $sequence,
      $timestamp,
      $kind,
      $payload,
      $source
    )
  `);

  const selectBySessionStmtBase = `
    SELECT * FROM workspace_events
    WHERE workspace_session_id = $workspaceSessionId
  `;

  const selectMaxSequenceStmt = db.prepare(`
    SELECT MAX(sequence) as max_sequence FROM workspace_events
    WHERE workspace_session_id = $workspaceSessionId
  `);

  function rowToWorkspaceEvent(row: Record<string, unknown>): CoworkWorkspaceEvent {
    return {
      eventId: row.event_id as string,
      workspaceSessionId: row.workspace_session_id as string,
      sessionId: row.session_id as string,
      sequence: row.sequence as number,
      timestamp: row.timestamp as number,
      kind: row.kind as CoworkWorkspaceEvent["kind"],
      payload: parsePayload(row.payload),
      source: row.source ? (row.source as CoworkWorkspaceEvent["source"]) : undefined,
    };
  }

  function getMaxSequence(workspaceSessionId: string): number {
    const row = selectMaxSequenceStmt.get({
      $workspaceSessionId: workspaceSessionId,
    }) as Record<string, unknown> | null;
    const value = row?.max_sequence;
    return typeof value === "number" ? value : 0;
  }

  async function getByWorkspaceSession(
    workspaceSessionId: string,
    options: { afterSequence?: number; limit?: number } = {}
  ): Promise<CoworkWorkspaceEvent[]> {
    const clauses: string[] = [];
    const params: Record<string, string | number> = {
      $workspaceSessionId: workspaceSessionId,
    };

    if (options.afterSequence !== undefined) {
      clauses.push("sequence > $afterSequence");
      params.$afterSequence = options.afterSequence;
    }

    let sql = selectBySessionStmtBase;
    if (clauses.length > 0) {
      sql += ` AND ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY sequence ASC";

    if (options.limit !== undefined) {
      sql += " LIMIT $limit";
      params.$limit = options.limit;
    }

    const rows = db.prepare(sql).all(params) as Record<string, unknown>[];
    return rows.map(rowToWorkspaceEvent);
  }

  async function appendMany(events: CoworkWorkspaceEventInput[]): Promise<CoworkWorkspaceEvent[]> {
    if (events.length === 0) {
      return [];
    }
    const { workspaceSessionId } = events[0];
    for (const event of events) {
      if (event.workspaceSessionId !== workspaceSessionId) {
        throw new Error("Workspace event batch must share the same workspaceSessionId.");
      }
    }
    const maxSequence = getMaxSequence(workspaceSessionId);
    const now = Date.now();
    const stored: CoworkWorkspaceEvent[] = events.map((event, index) => ({
      eventId: event.eventId ?? crypto.randomUUID(),
      workspaceSessionId: event.workspaceSessionId,
      sessionId: event.sessionId,
      sequence: maxSequence + index + 1,
      timestamp: event.timestamp ?? now,
      kind: event.kind,
      payload: event.payload,
      source: event.source,
    }));

    const insertMany = db.transaction((batch: CoworkWorkspaceEvent[]) => {
      for (const entry of batch) {
        insertStmt.run({
          $eventId: entry.eventId,
          $workspaceSessionId: entry.workspaceSessionId,
          $sessionId: entry.sessionId,
          $sequence: entry.sequence,
          $timestamp: entry.timestamp,
          $kind: entry.kind,
          $payload: JSON.stringify(entry.payload),
          $source: entry.source ?? null,
        });
      }
    });

    insertMany(stored);
    return stored;
  }

  async function append(event: CoworkWorkspaceEventInput): Promise<CoworkWorkspaceEvent> {
    const [stored] = await appendMany([event]);
    return stored;
  }

  return {
    getByWorkspaceSession,
    append,
    appendMany,
  };
}

function parsePayload(raw: unknown): Record<string, unknown> {
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
