/**
 * SQLite-based storage layer for Cowork.
 * Uses better-sqlite3 for portable Node.js persistence.
 *
 * Benefits over JSON files:
 * - Atomic transactions
 * - Concurrent access support
 * - Indexed queries
 * - Better performance at scale
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Database as DatabaseInstance } from "better-sqlite3";
import Database from "better-sqlite3";
import { resolveStateDir } from "./statePaths";

let db: DatabaseInstance | null = null;

export async function getDatabase(): Promise<DatabaseInstance> {
  if (db) {
    return db;
  }

  const stateDir = resolveStateDir();
  await mkdir(stateDir, { recursive: true });

  const dbPath = resolve(stateDir, "cowork.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");

  // Initialize schema
  initSchema(db);

  return db;
}

function initSchema(database: DatabaseInstance): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      mode TEXT NOT NULL,
      grants TEXT NOT NULL DEFAULT '[]',
      connectors TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ended_at INTEGER
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      artifact_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      artifact TEXT NOT NULL,
      source_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id)
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      action TEXT NOT NULL,
      risk_tags TEXT NOT NULL DEFAULT '[]',
      reason TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_state_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_state_checkpoints_session
    ON agent_state_checkpoints(session_id)
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      path_hint TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT DEFAULT '{}'
    )
  `);

  try {
    database.exec("ALTER TABLE sessions ADD COLUMN project_id TEXT");
  } catch {
    // Column likely exists
  }

  try {
    database.exec("ALTER TABLE approvals ADD COLUMN task_id TEXT");
  } catch {
    // Column likely exists
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Audit log table for tracking all tool actions and policy decisions
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      entry_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      timestamp INTEGER NOT NULL,
      action TEXT NOT NULL,
      tool_name TEXT,
      input TEXT,
      output TEXT,
      decision TEXT,
      rule_id TEXT,
      risk_tags TEXT DEFAULT '[]',
      reason TEXT,
      duration_ms INTEGER,
      outcome TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_task ON audit_logs(task_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
