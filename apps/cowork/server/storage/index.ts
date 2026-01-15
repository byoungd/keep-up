/**
 * Storage layer exports.
 * Provides both JSON-based (development) and SQLite-based (production) stores.
 */

import { join } from "node:path";
import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import { createApprovalStore } from "./approvalStore";
import { createConfigStore } from "./configStore";
import { createSessionStore } from "./sessionStore";
import { createSqliteApprovalStore } from "./sqliteApprovalStore";
import { createSqliteConfigStore } from "./sqliteConfigStore";
import { createSqliteSessionStore } from "./sqliteSessionStore";
import { createSqliteTaskStore } from "./sqliteTaskStore";
import { ensureStateDir } from "./statePaths";
import { createTaskStore } from "./taskStore";
import type { CoworkApproval, CoworkSettings } from "./types";

// JSON-based stores (current default)
export { JsonStore } from "./jsonStore";
export { createSessionStore, type SessionStore } from "./sessionStore";
export { createTaskStore, type TaskStore } from "./taskStore";
export { createApprovalStore, type ApprovalStore } from "./approvalStore";
export { createConfigStore, type ConfigStore } from "./configStore";

// SQLite-based stores (production-ready)
export { getDatabase, closeDatabase } from "./database";
export { createSqliteSessionStore, type SqliteSessionStore } from "./sqliteSessionStore";
export { createSqliteTaskStore, type SqliteTaskStore } from "./sqliteTaskStore";
export { createSqliteApprovalStore, type SqliteApprovalStore } from "./sqliteApprovalStore";
export { createSqliteConfigStore, type SqliteConfigStore } from "./sqliteConfigStore";

// Utilities
export { resolveStateDir, ensureStateDir } from "./statePaths";
export { migrateJsonToSqlite, type MigrationOptions, type MigrationResult } from "./migrations";

export type StorageMode = "json" | "sqlite";

export interface SessionStoreLike {
  getAll(): Promise<CoworkSession[]>;
  getById(sessionId: string): Promise<CoworkSession | null>;
  create(session: CoworkSession): Promise<CoworkSession>;
  update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null>;
}

export interface TaskStoreLike {
  getAll(): Promise<CoworkTask[]>;
  getById(taskId: string): Promise<CoworkTask | null>;
  getBySession(sessionId: string): Promise<CoworkTask[]>;
  create(task: CoworkTask): Promise<CoworkTask>;
  update(taskId: string, updater: (task: CoworkTask) => CoworkTask): Promise<CoworkTask | null>;
}

export interface ApprovalStoreLike {
  getAll(): Promise<CoworkApproval[]>;
  getById(approvalId: string): Promise<CoworkApproval | null>;
  getBySession(sessionId: string): Promise<CoworkApproval[]>;
  create(approval: CoworkApproval): Promise<CoworkApproval>;
  update(
    approvalId: string,
    updater: (approval: CoworkApproval) => CoworkApproval
  ): Promise<CoworkApproval | null>;
}

export interface ConfigStoreLike {
  get(): Promise<CoworkSettings>;
  set(next: CoworkSettings): Promise<CoworkSettings>;
  update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings>;
}

export interface StorageLayer {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  approvalStore: ApprovalStoreLike;
  configStore: ConfigStoreLike;
}

export async function createStorageLayer(mode: StorageMode = "json"): Promise<StorageLayer> {
  if (mode === "sqlite") {
    const [sessionStore, taskStore, approvalStore, configStore] = await Promise.all([
      createSqliteSessionStore(),
      createSqliteTaskStore(),
      createSqliteApprovalStore(),
      createSqliteConfigStore(),
    ]);

    return {
      sessionStore,
      taskStore,
      approvalStore,
      configStore,
    };
  }

  const stateDir = await ensureStateDir();
  return {
    sessionStore: createSessionStore(join(stateDir, "sessions.json")),
    taskStore: createTaskStore(join(stateDir, "tasks.json")),
    approvalStore: createApprovalStore(join(stateDir, "approvals.json")),
    configStore: createConfigStore(join(stateDir, "settings.json")),
  };
}
