import { gunzipSync, gzipSync } from "node:zlib";
import type { Database as DatabaseInstance } from "better-sqlite3";
import Database from "better-sqlite3";
import type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointSaver,
  CheckpointThread,
  CheckpointThreadStore,
  CheckpointTrigger,
  ThreadListOptions,
} from "./threads";

export interface SQLiteCheckpointSaverConfig {
  databasePath?: string;
  database?: DatabaseInstance;
  compressionThresholdBytes?: number;
}

const DEFAULT_COMPRESSION_THRESHOLD = 64 * 1024;

type PreparedStatement = Database.Statement;

type PreparedStatements = {
  saveThread: PreparedStatement;
  getThread: PreparedStatement;
  ensureThread: PreparedStatement;
  updateThreadStats: PreparedStatement;
  countThreadCheckpoints: PreparedStatement;
  upsertCheckpoint: PreparedStatement;
  getCheckpoint: PreparedStatement;
  getCheckpointId: PreparedStatement;
  getThreadForCheckpoint: PreparedStatement;
  getLatestCheckpoint: PreparedStatement;
  deleteCheckpoint: PreparedStatement;
  deleteThreadCheckpoints: PreparedStatement;
  deleteThread: PreparedStatement;
};

export class SQLiteCheckpointSaver implements CheckpointSaver, CheckpointThreadStore {
  private readonly db: DatabaseInstance;
  private readonly compressionThreshold: number;
  private readonly statements: PreparedStatements;

  constructor(config: SQLiteCheckpointSaverConfig) {
    this.db = config.database ?? this.createDatabase(config.databasePath);
    this.compressionThreshold = config.compressionThresholdBytes ?? DEFAULT_COMPRESSION_THRESHOLD;
    this.initSchema();
    this.statements = this.prepareStatements();
  }

  async saveThread(thread: CheckpointThread): Promise<void> {
    this.statements.saveThread.run(
      thread.threadId,
      thread.parentThreadId ?? null,
      thread.metadata.name ?? null,
      thread.metadata.createdAt,
      thread.metadata.updatedAt,
      thread.metadata.checkpointCount
    );
  }

  async getThread(threadId: string): Promise<CheckpointThread | undefined> {
    const row = this.statements.getThread.get(threadId) as ThreadRow | undefined;

    return row ? mapThread(row) : undefined;
  }

  async listThreads(options?: ThreadListOptions): Promise<CheckpointThread[]> {
    const order = options?.order ?? "desc";
    const limit = options?.limit ?? null;
    const rows = this.db
      .prepare(
        `SELECT * FROM checkpoint_threads ORDER BY updated_at ${order === "asc" ? "ASC" : "DESC"}` +
          (limit ? " LIMIT ?" : "")
      )
      .all(limit) as ThreadRow[];

    return rows.map(mapThread);
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    this.ensureThread(checkpoint.threadId, checkpoint.timestamp);
    const encoded = encodeState(checkpoint.state, this.compressionThreshold);
    const metadata = {
      ...checkpoint.metadata,
      compressed: encoded.compressed,
      sizeBytes: encoded.sizeBytes,
    };

    const existing = this.statements.getCheckpointId.get(checkpoint.id) as
      | { checkpoint_id: string }
      | undefined;

    this.statements.upsertCheckpoint.run(
      checkpoint.id,
      checkpoint.threadId,
      checkpoint.parentId ?? null,
      checkpoint.timestamp,
      encoded.payload,
      encoded.encoding,
      JSON.stringify(metadata),
      encoded.sizeBytes,
      encoded.compressed ? 1 : 0
    );

    if (!existing) {
      this.refreshThreadStats(checkpoint.threadId);
    }
  }

  async get(checkpointId: string): Promise<Checkpoint | undefined> {
    const row = this.statements.getCheckpoint.get(checkpointId) as CheckpointRow | undefined;

    return row ? mapCheckpoint(row) : undefined;
  }

