/**
 * Event Log Manager
 *
 * Append-only event log for runtime audit and replay per spec Section 5.6 and 8.2.
 *
 * Schema (Section 8.2):
 * - id INTEGER PRIMARY KEY AUTOINCREMENT
 * - thread_id TEXT NOT NULL
 * - event_type TEXT NOT NULL
 * - timestamp TEXT NOT NULL
 * - payload TEXT NOT NULL (JSON)
 *
 * Extended fields (per Section 5.6):
 * - run_id TEXT NOT NULL
 * - agent_id TEXT NOT NULL
 * - turn INTEGER NOT NULL
 * - tool_call_id TEXT (optional)
 *
 * @requires better-sqlite3 - Optional peer dependency for SQLite storage
 */

import type { SQLiteDatabase, SQLiteStatement } from "./sqliteCheckpointStorage";

// ============================================================================
// Types
// ============================================================================

/**
 * Event types per spec Section 5.6.
 */
export type RuntimeEventType =
  | "turn_start"
  | "turn_end"
  | "tool_call_start"
  | "tool_call_end"
  | "completion"
  | "error"
  | "recovery"
  | "checkpoint_created"
  | "model_routing";

/**
 * Runtime event per spec Section 5.6.
 */
export interface RuntimeEvent {
  /** Auto-generated ID */
  id?: number;
  /** Run correlation ID */
  runId: string;
  /** Agent instance ID */
  agentId: string;
  /** Event type */
  type: RuntimeEventType;
  /** Current turn number */
  turn: number;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Tool call ID (for tool events) */
  toolCallId?: string;
  /** Event payload */
  payload: Record<string, unknown>;
}

export interface EventLogConfig {
  /** Path to SQLite database file */
  dbPath?: string;
  /** Database instance (injected for testing or shared DB) */
  db?: SQLiteDatabase;
}

export interface EventLogFilter {
  /** Filter by run ID */
  runId?: string;
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by event type */
  type?: RuntimeEventType | RuntimeEventType[];
  /** Filter by turn */
  turn?: number;
  /** Filter events after this timestamp */
  since?: string;
  /** Filter events before this timestamp */
  until?: string;
  /** Maximum number of events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

export interface EventLogManager {
  /** Append an event to the log (immutable) */
  append(event: Omit<RuntimeEvent, "id" | "timestamp">): Promise<RuntimeEvent>;
  /** Query events with filters */
  query(filter: EventLogFilter): Promise<RuntimeEvent[]>;
  /** Get all events for a run */
  getByRunId(runId: string): Promise<RuntimeEvent[]>;
  /** Get event count by run */
  countByRun(runId: string): Promise<number>;
  /** Close database connection */
  close(): void;
}

// ============================================================================
// Schema
// ============================================================================

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    turn INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    tool_call_id TEXT,
    payload TEXT NOT NULL
  )
`;

const CREATE_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
  CREATE INDEX IF NOT EXISTS idx_events_thread_id ON events(thread_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
`;

// ============================================================================
// Implementation
// ============================================================================

interface EventRow {
  id: number;
  run_id: string;
  agent_id: string;
  thread_id: string;
  event_type: string;
  turn: number;
  timestamp: string;
  tool_call_id: string | null;
  payload: string;
}

class SQLiteEventLogManager implements EventLogManager {
  private readonly db: SQLiteDatabase;
  private readonly ownsDb: boolean;
  private readonly insertStmt: SQLiteStatement;

  constructor(config: EventLogConfig) {
    if (config.db) {
      this.db = config.db;
      this.ownsDb = false;
    } else {
      // Dynamic import to avoid bundling issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require("better-sqlite3") as new (path: string) => SQLiteDatabase;
      this.db = new BetterSqlite3(config.dbPath ?? ":memory:");
      this.ownsDb = true;
    }

    this.initSchema();
    this.insertStmt = this.db.prepare(`
      INSERT INTO events (run_id, agent_id, thread_id, event_type, turn, timestamp, tool_call_id, payload)
      VALUES (:runId, :agentId, :threadId, :eventType, :turn, :timestamp, :toolCallId, :payload)
    `);
  }

