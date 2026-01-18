/**
 * SQLite-based Checkpoint Storage
 *
 * Implements ICheckpointStorage with SQLite persistence per spec Section 8.1.
 * Schema:
 * - id TEXT PRIMARY KEY
 * - thread_id TEXT NOT NULL
 * - step INTEGER NOT NULL
 * - timestamp TEXT NOT NULL
 * - state_blob TEXT NOT NULL (JSON)
 * - pending_tools TEXT (JSON array)
 * - completed_tools TEXT (JSON array)
 * - usage_tokens INTEGER
 * - usage_cost REAL
 * - UNIQUE(thread_id, step)
 *
 * @requires better-sqlite3 - Optional peer dependency for SQLite storage
 */

import type {
  Checkpoint,
  CheckpointFilter,
  CheckpointStatus,
  CheckpointSummary,
  ICheckpointStorage,
} from "./checkpointManager";

// ============================================================================
// Types
// ============================================================================

/**
 * Database interface matching better-sqlite3 API.
 * This allows injection of database instances for testing.
 */
export interface SQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
  close(): void;
}

export interface SQLiteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(params?: Record<string, unknown>): unknown[];
}

export interface SQLiteCheckpointStorageConfig {
  /** Path to SQLite database file */
  dbPath?: string;
  /** Database instance (injected for testing or shared DB) */
  db?: SQLiteDatabase;
}

interface CheckpointRow {
  id: string;
  thread_id: string;
  step: number;
  timestamp: string;
  state_blob: string;
  pending_tools: string | null;
  completed_tools: string | null;
  usage_tokens: number | null;
  usage_cost: number | null;
  status: string;
  agent_type: string;
  agent_id: string;
  task: string;
  max_steps: number;
  error_json: string | null;
  parent_checkpoint_id: string | null;
  child_checkpoint_ids: string | null;
}

// ============================================================================
// Schema
// ============================================================================

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    step INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    state_blob TEXT NOT NULL,
    pending_tools TEXT,
    completed_tools TEXT,
    usage_tokens INTEGER,
    usage_cost REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    agent_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    task TEXT NOT NULL,
    max_steps INTEGER NOT NULL DEFAULT 100,
    error_json TEXT,
    parent_checkpoint_id TEXT,
    child_checkpoint_ids TEXT,
    UNIQUE(thread_id, step)
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_checkpoint_thread_step 
  ON checkpoints(thread_id, step DESC)
