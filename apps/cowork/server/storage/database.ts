/**
 * SQLite-based storage layer for Cowork.
 * Uses Bun's built-in SQLite for zero-dependency persistence.
 *
 * Benefits over JSON files:
 * - Atomic transactions
 * - Concurrent access support
 * - Indexed queries
 * - Better performance at scale
 */

import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveStateDir } from "./statePaths";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const stateDir = resolveStateDir();
  await mkdir(stateDir, { recursive: true });

  const dbPath = resolve(stateDir, "cowork.db");
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");

  // Initialize schema
  initSchema(db);

  return db;
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      mode TEXT NOT NULL,
      grants TEXT NOT NULL DEFAULT '[]',
      connectors TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    )
  `);

  database.run(`
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

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      action TEXT NOT NULL,
      risk_tags TEXT NOT NULL DEFAULT '[]',
      reason TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    )
  `);

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id)
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
