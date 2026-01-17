/**
 * Storage layer exports.
 * Provides both JSON-based (development) and SQLite-based (production) stores.
 */

import { join } from "node:path";
import { createAgentStateCheckpointStore } from "./agentStateStore";
import { createApprovalStore } from "./approvalStore";
import { createArtifactStore } from "./artifactStore";
import { createAuditLogStore } from "./auditLogStore";
import { createChatMessageStore } from "./chatMessageStore";
import { createConfigStore } from "./configStore";
import type { StorageLayer } from "./contracts";
import { createProjectStore } from "./projectStore";
import { createSessionStore } from "./sessionStore";
import { createSqliteAgentStateStore } from "./sqliteAgentStateStore";
import { createSqliteApprovalStore } from "./sqliteApprovalStore";
import { createSqliteArtifactStore } from "./sqliteArtifactStore";
import { createSqliteAuditLogStore } from "./sqliteAuditLogStore";
import { createSqliteChatMessageStore } from "./sqliteChatMessageStore";
import { createSqliteConfigStore } from "./sqliteConfigStore";
import { createSqliteProjectStore } from "./sqliteProjectStore";
import { createSqliteSessionStore } from "./sqliteSessionStore";
import { createSqliteTaskStore } from "./sqliteTaskStore";
import { ensureStateDir } from "./statePaths";
import { createTaskStore } from "./taskStore";

export {
  type AgentStateCheckpointStore,
  createAgentStateCheckpointStore,
} from "./agentStateStore";
export { type ApprovalStore, createApprovalStore } from "./approvalStore";
export { type ArtifactStore, createArtifactStore } from "./artifactStore";
export { type AuditLogStore, createAuditLogStore } from "./auditLogStore";
export { type ChatMessageStore, createChatMessageStore } from "./chatMessageStore";
export { type ConfigStore, createConfigStore } from "./configStore";
export type {
  AgentStateCheckpointStoreLike,
  ApprovalStoreLike,
  ArtifactStoreLike,
  AuditLogStoreLike,
  ChatMessageStoreLike,
  ConfigStoreLike,
  ProjectStoreLike,
  SessionStoreLike,
  StorageLayer,
  TaskStoreLike,
} from "./contracts";
// SQLite-based stores (production-ready)
export { closeDatabase, getDatabase } from "./database";
// JSON-based stores (current default)
export { JsonStore } from "./jsonStore";
export { type MigrationOptions, type MigrationResult, migrateJsonToSqlite } from "./migrations";
export { createProjectStore, type ProjectStore } from "./projectStore";
export { createSessionStore, type SessionStore } from "./sessionStore";
export { createSqliteAgentStateStore, type SqliteAgentStateStore } from "./sqliteAgentStateStore";
export { createSqliteApprovalStore, type SqliteApprovalStore } from "./sqliteApprovalStore";
export { createSqliteArtifactStore, type SqliteArtifactStore } from "./sqliteArtifactStore";
export {
  type AuditLogStoreLike as SqliteAuditLogStore,
  createSqliteAuditLogStore,
} from "./sqliteAuditLogStore";
export {
  createSqliteChatMessageStore,
  type SqliteChatMessageStore,
} from "./sqliteChatMessageStore";
export { createSqliteConfigStore, type SqliteConfigStore } from "./sqliteConfigStore";
export { createSqliteProjectStore, type SqliteProjectStore } from "./sqliteProjectStore";
export { createSqliteSessionStore, type SqliteSessionStore } from "./sqliteSessionStore";
export { createSqliteTaskStore, type SqliteTaskStore } from "./sqliteTaskStore";
// Utilities
export { ensureStateDir, resolveStateDir } from "./statePaths";
export { createTaskStore, type TaskStore } from "./taskStore";

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
      chatMessageStore,
      approvalStore,
      agentStateStore,
      configStore,
      projectStore,
      auditLogStore,
    ] = await Promise.all([
      createSqliteSessionStore(),
      createSqliteTaskStore(),
      createSqliteArtifactStore(),
      createSqliteChatMessageStore(),
      createSqliteApprovalStore(),
      createSqliteAgentStateStore(),
      createSqliteConfigStore(),
      createSqliteProjectStore(),
      createSqliteAuditLogStore(),
    ]);

    return {
      sessionStore,
      taskStore,
      artifactStore,
      chatMessageStore,
      approvalStore,
      agentStateStore,
      configStore,
      projectStore,
      auditLogStore,
    };
  }

  const stateDir = await ensureStateDir();
  return {
    sessionStore: createSessionStore(join(stateDir, "sessions.json")),
    taskStore: createTaskStore(join(stateDir, "tasks.json")),
    artifactStore: createArtifactStore(join(stateDir, "artifacts.json")),
    chatMessageStore: createChatMessageStore(join(stateDir, "chat_messages.json")),
    approvalStore: createApprovalStore(join(stateDir, "approvals.json")),
    agentStateStore: createAgentStateCheckpointStore(
      join(stateDir, "agent_state_checkpoints.json")
    ),
    configStore: createConfigStore(join(stateDir, "settings.json")),
    projectStore: createProjectStore(join(stateDir, "projects.json")),
    auditLogStore: createAuditLogStore(join(stateDir, "audit_logs.json")),
  };
}