`;

// ============================================================================
// SQLite Checkpoint Storage
// ============================================================================

export class SQLiteCheckpointStorage implements ICheckpointStorage {
  private readonly db: SQLiteDatabase;
  private readonly ownsDb: boolean;

  constructor(config: SQLiteCheckpointStorageConfig) {
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
  }

  private initSchema(): void {
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_INDEX_SQL);
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (
        id, thread_id, step, timestamp, state_blob, pending_tools, completed_tools,
        usage_tokens, usage_cost, status, agent_type, agent_id, task, max_steps,
        error_json, parent_checkpoint_id, child_checkpoint_ids
      ) VALUES (
        :id, :threadId, :step, :timestamp, :stateBlob, :pendingTools, :completedTools,
        :usageTokens, :usageCost, :status, :agentType, :agentId, :task, :maxSteps,
        :errorJson, :parentCheckpointId, :childCheckpointIds
      )
    `);

    stmt.run({
      id: checkpoint.id,
      threadId: checkpoint.agentId, // Use agentId as threadId for now
      step: checkpoint.currentStep,
      timestamp: new Date(checkpoint.createdAt).toISOString(),
      stateBlob: JSON.stringify({
        messages: checkpoint.messages,
        metadata: checkpoint.metadata,
        version: checkpoint.version,
      }),
      pendingTools: JSON.stringify(checkpoint.pendingToolCalls),
      completedTools: JSON.stringify(checkpoint.completedToolCalls),
      usageTokens: null, // Can be extended later
      usageCost: null,
      status: checkpoint.status,
      agentType: checkpoint.agentType,
      agentId: checkpoint.agentId,
      task: checkpoint.task,
      maxSteps: checkpoint.maxSteps,
      errorJson: checkpoint.error ? JSON.stringify(checkpoint.error) : null,
      parentCheckpointId: checkpoint.parentCheckpointId ?? null,
      childCheckpointIds: JSON.stringify(checkpoint.childCheckpointIds),
    });
  }

  async load(id: string): Promise<Checkpoint | null> {
    const stmt = this.db.prepare("SELECT * FROM checkpoints WHERE id = ?");
    const row = stmt.get(id) as CheckpointRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToCheckpoint(row);
  }

  /**
   * Load checkpoint by threadId and step (spec requirement).
   */
  async loadByThreadAndStep(threadId: string, step: number): Promise<Checkpoint | null> {
    const stmt = this.db.prepare("SELECT * FROM checkpoints WHERE thread_id = ? AND step = ?");
    const row = stmt.get(threadId, step) as CheckpointRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToCheckpoint(row);
  }

  /**
   * Get the latest checkpoint for a thread.
   */
  async getLatestByThread(threadId: string): Promise<Checkpoint | null> {
    const stmt = this.db.prepare(
      "SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY step DESC LIMIT 1"
    );
    const row = stmt.get(threadId) as CheckpointRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToCheckpoint(row);
  }

  async list(filter?: CheckpointFilter): Promise<CheckpointSummary[]> {
    let query = "SELECT * FROM checkpoints WHERE 1=1";
    const params: Record<string, unknown> = {};

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      query += ` AND status IN (${statuses.map((_, i) => `:status${i}`).join(", ")})`;
      statuses.forEach((s, i) => {
        params[`status${i}`] = s;
      });
    }

    if (filter?.agentType) {
      query += " AND agent_type = :agentType";
      params.agentType = filter.agentType;
    }

    if (filter?.createdAfter !== undefined) {
      query += " AND timestamp >= :createdAfter";
      params.createdAfter = new Date(filter.createdAfter).toISOString();
    }

    if (filter?.createdBefore !== undefined) {
      query += " AND timestamp <= :createdBefore";
      params.createdBefore = new Date(filter.createdBefore).toISOString();
    }

    // Sort
    const sortBy = filter?.sortBy ?? "createdAt";
    const sortColumn = sortBy === "createdAt" ? "timestamp" : "status";
    const sortOrder = filter?.sortOrder ?? "desc";
    query += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;

    // Limit
    if (filter?.limit) {
      query += " LIMIT :limit";
      params.limit = filter.limit;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(params) as CheckpointRow[];

    return rows.map((row) => ({
      id: row.id,
      task: row.task,
      agentType: row.agent_type,
      status: row.status as CheckpointStatus,
      createdAt: new Date(row.timestamp).getTime(),
      currentStep: row.step,
      maxSteps: row.max_steps,
      hasError: row.error_json !== null,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare("DELETE FROM checkpoints WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async prune(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const stmt = this.db.prepare("DELETE FROM checkpoints WHERE timestamp < ?");
    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Close the database connection if we own it.
   */
  close(): void {
    if (this.ownsDb) {
      this.db.close();
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private rowToCheckpoint(row: CheckpointRow): Checkpoint {
    const stateBlob = JSON.parse(row.state_blob) as {
      messages: Checkpoint["messages"];
      metadata: Checkpoint["metadata"];
      version: number;
    };

    return {
      id: row.id,
      version: stateBlob.version ?? 1,
      createdAt: new Date(row.timestamp).getTime(),
      task: row.task,
      agentType: row.agent_type,
      agentId: row.agent_id,
      status: row.status as CheckpointStatus,
      messages: stateBlob.messages ?? [],
      pendingToolCalls: row.pending_tools ? JSON.parse(row.pending_tools) : [],
      completedToolCalls: row.completed_tools ? JSON.parse(row.completed_tools) : [],
      currentStep: row.step,
      maxSteps: row.max_steps,
      metadata: stateBlob.metadata ?? {},
      error: row.error_json ? JSON.parse(row.error_json) : undefined,
      parentCheckpointId: row.parent_checkpoint_id ?? undefined,
      childCheckpointIds: row.child_checkpoint_ids ? JSON.parse(row.child_checkpoint_ids) : [],
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an SQLite checkpoint storage.
 */
export function createSQLiteCheckpointStorage(
  config: SQLiteCheckpointStorageConfig = {}
): SQLiteCheckpointStorage {
  return new SQLiteCheckpointStorage(config);
}
