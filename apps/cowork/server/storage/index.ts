/**
 * Storage layer exports.
 * Provides both JSON-based (development) and SQLite-based (production) stores.
 */

import { join } from "node:path";
import { createApprovalStore } from "./approvalStore";
import { createConfigStore } from "./configStore";
import type { StorageLayer } from "./contracts";
import { createProjectStore } from "./projectStore";
import { createSessionStore } from "./sessionStore";
import { createSqliteApprovalStore } from "./sqliteApprovalStore";
import { createSqliteConfigStore } from "./sqliteConfigStore";
import { createSqliteSessionStore } from "./sqliteSessionStore";
import { createSqliteTaskStore } from "./sqliteTaskStore";
import { ensureStateDir } from "./statePaths";
import { createTaskStore } from "./taskStore";

// JSON-based stores (current default)
export { JsonStore } from "./jsonStore";
export { createSessionStore, type SessionStore } from "./sessionStore";
export { createTaskStore, type TaskStore } from "./taskStore";
export { createProjectStore, type ProjectStore } from "./projectStore";
export { createApprovalStore, type ApprovalStore } from "./approvalStore";
export { createConfigStore, type ConfigStore } from "./configStore";

// SQLite-based stores (production-ready)
export { getDatabase, closeDatabase } from "./database";
export { createSqliteSessionStore, type SqliteSessionStore } from "./sqliteSessionStore";
export { createSqliteTaskStore, type SqliteTaskStore } from "./sqliteTaskStore";
export { createSqliteApprovalStore, type SqliteApprovalStore } from "./sqliteApprovalStore";
export { createSqliteConfigStore, type SqliteConfigStore } from "./sqliteConfigStore";
export { createSqliteProjectStore, type SqliteProjectStore } from "./sqliteProjectStore";

// Utilities
export { resolveStateDir, ensureStateDir } from "./statePaths";
export { migrateJsonToSqlite, type MigrationOptions, type MigrationResult } from "./migrations";
export type {
  ApprovalStoreLike,
  ConfigStoreLike,
  ProjectStoreLike,
  SessionStoreLike,
  StorageLayer,
  TaskStoreLike,
} from "./contracts";

export type StorageMode = "json" | "sqlite" | "d1";

export async function createStorageLayer(mode: StorageMode = "json"): Promise<StorageLayer> {
  if (mode === "d1") {
    throw new Error("D1 storage requires the Worker entrypoint (server/worker.ts).");
  }
  if (mode === "sqlite") {
    const [sessionStore, taskStore, approvalStore, configStore, projectStore] = await Promise.all([
      createSqliteSessionStore(),
      createSqliteTaskStore(),
      createSqliteApprovalStore(),
      createSqliteConfigStore(),
      createSqliteProjectStore(),
    ]);

    return {
      sessionStore,
      taskStore,
      approvalStore,
      configStore,
      projectStore,
    };
  }

  const stateDir = await ensureStateDir();
  return {
    sessionStore: createSessionStore(join(stateDir, "sessions.json")),
    taskStore: createTaskStore(join(stateDir, "tasks.json")),
    approvalStore: createApprovalStore(join(stateDir, "approvals.json")),
    configStore: createConfigStore(join(stateDir, "settings.json")),
    projectStore: createProjectStore(join(stateDir, "projects.json")),
  };
}
