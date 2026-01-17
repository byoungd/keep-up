/**
 * Helpers for migrating JSON-backed stores to SQLite.
 */

import { join } from "node:path";
import { AgentStateCheckpointStore } from "./agentStateStore";
import { ApprovalStore } from "./approvalStore";
import { ArtifactStore } from "./artifactStore";
import { ChatMessageStore } from "./chatMessageStore";
import { ConfigStore } from "./configStore";
import { getDatabase } from "./database";
import { SessionStore } from "./sessionStore";
import { ensureStateDir } from "./statePaths";
import { TaskStore } from "./taskStore";
import type { CoworkChatMessage, CoworkSettings, CoworkWorkflowTemplateRecord } from "./types";
import { WorkflowTemplateStore } from "./workflowTemplateStore";

export interface MigrationResult {
  sessions: number;
  tasks: number;
  artifacts: number;
  chatMessages: number;
  approvals: number;
  agentStateCheckpoints: number;
  settings: number;
  workflowTemplates: number;
}

export interface MigrationOptions {
  stateDir?: string;
  dryRun?: boolean;
}

function toSettingsEntries(settings: CoworkSettings): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(settings)) {
    entries.push([key, JSON.stringify(value ?? "")]);
  }
  return entries;
}

export async function migrateJsonToSqlite(
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const stateDir = options.stateDir ?? (await ensureStateDir());

  const sessionStore = new SessionStore(join(stateDir, "sessions.json"));
  const taskStore = new TaskStore(join(stateDir, "tasks.json"));
  const artifactStore = new ArtifactStore(join(stateDir, "artifacts.json"));
  const chatMessageStore = new ChatMessageStore(join(stateDir, "chat_messages.json"));
  const approvalStore = new ApprovalStore(join(stateDir, "approvals.json"));
  const agentStateStore = new AgentStateCheckpointStore(
    join(stateDir, "agent_state_checkpoints.json")
  );
  const configStore = new ConfigStore(join(stateDir, "settings.json"));
  const workflowTemplateStore = new WorkflowTemplateStore(
    join(stateDir, "workflow_templates.json")
  );

  const [sessions, tasks, artifacts, chatMessages, approvals, checkpoints, settings, templates] =
    await Promise.all([
      sessionStore.getAll(),
      taskStore.getAll(),
      artifactStore.getAll(),
      chatMessageStore.getAll(),
      approvalStore.getAll(),
      agentStateStore.getAll(),
      configStore.get(),
      workflowTemplateStore.getAll(),
    ]);

  const result: MigrationResult = {
    sessions: sessions.length,
    tasks: tasks.length,
    artifacts: artifacts.length,
    chatMessages: chatMessages.length,
    approvals: approvals.length,
    agentStateCheckpoints: checkpoints.length,
    settings: Object.keys(settings).length,
    workflowTemplates: templates.length,
  };

  if (options.dryRun) {
    return result;
  }

  const db = await getDatabase();
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (session_id, user_id, device_id, platform, mode, grants, connectors, created_at, ended_at)
    VALUES ($sessionId, $userId, $deviceId, $platform, $mode, $grants, $connectors, $createdAt, $endedAt)
  `);

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks
    (task_id, session_id, title, prompt, status, metadata, created_at, updated_at)
    VALUES ($taskId, $sessionId, $title, $prompt, $status, $metadata, $createdAt, $updatedAt)
  `);

  const insertApproval = db.prepare(`
    INSERT OR REPLACE INTO approvals
    (approval_id, session_id, task_id, action, risk_tags, reason, status, created_at, resolved_at)
    VALUES ($approvalId, $sessionId, $taskId, $action, $riskTags, $reason, $status, $createdAt, $resolvedAt)
  `);

  const insertChatMessage = db.prepare(`
    INSERT OR REPLACE INTO chat_messages
    (message_id, session_id, role, content, status, created_at, updated_at, model_id, provider_id, fallback_notice, parent_id, client_request_id, attachments, metadata, task_id)
    VALUES ($messageId, $sessionId, $role, $content, $status, $createdAt, $updatedAt, $modelId, $providerId, $fallbackNotice, $parentId, $clientRequestId, $attachments, $metadata, $taskId)
  `);

  const insertCheckpoint = db.prepare(`
    INSERT OR REPLACE INTO agent_state_checkpoints
    (checkpoint_id, session_id, state, created_at, updated_at)
    VALUES ($checkpointId, $sessionId, $state, $createdAt, $updatedAt)
  `);

  const insertArtifact = db.prepare(`
    INSERT OR REPLACE INTO artifacts
    (artifact_id, session_id, task_id, title, type, artifact, source_path, version, status, applied_at, created_at, updated_at)
    VALUES ($artifactId, $sessionId, $taskId, $title, $type, $artifact, $sourcePath, $version, $status, $appliedAt, $createdAt, $updatedAt)
  `);

  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value)
    VALUES ($key, $value)
  `);

  const insertWorkflowTemplate = db.prepare(`
    INSERT OR REPLACE INTO workflow_templates
    (template_id, name, description, mode, inputs, prompt, expected_artifacts, version, created_at, updated_at, usage_count, last_used_at, last_used_inputs, last_used_session_id)
    VALUES ($templateId, $name, $description, $mode, $inputs, $prompt, $expectedArtifacts, $version, $createdAt, $updatedAt, $usageCount, $lastUsedAt, $lastUsedInputs, $lastUsedSessionId)
  `);

  db.exec("BEGIN");
  try {
    insertSessions(insertSession, sessions);
    insertTasks(insertTask, tasks);
    insertArtifacts(insertArtifact, artifacts);
    insertChatMessages(insertChatMessage, chatMessages);
    insertCheckpoints(insertCheckpoint, checkpoints);
    insertApprovals(insertApproval, approvals);
    insertSettings(insertSetting, settings);
    insertWorkflowTemplates(insertWorkflowTemplate, templates);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return result;
}

function toChatMessageParams(message: CoworkChatMessage) {
  return {
    $messageId: message.messageId,
    $sessionId: message.sessionId,
    $role: message.role,
    $content: message.content,
    $status: message.status,
    $createdAt: message.createdAt,
    $updatedAt: message.updatedAt ?? message.createdAt,
    $modelId: message.modelId ?? null,
    $providerId: message.providerId ?? null,
    $fallbackNotice: message.fallbackNotice ?? null,
    $parentId: message.parentId ?? null,
    $clientRequestId: message.clientRequestId ?? null,
    $attachments: JSON.stringify(message.attachments ?? []),
    $metadata: JSON.stringify(message.metadata ?? {}),
    $taskId: message.taskId ?? null,
  };
}

function insertSessions(
  stmt: { run: (params: Record<string, unknown>) => void },
  sessions: Array<{
    sessionId: string;
    userId: string;
    deviceId: string;
    platform: string;
    mode: string;
    grants: unknown[];
    connectors: unknown[];
    createdAt: number;
  }>
): void {
  for (const session of sessions) {
    stmt.run({
      $sessionId: session.sessionId,
      $userId: session.userId,
      $deviceId: session.deviceId,
      $platform: session.platform,
      $mode: session.mode,
      $grants: JSON.stringify(session.grants),
      $connectors: JSON.stringify(session.connectors),
      $createdAt: session.createdAt,
      $endedAt: null,
    });
  }
}

function insertTasks(
  stmt: { run: (params: Record<string, unknown>) => void },
  tasks: Array<{
    taskId: string;
    sessionId: string;
    title: string;
    prompt: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }>
): void {
  for (const task of tasks) {
    stmt.run({
      $taskId: task.taskId,
      $sessionId: task.sessionId,
      $title: task.title,
      $prompt: task.prompt,
      $status: task.status,
      $metadata: JSON.stringify(task.metadata ?? {}),
      $createdAt: task.createdAt,
      $updatedAt: task.updatedAt,
    });
  }
}

function insertArtifacts(
  stmt: { run: (params: Record<string, unknown>) => void },
  artifacts: Array<{
    artifactId: string;
    sessionId: string;
    taskId?: string;
    title: string;
    type: string;
    artifact: unknown;
    sourcePath?: string;
    version?: number;
    status?: string;
    appliedAt?: number;
    createdAt: number;
    updatedAt: number;
  }>
): void {
  for (const artifact of artifacts) {
    stmt.run({
      $artifactId: artifact.artifactId,
      $sessionId: artifact.sessionId,
      $taskId: artifact.taskId ?? null,
      $title: artifact.title,
      $type: artifact.type,
      $artifact: JSON.stringify(artifact.artifact),
      $sourcePath: artifact.sourcePath ?? null,
      $version: artifact.version ?? 1,
      $status: artifact.status ?? "pending",
      $appliedAt: artifact.appliedAt ?? null,
      $createdAt: artifact.createdAt,
      $updatedAt: artifact.updatedAt,
    });
  }
}

function insertWorkflowTemplates(
  stmt: { run: (params: Record<string, unknown>) => void },
  templates: CoworkWorkflowTemplateRecord[]
): void {
  for (const template of templates) {
    stmt.run({
      $templateId: template.templateId,
      $name: template.name,
      $description: template.description,
      $mode: template.mode,
      $inputs: JSON.stringify(template.inputs ?? []),
      $prompt: template.prompt,
      $expectedArtifacts: JSON.stringify(template.expectedArtifacts ?? []),
      $version: template.version,
      $createdAt: template.createdAt,
      $updatedAt: template.updatedAt,
      $usageCount: template.usageCount ?? 0,
      $lastUsedAt: template.lastUsedAt ?? null,
      $lastUsedInputs: template.lastUsedInputs ? JSON.stringify(template.lastUsedInputs) : null,
      $lastUsedSessionId: template.lastUsedSessionId ?? null,
    });
  }
}

function insertChatMessages(
  stmt: { run: (params: Record<string, unknown>) => void },
  messages: CoworkChatMessage[]
): void {
  for (const message of messages) {
    stmt.run(toChatMessageParams(message));
  }
}

function insertCheckpoints(
  stmt: { run: (params: Record<string, unknown>) => void },
  checkpoints: Array<{
    checkpointId: string;
    sessionId: string;
    state: unknown;
    createdAt: number;
    updatedAt: number;
  }>
): void {
  for (const checkpoint of checkpoints) {
    stmt.run({
      $checkpointId: checkpoint.checkpointId,
      $sessionId: checkpoint.sessionId,
      $state: JSON.stringify(checkpoint.state),
      $createdAt: checkpoint.createdAt,
      $updatedAt: checkpoint.updatedAt,
    });
  }
}

function insertApprovals(
  stmt: { run: (params: Record<string, unknown>) => void },
  approvals: Array<{
    approvalId: string;
    sessionId: string;
    taskId?: string;
    action: string;
    riskTags?: string[];
    reason?: string;
    status: string;
    createdAt: number;
    resolvedAt?: number;
  }>
): void {
  for (const approval of approvals) {
    stmt.run({
      $approvalId: approval.approvalId,
      $sessionId: approval.sessionId,
      $taskId: approval.taskId ?? null,
      $action: approval.action,
      $riskTags: JSON.stringify(approval.riskTags ?? []),
      $reason: approval.reason ?? null,
      $status: approval.status,
      $createdAt: approval.createdAt,
      $resolvedAt: approval.resolvedAt ?? null,
    });
  }
}

function insertSettings(
  stmt: { run: (params: Record<string, unknown>) => void },
  settings: CoworkSettings
): void {
  for (const [key, value] of toSettingsEntries(settings)) {
    stmt.run({ $key: key, $value: value });
  }
}
