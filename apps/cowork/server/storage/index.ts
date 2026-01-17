/**
 * Storage layer exports.
 * Provides both JSON-based (development) and SQLite-based (production) stores.
 */

import { join } from "node:path";
import { createAgentStateCheckpointStore } from "./agentStateStore";
import { createApprovalStore } from "./approvalStore";
import { createArtifactStore } from "./artifactStore";
import { createConfigStore } from "./configStore";
import type { StorageLayer } from "./contracts";
import { createProjectStore } from "./projectStore";
import { createSessionStore } from "./sessionStore";
import { createSqliteAgentStateStore } from "./sqliteAgentStateStore";
import { createSqliteApprovalStore } from "./sqliteApprovalStore";
import { createSqliteArtifactStore } from "./sqliteArtifactStore";
import { createSqliteConfigStore } from "./sqliteConfigStore";
import { createSqliteProjectStore } from "./sqliteProjectStore";
import { createSqliteSessionStore } from "./sqliteSessionStore";
import { createSqliteTaskStore } from "./sqliteTaskStore";
import { ensureStateDir } from "./statePaths";
import { createTaskStore } from "./taskStore";

// JSON-based stores (current default)
export { JsonStore } from "./jsonStore";
export { createSessionStore, type SessionStore } from "./sessionStore";
export { createTaskStore, type TaskStore } from "./taskStore";
export { createArtifactStore, type ArtifactStore } from "./artifactStore";
export { createProjectStore, type ProjectStore } from "./projectStore";
export { createApprovalStore, type ApprovalStore } from "./approvalStore";
export {
  createAgentStateCheckpointStore,
  type AgentStateCheckpointStore,
} from "./agentStateStore";
export { createConfigStore, type ConfigStore } from "./configStore";

// SQLite-based stores (production-ready)
export { getDatabase, closeDatabase } from "./database";
export { createSqliteSessionStore, type SqliteSessionStore } from "./sqliteSessionStore";
export { createSqliteTaskStore, type SqliteTaskStore } from "./sqliteTaskStore";
export { createSqliteArtifactStore, type SqliteArtifactStore } from "./sqliteArtifactStore";
export { createSqliteApprovalStore, type SqliteApprovalStore } from "./sqliteApprovalStore";
export { createSqliteConfigStore, type SqliteConfigStore } from "./sqliteConfigStore";
export { createSqliteProjectStore, type SqliteProjectStore } from "./sqliteProjectStore";
export { createSqliteAgentStateStore, type SqliteAgentStateStore } from "./sqliteAgentStateStore";

// Utilities
export { resolveStateDir, ensureStateDir } from "./statePaths";
export { migrateJsonToSqlite, type MigrationOptions, type MigrationResult } from "./migrations";
export type {
  AgentStateCheckpointStoreLike,
  ApprovalStoreLike,
  ArtifactStoreLike,
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
    const [
      sessionStore,
      taskStore,
      artifactStore,
      approvalStore,
      agentStateStore,
      configStore,
      projectStore,
    ] = await Promise.all([
      createSqliteSessionStore(),
      createSqliteTaskStore(),
      createSqliteArtifactStore(),
      createSqliteApprovalStore(),
      createSqliteAgentStateStore(),
      createSqliteConfigStore(),
      createSqliteProjectStore(),
    ]);

    return {
      sessionStore,
      taskStore,
      artifactStore,
      approvalStore,
      agentStateStore,
      configStore,
      projectStore,
    };
  }

  const stateDir = await ensureStateDir();
  return {
    sessionStore: createSessionStore(join(stateDir, "sessions.json")),
    taskStore: createTaskStore(join(stateDir, "tasks.json")),
    artifactStore: createArtifactStore(join(stateDir, "artifacts.json")),
    approvalStore: createApprovalStore(join(stateDir, "approvals.json")),
    agentStateStore: createAgentStateCheckpointStore(
      join(stateDir, "agent_state_checkpoints.json")
    ),
    configStore: createConfigStore(join(stateDir, "settings.json")),
    projectStore: createProjectStore(join(stateDir, "projects.json")),
  };
}
