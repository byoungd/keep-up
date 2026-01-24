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
import { createSqliteStepStore } from "./sqliteStepStore";
import { createSqliteTaskStore } from "./sqliteTaskStore";
import { createSqliteWorkflowTemplateStore } from "./sqliteWorkflowTemplateStore";
import { createSqliteWorkspaceEventStore } from "./sqliteWorkspaceEventStore";
import { createSqliteWorkspaceSessionStore } from "./sqliteWorkspaceSessionStore";
import { ensureStateDir } from "./statePaths";
import { createStepStore } from "./stepStore";
import { createTaskStore } from "./taskStore";
import { createWorkflowTemplateStore } from "./workflowTemplateStore";
import { createWorkspaceEventStore } from "./workspaceEventStore";
import { createWorkspaceSessionStore } from "./workspaceSessionStore";

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
  StepStoreLike,
  StorageLayer,
  TaskStoreLike,
  WorkflowTemplateStoreLike,
  WorkspaceEventStoreLike,
  WorkspaceSessionStoreLike,
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
export { createSqliteStepStore, type SqliteStepStore } from "./sqliteStepStore";
export { createSqliteTaskStore, type SqliteTaskStore } from "./sqliteTaskStore";
export {
  createSqliteWorkflowTemplateStore,
  type SqliteWorkflowTemplateStore,
} from "./sqliteWorkflowTemplateStore";
export {
  createSqliteWorkspaceEventStore,
  type SqliteWorkspaceEventStore,
} from "./sqliteWorkspaceEventStore";
export {
  createSqliteWorkspaceSessionStore,
  type SqliteWorkspaceSessionStore,
} from "./sqliteWorkspaceSessionStore";
// Utilities
export { ensureStateDir, resolveStateDir } from "./statePaths";
export { createStepStore, type StepStore } from "./stepStore";
export { createTaskStore, type TaskStore } from "./taskStore";
export { createWorkflowTemplateStore, type WorkflowTemplateStore } from "./workflowTemplateStore";
export { createWorkspaceEventStore, type WorkspaceEventStore } from "./workspaceEventStore";
export { createWorkspaceSessionStore, type WorkspaceSessionStore } from "./workspaceSessionStore";

export type StorageMode = "json" | "sqlite" | "d1";

export async function createStorageLayer(mode: StorageMode = "json"): Promise<StorageLayer> {
  if (mode === "d1") {
    throw new Error("D1 storage requires the Worker entrypoint (server/worker.ts).");
  }
  if (mode === "sqlite") {
    const [
      sessionStore,
      taskStore,
      stepStore,
      artifactStore,
      chatMessageStore,
      approvalStore,
      workspaceSessionStore,
      workspaceEventStore,
      agentStateStore,
      configStore,
      projectStore,
      auditLogStore,
      workflowTemplateStore,
    ] = await Promise.all([
      createSqliteSessionStore(),
      createSqliteTaskStore(),
      createSqliteStepStore(),
      createSqliteArtifactStore(),
      createSqliteChatMessageStore(),
      createSqliteApprovalStore(),
      createSqliteWorkspaceSessionStore(),
      createSqliteWorkspaceEventStore(),
      createSqliteAgentStateStore(),
      createSqliteConfigStore(),
      createSqliteProjectStore(),
      createSqliteAuditLogStore(),
      createSqliteWorkflowTemplateStore(),
    ]);

    return {
      sessionStore,
      taskStore,
      stepStore,
      artifactStore,
      chatMessageStore,
      approvalStore,
      workspaceSessionStore,
      workspaceEventStore,
      agentStateStore,
      configStore,
      projectStore,
      auditLogStore,
      workflowTemplateStore,
    };
  }

  const stateDir = await ensureStateDir();
  return {
    sessionStore: createSessionStore(join(stateDir, "sessions.json")),
    taskStore: createTaskStore(join(stateDir, "tasks.json")),
    stepStore: createStepStore(join(stateDir, "task_steps.json")),
    artifactStore: createArtifactStore(join(stateDir, "artifacts.json")),
    chatMessageStore: createChatMessageStore(join(stateDir, "chat_messages.json")),
    approvalStore: createApprovalStore(join(stateDir, "approvals.json")),
    workspaceSessionStore: createWorkspaceSessionStore(join(stateDir, "workspace_sessions.json")),
    workspaceEventStore: createWorkspaceEventStore(join(stateDir, "workspace_events.json")),
    agentStateStore: createAgentStateCheckpointStore(
      join(stateDir, "agent_state_checkpoints.json")
    ),
    configStore: createConfigStore(join(stateDir, "settings.json")),
    projectStore: createProjectStore(join(stateDir, "projects.json")),
    auditLogStore: createAuditLogStore(join(stateDir, "audit_logs.json")),
    workflowTemplateStore: createWorkflowTemplateStore(join(stateDir, "workflow_templates.json")),
  };
}