  async getLatest(threadId: string): Promise<Checkpoint | undefined> {
    const row = this.statements.getLatestCheckpoint.get(threadId) as CheckpointRow | undefined;

    return row ? mapCheckpoint(row) : undefined;
  }

  async list(threadId: string, options?: CheckpointListOptions): Promise<Checkpoint[]> {
    const clauses: string[] = ["thread_id = ?"];
    const params: Array<string | number> = [threadId];

    if (options?.before !== undefined) {
      clauses.push("timestamp < ?");
      params.push(options.before);
    }

    if (options?.after !== undefined) {
      clauses.push("timestamp > ?");
      params.push(options.after);
    }

    const order = options?.order ?? "desc";
    const limit = options?.limit ?? null;

    const sql =
      `SELECT * FROM checkpoints WHERE ${clauses.join(" AND ")}` +
      ` ORDER BY timestamp ${order === "asc" ? "ASC" : "DESC"}` +
      (limit ? " LIMIT ?" : "");

    if (limit) {
      params.push(limit);
    }

    const rows = this.db.prepare(sql).all(...params) as CheckpointRow[];
    return rows.map(mapCheckpoint);
  }

  async delete(checkpointId: string): Promise<void> {
    const row = this.statements.getThreadForCheckpoint.get(checkpointId) as
      | { thread_id: string }
      | undefined;

    this.statements.deleteCheckpoint.run(checkpointId);

    if (row?.thread_id) {
      this.refreshThreadStats(row.thread_id);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    this.statements.deleteThreadCheckpoints.run(threadId);
    this.statements.deleteThread.run(threadId);
  }

  close(): void {
    this.db.close();
  }

  private createDatabase(path?: string): DatabaseInstance {
    if (!path) {
      throw new Error("SQLiteCheckpointSaver requires databasePath or database instance");
    }
    return new Database(path);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoint_threads (
        thread_id TEXT PRIMARY KEY,
        parent_thread_id TEXT,
        name TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        checkpoint_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        parent_id TEXT,
        timestamp INTEGER NOT NULL,
        state BLOB NOT NULL,
        state_encoding TEXT NOT NULL,
        metadata TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        compressed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (thread_id) REFERENCES checkpoint_threads(thread_id)
      )
    `);

    this.db.exec("CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints(thread_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_checkpoints_time ON checkpoints(timestamp)");
  }

  private prepareStatements(): PreparedStatements {
    return {
      saveThread: this.db.prepare(`
        INSERT INTO checkpoint_threads (
          thread_id,
          parent_thread_id,
          name,
          created_at,
          updated_at,
          checkpoint_count
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
          parent_thread_id = excluded.parent_thread_id,
          name = excluded.name,
          updated_at = excluded.updated_at,
          checkpoint_count = excluded.checkpoint_count
      `),
      getThread: this.db.prepare("SELECT * FROM checkpoint_threads WHERE thread_id = ?"),
      ensureThread: this.db.prepare(
        `INSERT OR IGNORE INTO checkpoint_threads (
          thread_id,
          created_at,
          updated_at,
          checkpoint_count
        ) VALUES (?, ?, ?, 0)`
      ),
      updateThreadStats: this.db.prepare(
        "UPDATE checkpoint_threads SET checkpoint_count = ?, updated_at = ? WHERE thread_id = ?"
      ),
      countThreadCheckpoints: this.db.prepare(
        "SELECT COUNT(*) as count FROM checkpoints WHERE thread_id = ?"
      ),
      upsertCheckpoint: this.db.prepare(`
        INSERT INTO checkpoints (
          checkpoint_id,
          thread_id,
          parent_id,
          timestamp,
          state,
          state_encoding,
          metadata,
          size_bytes,
          compressed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(checkpoint_id) DO UPDATE SET
          parent_id = excluded.parent_id,
          timestamp = excluded.timestamp,
          state = excluded.state,
          state_encoding = excluded.state_encoding,
          metadata = excluded.metadata,
          size_bytes = excluded.size_bytes,
          compressed = excluded.compressed
      `),
      getCheckpoint: this.db.prepare("SELECT * FROM checkpoints WHERE checkpoint_id = ?"),
      getCheckpointId: this.db.prepare(
        "SELECT checkpoint_id FROM checkpoints WHERE checkpoint_id = ?"
      ),
      getThreadForCheckpoint: this.db.prepare(
        "SELECT thread_id FROM checkpoints WHERE checkpoint_id = ?"
      ),
      getLatestCheckpoint: this.db.prepare(
        "SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY timestamp DESC LIMIT 1"
      ),
      deleteCheckpoint: this.db.prepare("DELETE FROM checkpoints WHERE checkpoint_id = ?"),
      deleteThreadCheckpoints: this.db.prepare("DELETE FROM checkpoints WHERE thread_id = ?"),
      deleteThread: this.db.prepare("DELETE FROM checkpoint_threads WHERE thread_id = ?"),
    };
  }

  private ensureThread(threadId: string, timestamp: number): void {
    this.statements.ensureThread.run(threadId, timestamp, timestamp);
  }

  private refreshThreadStats(threadId: string): void {
    const count = this.statements.countThreadCheckpoints.get(threadId) as { count: number };

    this.statements.updateThreadStats.run(count.count, Date.now(), threadId);
  }
}

interface CheckpointRow {
  checkpoint_id: string;
  thread_id: string;
  parent_id: string | null;
  timestamp: number;
  state: Buffer;
  state_encoding: string;
  metadata: string;
  size_bytes: number;
  compressed: number;
}

interface ThreadRow {
  thread_id: string;
  parent_thread_id: string | null;
  name: string | null;
  created_at: number;
  updated_at: number;
  checkpoint_count: number;
}

function mapThread(row: ThreadRow): CheckpointThread {
  return {
    threadId: row.thread_id,
    parentThreadId: row.parent_thread_id ?? undefined,
    metadata: {
      name: row.name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      checkpointCount: row.checkpoint_count,
    },
  };
}

function mapCheckpoint(row: CheckpointRow): Checkpoint {
  const metadata = safeParseMetadata(row.metadata, row.compressed === 1, row.size_bytes);
  const state = decodeState(row.state, row.state_encoding);

  return {
    id: row.checkpoint_id,
    threadId: row.thread_id,
    parentId: row.parent_id ?? undefined,
    timestamp: row.timestamp,
    state,
    metadata,
  };
}

function safeParseMetadata(
  raw: string,
  compressed: boolean,
  sizeBytes: number
): Checkpoint["metadata"] {
  const parsed = safeParseJson(raw) as Partial<Checkpoint["metadata"]>;
  return {
    label: typeof parsed.label === "string" ? parsed.label : undefined,
    trigger: isCheckpointTrigger(parsed.trigger) ? parsed.trigger : "manual",
    compressed,
    sizeBytes,
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function isCheckpointTrigger(value: unknown): value is CheckpointTrigger {
  return value === "auto" || value === "tool" || value === "turn" || value === "manual";
}

function encodeState(
  state: Checkpoint["state"],
  compressionThreshold: number
): { payload: Buffer; encoding: string; compressed: boolean; sizeBytes: number } {
  const json = JSON.stringify(state);
  const sizeBytes = Buffer.byteLength(json);
  if (sizeBytes >= compressionThreshold) {
    return {
      payload: gzipSync(json),
      encoding: "gzip",
      compressed: true,
      sizeBytes,
    };
  }

  return {
    payload: Buffer.from(json),
    encoding: "json",
    compressed: false,
    sizeBytes,
  };
}

function decodeState(buffer: Buffer, encoding: string): Checkpoint["state"] {
  const json = encoding === "gzip" ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  return JSON.parse(json) as Checkpoint["state"];
}