  private initSchema(): void {
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_INDEXES_SQL);
  }

  async append(event: Omit<RuntimeEvent, "id" | "timestamp">): Promise<RuntimeEvent> {
    const timestamp = new Date().toISOString();

    const result = this.insertStmt.run({
      runId: event.runId,
      agentId: event.agentId,
      threadId: event.agentId, // Using agentId as threadId for correlation
      eventType: event.type,
      turn: event.turn,
      timestamp: timestamp,
      toolCallId: event.toolCallId ?? null,
      payload: JSON.stringify(event.payload),
    });

    return {
      id: Number(result.lastInsertRowid),
      runId: event.runId,
      agentId: event.agentId,
      type: event.type,
      turn: event.turn,
      timestamp,
      toolCallId: event.toolCallId,
      payload: event.payload,
    };
  }

  async query(filter: EventLogFilter): Promise<RuntimeEvent[]> {
    let query = "SELECT * FROM events WHERE 1=1";
    const params: Record<string, unknown> = {};

    if (filter.runId) {
      query += " AND run_id = :runId";
      params.runId = filter.runId;
    }

    if (filter.agentId) {
      query += " AND agent_id = :agentId";
      params.agentId = filter.agentId;
    }

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      query += ` AND event_type IN (${types.map((_, i) => `:type${i}`).join(", ")})`;
      types.forEach((t, i) => {
        params[`type${i}`] = t;
      });
    }

    if (filter.turn !== undefined) {
      query += " AND turn = :turn";
      params.turn = filter.turn;
    }

    if (filter.since) {
      query += " AND timestamp >= :since";
      params.since = filter.since;
    }

    if (filter.until) {
      query += " AND timestamp <= :until";
      params.until = filter.until;
    }

    // Always order by ID to preserve append order
    query += " ORDER BY id ASC";

    if (filter.limit) {
      query += " LIMIT :limit";
      params.limit = filter.limit;
    }

    if (filter.offset) {
      query += " OFFSET :offset";
      params.offset = filter.offset;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(params) as EventRow[];

    return rows.map(this.rowToEvent);
  }

  async getByRunId(runId: string): Promise<RuntimeEvent[]> {
    return this.query({ runId });
  }

  async countByRun(runId: string): Promise<number> {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM events WHERE run_id = ?");
    const result = stmt.get(runId) as { count: number };
    return result.count;
  }

  close(): void {
    if (this.ownsDb) {
      this.db.close();
    }
  }

  private rowToEvent(row: EventRow): RuntimeEvent {
    return {
      id: row.id,
      runId: row.run_id,
      agentId: row.agent_id,
      type: row.event_type as RuntimeEventType,
      turn: row.turn,
      timestamp: row.timestamp,
      toolCallId: row.tool_call_id ?? undefined,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an event log manager.
 */
export function createEventLogManager(config: EventLogConfig = {}): EventLogManager {
  return new SQLiteEventLogManager(config);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create event helper for turn_start.
 */
export function createTurnStartEvent(
  runId: string,
  agentId: string,
  turn: number,
  payload: Record<string, unknown> = {}
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return { runId, agentId, type: "turn_start", turn, payload };
}

/**
 * Create event helper for turn_end.
 */
export function createTurnEndEvent(
  runId: string,
  agentId: string,
  turn: number,
  payload: Record<string, unknown> = {}
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return { runId, agentId, type: "turn_end", turn, payload };
}

/**
 * Create event helper for tool_call_start.
 */
export function createToolCallStartEvent(
  runId: string,
  agentId: string,
  turn: number,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return {
    runId,
    agentId,
    type: "tool_call_start",
    turn,
    toolCallId,
    payload: { toolName, arguments: args },
  };
}

/**
 * Create event helper for tool_call_end.
 */
export function createToolCallEndEvent(
  runId: string,
  agentId: string,
  turn: number,
  toolCallId: string,
  toolName: string,
  success: boolean,
  durationMs: number,
  result?: unknown
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return {
    runId,
    agentId,
    type: "tool_call_end",
    turn,
    toolCallId,
    payload: { toolName, success, durationMs, result },
  };
}

/**
 * Create event helper for completion.
 */
export function createCompletionEvent(
  runId: string,
  agentId: string,
  turn: number,
  summary: string,
  artifacts?: string[]
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return {
    runId,
    agentId,
    type: "completion",
    turn,
    payload: { summary, artifacts },
  };
}

/**
 * Create event helper for error.
 */
export function createErrorEvent(
  runId: string,
  agentId: string,
  turn: number,
  error: string,
  code?: string,
  recoverable?: boolean
): Omit<RuntimeEvent, "id" | "timestamp"> {
  return {
    runId,
    agentId,
    type: "error",
    turn,
    payload: { error, code, recoverable },
  };
}
