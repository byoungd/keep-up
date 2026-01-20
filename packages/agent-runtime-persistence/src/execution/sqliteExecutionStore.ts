import type {
  ExecutionLease,
  ExecutionLeaseFilter,
  ExecutionStateStore,
  ExecutionTaskSnapshot,
  ExecutionTaskSnapshotFilter,
} from "@ku0/agent-runtime-core";
import type { Database as DatabaseInstance } from "better-sqlite3";
import Database from "better-sqlite3";

export interface SQLiteExecutionStateStoreConfig {
  databasePath?: string;
  database?: DatabaseInstance;
}

interface LeaseRow {
  lease_id: string;
  task_id: string;
  worker_id: string;
  status: ExecutionLease["status"];
  acquired_at: number;
  expires_at: number;
  last_heartbeat_at: number;
  attempt: number;
}

interface SnapshotRow {
  task_id: string;
  sequence: number;
  status: ExecutionTaskSnapshot["status"];
  queue_class: ExecutionTaskSnapshot["queueClass"];
  task_type: string;
  attempt: number;
  timestamp: number;
  payload: string;
  worker_id?: string | null;
  result?: string | null;
  error?: string | null;
  model_id?: string | null;
  tool_name?: string | null;
  metadata?: string | null;
}

export class SQLiteExecutionStateStore implements ExecutionStateStore {
  private readonly db: DatabaseInstance;

  constructor(config: SQLiteExecutionStateStoreConfig) {
    this.db = config.database ?? new Database(config.databasePath ?? ":memory:");
    this.initSchema();
  }

  async saveLease(lease: ExecutionLease): Promise<void> {
    const statement = this.db.prepare(`
      INSERT INTO execution_leases (
        lease_id,
        task_id,
        worker_id,
        status,
        acquired_at,
        expires_at,
        last_heartbeat_at,
        attempt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(lease_id) DO UPDATE SET
        task_id = excluded.task_id,
        worker_id = excluded.worker_id,
        status = excluded.status,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at,
        last_heartbeat_at = excluded.last_heartbeat_at,
        attempt = excluded.attempt
    `);

    statement.run(
      lease.leaseId,
      lease.taskId,
      lease.workerId,
      lease.status,
      lease.acquiredAt,
      lease.expiresAt,
      lease.lastHeartbeatAt,
      lease.attempt
    );
  }

  async loadLease(leaseId: string): Promise<ExecutionLease | null> {
    const row = this.db.prepare("SELECT * FROM execution_leases WHERE lease_id = ?").get(leaseId) as
      | LeaseRow
      | undefined;

    return row ? mapLease(row) : null;
  }

  async listLeases(filter?: ExecutionLeaseFilter): Promise<ExecutionLease[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }

    if (filter?.taskId) {
      clauses.push("task_id = ?");
      params.push(filter.taskId);
    }

    if (filter?.workerId) {
      clauses.push("worker_id = ?");
      params.push(filter.workerId);
    }

    const sql = `SELECT * FROM execution_leases${
      clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""
    }`;

    const rows = this.db.prepare(sql).all(...params) as LeaseRow[];
    return rows.map(mapLease);
  }

  async deleteLease(leaseId: string): Promise<void> {
    this.db.prepare("DELETE FROM execution_leases WHERE lease_id = ?").run(leaseId);
  }

  async saveTaskSnapshot(snapshot: ExecutionTaskSnapshot): Promise<void> {
    const statement = this.db.prepare(`
      INSERT INTO execution_task_snapshots (
        task_id,
        sequence,
        status,
        queue_class,
        task_type,
        attempt,
        timestamp,
        payload,
        worker_id,
        result,
        error,
        model_id,
        tool_name,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id, sequence) DO UPDATE SET
        status = excluded.status,
        queue_class = excluded.queue_class,
        task_type = excluded.task_type,
        attempt = excluded.attempt,
        timestamp = excluded.timestamp,
        payload = excluded.payload,
        worker_id = excluded.worker_id,
        result = excluded.result,
        error = excluded.error,
        model_id = excluded.model_id,
        tool_name = excluded.tool_name,
        metadata = excluded.metadata
    `);

    statement.run(
      snapshot.taskId,
      snapshot.sequence,
      snapshot.status,
      snapshot.queueClass,
      snapshot.type,
      snapshot.attempt,
      snapshot.timestamp,
      JSON.stringify(snapshot.payload),
      snapshot.workerId ?? null,
      snapshot.result !== undefined ? JSON.stringify(snapshot.result) : null,
      snapshot.error ?? null,
      snapshot.modelId ?? null,
      snapshot.toolName ?? null,
      snapshot.metadata ? JSON.stringify(snapshot.metadata) : null
    );
  }

  async listTaskSnapshots(filter?: ExecutionTaskSnapshotFilter): Promise<ExecutionTaskSnapshot[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }

    if (filter?.taskId) {
      clauses.push("task_id = ?");
      params.push(filter.taskId);
    }

    if (filter?.afterSequence !== undefined) {
      clauses.push("sequence > ?");
      params.push(filter.afterSequence);
    }

    let sql = "SELECT * FROM execution_task_snapshots";
    if (clauses.length) {
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }
    sql += " ORDER BY sequence ASC";

    if (filter?.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as SnapshotRow[];
    return rows.map(mapSnapshot);
  }

  async getLatestTaskSnapshots(): Promise<ExecutionTaskSnapshot[]> {
    const sql = `
      SELECT s.* FROM execution_task_snapshots s
      INNER JOIN (
        SELECT task_id, MAX(sequence) AS max_sequence
        FROM execution_task_snapshots
        GROUP BY task_id
      ) latest
      ON s.task_id = latest.task_id AND s.sequence = latest.max_sequence
      ORDER BY s.sequence ASC
    `;

    const rows = this.db.prepare(sql).all() as SnapshotRow[];
    return rows.map(mapSnapshot);
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_leases (
        lease_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_heartbeat_at INTEGER NOT NULL,
        attempt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_execution_leases_status
        ON execution_leases(status);

      CREATE TABLE IF NOT EXISTS execution_task_snapshots (
        task_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        queue_class TEXT NOT NULL,
        task_type TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT NOT NULL,
        worker_id TEXT,
        result TEXT,
        error TEXT,
        model_id TEXT,
        tool_name TEXT,
        metadata TEXT,
        PRIMARY KEY (task_id, sequence)
      );

      CREATE INDEX IF NOT EXISTS idx_execution_task_snapshots_sequence
        ON execution_task_snapshots(sequence);

      CREATE INDEX IF NOT EXISTS idx_execution_task_snapshots_status
        ON execution_task_snapshots(status);
    `);
  }
}

function mapLease(row: LeaseRow): ExecutionLease {
  return {
    leaseId: row.lease_id,
    taskId: row.task_id,
    workerId: row.worker_id,
    status: row.status,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    attempt: row.attempt,
  };
}

function mapSnapshot(row: SnapshotRow): ExecutionTaskSnapshot {
  return {
    taskId: row.task_id,
    type: row.task_type,
    queueClass: row.queue_class,
    status: row.status,
    attempt: row.attempt,
    sequence: row.sequence,
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload),
    workerId: row.worker_id ?? undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error ?? undefined,
    modelId: row.model_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
