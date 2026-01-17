import type {
  CoworkConnectorGrant,
  CoworkFolderGrant,
  CoworkProject,
  CoworkSession,
  CoworkTask,
  CoworkWorkflowTemplate,
} from "@ku0/agent-runtime";
import type {
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
  WorkflowTemplateStoreLike,
} from "./contracts";
import type {
  AgentStateCheckpointRecord,
  CoworkApproval,
  CoworkArtifactRecord,
  CoworkAuditAction,
  CoworkAuditEntry,
  CoworkAuditFilter,
  CoworkChatMessage,
  CoworkSettings,
} from "./types";

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; changes?: number }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec?(query: string): Promise<unknown>;
}

let schemaInitialized = false;

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaInitialized) {
    return;
  }

  const statements = [
    `
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
    `,
    `
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)
    `,
    `
      CREATE TABLE IF NOT EXISTS artifacts (
        artifact_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task_id TEXT,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        artifact TEXT NOT NULL,
        source_path TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        applied_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id)
    `,
    `
      CREATE TABLE IF NOT EXISTS approvals (
        approval_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        task_id TEXT,
        action TEXT NOT NULL,
        risk_tags TEXT NOT NULL DEFAULT '[]',
        reason TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)
    `,
    `
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
        outcome TEXT
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_audit_logs_task ON audit_logs(task_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)
    `,
    `
      CREATE TABLE IF NOT EXISTS chat_messages (
        message_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        model_id TEXT,
        provider_id TEXT,
        fallback_notice TEXT,
        parent_id TEXT,
        client_request_id TEXT,
        attachments TEXT NOT NULL DEFAULT '[]',
        metadata TEXT DEFAULT '{}',
        task_id TEXT
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_chat_messages_request ON chat_messages(client_request_id)
    `,
    `
      CREATE TABLE IF NOT EXISTS agent_state_checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_agent_state_checkpoints_session
      ON agent_state_checkpoints(session_id)
    `,
    `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        path_hint TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS workflow_templates (
        template_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        mode TEXT NOT NULL,
        inputs TEXT NOT NULL DEFAULT '[]',
        prompt TEXT NOT NULL,
        expected_artifacts TEXT NOT NULL DEFAULT '[]',
        version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        last_used_inputs TEXT,
        last_used_session_id TEXT
      )
    `,
  ];

  if (db.exec) {
    for (const statement of statements) {
      await db.exec(statement);
    }
  } else {
    for (const statement of statements) {
      await db.prepare(statement).run();
    }
  }

  const optionalStatements = [
    "ALTER TABLE artifacts ADD COLUMN version INTEGER DEFAULT 1",
    "ALTER TABLE artifacts ADD COLUMN status TEXT DEFAULT 'pending'",
    "ALTER TABLE artifacts ADD COLUMN applied_at INTEGER",
  ];

  for (const statement of optionalStatements) {
    try {
      if (db.exec) {
        await db.exec(statement);
      } else {
        await db.prepare(statement).run();
      }
    } catch (error) {
      void error;
    }
  }

  schemaInitialized = true;
}

function prepare(db: D1Database, query: string, values: unknown[] = []): D1PreparedStatement {
  const statement = db.prepare(query);
  return values.length > 0 ? statement.bind(...values) : statement;
}

function parseRiskTags(raw: string): CoworkApproval["riskTags"] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CoworkApproval["riskTags"]) : [];
  } catch {
    return [];
  }
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (typeof raw !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const ALLOWED_SETTINGS = new Set<keyof CoworkSettings>([
  "providerKeys",
  "openAiKey",
  "anthropicKey",
  "geminiKey",
  "defaultModel",
  "theme",
]);

function parseSettingValue(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function applySetting(settings: CoworkSettings, key: string, value: unknown): void {
  if (!ALLOWED_SETTINGS.has(key as keyof CoworkSettings) || value === undefined) {
    return;
  }

  if (key === "theme") {
    if (value === "light" || value === "dark") {
      settings.theme = value;
    }
    return;
  }

  if (key === "providerKeys") {
    if (isRecord(value)) {
      settings.providerKeys = value as CoworkSettings["providerKeys"];
    }
    return;
  }

  if (typeof value === "string" && isStringSettingKey(key)) {
    settings[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringSettingKey(
  key: string
): key is "openAiKey" | "anthropicKey" | "geminiKey" | "defaultModel" {
  return (
    key === "openAiKey" || key === "anthropicKey" || key === "geminiKey" || key === "defaultModel"
  );
}

function rowToSession(row: Record<string, unknown>): CoworkSession {
  return {
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    deviceId: String(row.device_id),
    platform: row.platform as CoworkSession["platform"],
    mode: row.mode as CoworkSession["mode"],
    grants: parseJsonArray<CoworkFolderGrant>(row.grants),
    connectors: parseJsonArray<CoworkConnectorGrant>(row.connectors),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToTask(row: Record<string, unknown>): CoworkTask {
  return {
    taskId: String(row.task_id),
    sessionId: String(row.session_id),
    title: String(row.title),
    prompt: String(row.prompt),
    status: row.status as CoworkTask["status"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToApproval(row: Record<string, unknown>): CoworkApproval {
  return {
    approvalId: String(row.approval_id),
    sessionId: String(row.session_id),
    taskId: row.task_id ? String(row.task_id) : undefined,
    action: String(row.action),
    riskTags: parseRiskTags(String(row.risk_tags ?? "[]")),
    reason: row.reason ? String(row.reason) : undefined,
    status: row.status as CoworkApproval["status"],
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
  };
}

function parseArtifactPayload(raw: unknown): CoworkArtifactRecord["artifact"] {
  if (typeof raw !== "string") {
    return { type: "markdown", content: "" };
  }
  try {
    return JSON.parse(raw) as CoworkArtifactRecord["artifact"];
  } catch {
    return { type: "markdown", content: "" };
  }
}

function rowToArtifact(row: Record<string, unknown>): CoworkArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    sessionId: String(row.session_id),
    taskId: row.task_id ? String(row.task_id) : undefined,
    title: String(row.title),
    type: row.type as CoworkArtifactRecord["type"],
    artifact: parseArtifactPayload(row.artifact),
    sourcePath: row.source_path ? String(row.source_path) : undefined,
    version: typeof row.version === "number" ? row.version : 1,
    status: (row.status as CoworkArtifactRecord["status"]) ?? "pending",
    appliedAt: row.applied_at ? Number(row.applied_at) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function rowToChatMessage(row: Record<string, unknown>): CoworkChatMessage {
  return {
    messageId: String(row.message_id),
    sessionId: String(row.session_id),
    role: row.role as CoworkChatMessage["role"],
    content: String(row.content),
    status: row.status as CoworkChatMessage["status"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    modelId: row.model_id ? String(row.model_id) : undefined,
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    fallbackNotice: row.fallback_notice ? String(row.fallback_notice) : undefined,
    parentId: row.parent_id ? String(row.parent_id) : undefined,
    clientRequestId: row.client_request_id ? String(row.client_request_id) : undefined,
    attachments: parseJsonArray<NonNullable<CoworkChatMessage["attachments"]>[number]>(
      row.attachments
    ),
    metadata: parseJsonObject(row.metadata),
    taskId: row.task_id ? String(row.task_id) : undefined,
  };
}

function rowToAgentStateCheckpoint(row: Record<string, unknown>): AgentStateCheckpointRecord {
  return {
    checkpointId: String(row.checkpoint_id),
    sessionId: String(row.session_id),
    state: JSON.parse(String(row.state)) as AgentStateCheckpointRecord["state"],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function createD1SessionStore(db: D1Database): Promise<SessionStoreLike> {
  return {
    async getAll(): Promise<CoworkSession[]> {
      const result = await prepare(db, "SELECT * FROM sessions ORDER BY created_at DESC").all();
      return result.results.map(rowToSession);
    },

    async getById(sessionId: string): Promise<CoworkSession | null> {
      const row = await prepare(db, "SELECT * FROM sessions WHERE session_id = ?", [
        sessionId,
      ]).first();
      return row ? rowToSession(row) : null;
    },

    async create(session: CoworkSession): Promise<CoworkSession> {
      await prepare(
        db,
        `INSERT INTO sessions
          (session_id, user_id, device_id, platform, mode, grants, connectors, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          session.userId,
          session.deviceId,
          session.platform,
          session.mode,
          JSON.stringify(session.grants ?? []),
          JSON.stringify(session.connectors ?? []),
          session.createdAt,
          session.updatedAt || session.createdAt,
        ]
      ).run();
      return session;
    },

    async update(
      sessionId: string,
      updater: (session: CoworkSession) => CoworkSession
    ): Promise<CoworkSession | null> {
      const existing = await prepare(db, "SELECT * FROM sessions WHERE session_id = ?", [
        sessionId,
      ]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToSession(existing));
      await prepare(
        db,
        `UPDATE sessions
          SET user_id = ?, device_id = ?, platform = ?, mode = ?, grants = ?, connectors = ?, updated_at = ?, ended_at = ?
          WHERE session_id = ?`,
        [
          updated.userId,
          updated.deviceId,
          updated.platform,
          updated.mode,
          JSON.stringify(updated.grants ?? []),
          JSON.stringify(updated.connectors ?? []),
          Date.now(),
          updated.endedAt || null,
          updated.sessionId,
        ]
      ).run();
      return updated;
    },

    async delete(sessionId: string): Promise<boolean> {
      const result = await prepare(db, "DELETE FROM sessions WHERE session_id = ?", [
        sessionId,
      ]).run();
      return (result.changes ?? 0) > 0;
    },
  };
}

async function createD1AgentStateStore(db: D1Database): Promise<AgentStateCheckpointStoreLike> {
  return {
    async getAll(): Promise<AgentStateCheckpointRecord[]> {
      const result = await prepare(
        db,
        "SELECT * FROM agent_state_checkpoints ORDER BY created_at ASC"
      ).all();
      return result.results.map(rowToAgentStateCheckpoint);
    },

    async getById(checkpointId: string): Promise<AgentStateCheckpointRecord | null> {
      const row = await prepare(
        db,
        "SELECT * FROM agent_state_checkpoints WHERE checkpoint_id = ?",
        [checkpointId]
      ).first();
      return row ? rowToAgentStateCheckpoint(row) : null;
    },

    async getBySession(sessionId: string): Promise<AgentStateCheckpointRecord[]> {
      const result = await prepare(
        db,
        "SELECT * FROM agent_state_checkpoints WHERE session_id = ? ORDER BY created_at ASC",
        [sessionId]
      ).all();
      return result.results.map(rowToAgentStateCheckpoint);
    },

    async create(record: AgentStateCheckpointRecord): Promise<AgentStateCheckpointRecord> {
      await prepare(
        db,
        `INSERT INTO agent_state_checkpoints
          (checkpoint_id, session_id, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
        [
          record.checkpointId,
          record.sessionId,
          JSON.stringify(record.state),
          record.createdAt,
          record.updatedAt,
        ]
      ).run();
      return record;
    },
  };
}

async function createD1TaskStore(db: D1Database): Promise<TaskStoreLike> {
  return {
    async getAll(): Promise<CoworkTask[]> {
      const result = await prepare(db, "SELECT * FROM tasks ORDER BY created_at DESC").all();
      return result.results.map(rowToTask);
    },

    async getById(taskId: string): Promise<CoworkTask | null> {
      const row = await prepare(db, "SELECT * FROM tasks WHERE task_id = ?", [taskId]).first();
      return row ? rowToTask(row) : null;
    },

    async getBySession(sessionId: string): Promise<CoworkTask[]> {
      const result = await prepare(
        db,
        "SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC",
        [sessionId]
      ).all();
      return result.results.map(rowToTask);
    },

    async create(task: CoworkTask): Promise<CoworkTask> {
      await prepare(
        db,
        `INSERT INTO tasks
          (task_id, session_id, title, prompt, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          task.taskId,
          task.sessionId,
          task.title,
          task.prompt,
          task.status,
          task.createdAt,
          task.updatedAt,
        ]
      ).run();
      return task;
    },

    async update(
      taskId: string,
      updater: (task: CoworkTask) => CoworkTask
    ): Promise<CoworkTask | null> {
      const existing = await prepare(db, "SELECT * FROM tasks WHERE task_id = ?", [taskId]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToTask(existing));
      await prepare(
        db,
        `UPDATE tasks
          SET title = ?, prompt = ?, status = ?, updated_at = ?
          WHERE task_id = ?`,
        [updated.title, updated.prompt, updated.status, updated.updatedAt, updated.taskId]
      ).run();
      return updated;
    },
  };
}

async function createD1ArtifactStore(db: D1Database): Promise<ArtifactStoreLike> {
  return {
    async getAll(): Promise<CoworkArtifactRecord[]> {
      const result = await prepare(db, "SELECT * FROM artifacts ORDER BY created_at DESC").all();
      return result.results.map(rowToArtifact);
    },

    async getById(artifactId: string): Promise<CoworkArtifactRecord | null> {
      const row = await prepare(db, "SELECT * FROM artifacts WHERE artifact_id = ?", [
        artifactId,
      ]).first();
      return row ? rowToArtifact(row) : null;
    },

    async getBySession(sessionId: string): Promise<CoworkArtifactRecord[]> {
      const result = await prepare(
        db,
        "SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC",
        [sessionId]
      ).all();
      return result.results.map(rowToArtifact);
    },

    async getByTask(taskId: string): Promise<CoworkArtifactRecord[]> {
      const result = await prepare(
        db,
        "SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC",
        [taskId]
      ).all();
      return result.results.map(rowToArtifact);
    },

    async upsert(artifact: CoworkArtifactRecord): Promise<CoworkArtifactRecord> {
      await prepare(
        db,
        `INSERT INTO artifacts
          (artifact_id, session_id, task_id, title, type, artifact, source_path, version, status, applied_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(artifact_id) DO UPDATE SET
            session_id = excluded.session_id,
            task_id = excluded.task_id,
            title = excluded.title,
            type = excluded.type,
            artifact = excluded.artifact,
            source_path = excluded.source_path,
            version = excluded.version,
            status = excluded.status,
            applied_at = excluded.applied_at,
            updated_at = excluded.updated_at`,
        [
          artifact.artifactId,
          artifact.sessionId,
          artifact.taskId ?? null,
          artifact.title,
          artifact.type,
          JSON.stringify(artifact.artifact),
          artifact.sourcePath ?? null,
          artifact.version,
          artifact.status,
          artifact.appliedAt ?? null,
          artifact.createdAt,
          artifact.updatedAt,
        ]
      ).run();
      return artifact;
    },

    async delete(artifactId: string): Promise<boolean> {
      const result = await prepare(db, "DELETE FROM artifacts WHERE artifact_id = ?", [
        artifactId,
      ]).run();
      return (result.changes ?? 0) > 0;
    },
  };
}

async function createD1ChatMessageStore(db: D1Database): Promise<ChatMessageStoreLike> {
  return {
    async getAll(): Promise<CoworkChatMessage[]> {
      const result = await prepare(db, "SELECT * FROM chat_messages ORDER BY created_at ASC").all();
      return result.results.map(rowToChatMessage);
    },

    async getById(messageId: string): Promise<CoworkChatMessage | null> {
      const row = await prepare(db, "SELECT * FROM chat_messages WHERE message_id = ?", [
        messageId,
      ]).first();
      return row ? rowToChatMessage(row) : null;
    },

    async getBySession(sessionId: string): Promise<CoworkChatMessage[]> {
      const result = await prepare(
        db,
        "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
        [sessionId]
      ).all();
      return result.results.map(rowToChatMessage);
    },

    async getByClientRequestId(
      clientRequestId: string,
      role?: CoworkChatMessage["role"]
    ): Promise<CoworkChatMessage | null> {
      const row = await prepare(
        db,
        role
          ? "SELECT * FROM chat_messages WHERE client_request_id = ? AND role = ? ORDER BY created_at DESC LIMIT 1"
          : "SELECT * FROM chat_messages WHERE client_request_id = ? ORDER BY created_at DESC LIMIT 1",
        role ? [clientRequestId, role] : [clientRequestId]
      ).first();
      return row ? rowToChatMessage(row) : null;
    },

    async create(message: CoworkChatMessage): Promise<CoworkChatMessage> {
      await prepare(
        db,
        `INSERT OR REPLACE INTO chat_messages
          (message_id, session_id, role, content, status, created_at, updated_at, model_id, provider_id, fallback_notice, parent_id, client_request_id, attachments, metadata, task_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.messageId,
          message.sessionId,
          message.role,
          message.content,
          message.status,
          message.createdAt,
          message.updatedAt ?? message.createdAt,
          message.modelId ?? null,
          message.providerId ?? null,
          message.fallbackNotice ?? null,
          message.parentId ?? null,
          message.clientRequestId ?? null,
          JSON.stringify(message.attachments ?? []),
          JSON.stringify(message.metadata ?? {}),
          message.taskId ?? null,
        ]
      ).run();
      return message;
    },

    async update(
      messageId: string,
      updater: (message: CoworkChatMessage) => CoworkChatMessage
    ): Promise<CoworkChatMessage | null> {
      const existing = await prepare(db, "SELECT * FROM chat_messages WHERE message_id = ?", [
        messageId,
      ]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToChatMessage(existing));
      await prepare(
        db,
        `UPDATE chat_messages
          SET session_id = ?, role = ?, content = ?, status = ?, updated_at = ?, model_id = ?, provider_id = ?, fallback_notice = ?, parent_id = ?, client_request_id = ?, attachments = ?, metadata = ?, task_id = ?
          WHERE message_id = ?`,
        [
          updated.sessionId,
          updated.role,
          updated.content,
          updated.status,
          updated.updatedAt ?? Date.now(),
          updated.modelId ?? null,
          updated.providerId ?? null,
          updated.fallbackNotice ?? null,
          updated.parentId ?? null,
          updated.clientRequestId ?? null,
          JSON.stringify(updated.attachments ?? []),
          JSON.stringify(updated.metadata ?? {}),
          updated.taskId ?? null,
          updated.messageId,
        ]
      ).run();
      return updated;
    },
  };
}

async function createD1ApprovalStore(db: D1Database): Promise<ApprovalStoreLike> {
  return {
    async getAll(): Promise<CoworkApproval[]> {
      const result = await prepare(db, "SELECT * FROM approvals ORDER BY created_at DESC").all();
      return result.results.map(rowToApproval);
    },

    async getById(approvalId: string): Promise<CoworkApproval | null> {
      const row = await prepare(db, "SELECT * FROM approvals WHERE approval_id = ?", [
        approvalId,
      ]).first();
      return row ? rowToApproval(row) : null;
    },

    async getBySession(sessionId: string): Promise<CoworkApproval[]> {
      const result = await prepare(
        db,
        "SELECT * FROM approvals WHERE session_id = ? ORDER BY created_at DESC",
        [sessionId]
      ).all();
      return result.results.map(rowToApproval);
    },

    async create(approval: CoworkApproval): Promise<CoworkApproval> {
      await prepare(
        db,
        `INSERT OR REPLACE INTO approvals
          (approval_id, session_id, task_id, action, risk_tags, reason, status, created_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.approvalId,
          approval.sessionId,
          approval.taskId ?? null,
          approval.action,
          JSON.stringify(approval.riskTags ?? []),
          approval.reason ?? null,
          approval.status,
          approval.createdAt,
          approval.resolvedAt ?? null,
        ]
      ).run();
      return approval;
    },

    async update(
      approvalId: string,
      updater: (approval: CoworkApproval) => CoworkApproval
    ): Promise<CoworkApproval | null> {
      const existing = await prepare(db, "SELECT * FROM approvals WHERE approval_id = ?", [
        approvalId,
      ]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToApproval(existing));
      await prepare(
        db,
        `UPDATE approvals
          SET session_id = ?, task_id = ?, action = ?, risk_tags = ?, reason = ?, status = ?, created_at = ?, resolved_at = ?
          WHERE approval_id = ?`,
        [
          updated.sessionId,
          updated.taskId ?? null,
          updated.action,
          JSON.stringify(updated.riskTags ?? []),
          updated.reason ?? null,
          updated.status,
          updated.createdAt,
          updated.resolvedAt ?? null,
          updated.approvalId,
        ]
      ).run();
      return updated;
    },
  };
}

async function createD1ConfigStore(db: D1Database): Promise<ConfigStoreLike> {
  async function readAll(): Promise<CoworkSettings> {
    const result = await prepare(db, "SELECT key, value FROM settings").all<{
      key: string;
      value: string;
    }>();
    const settings: CoworkSettings = {};

    for (const row of result.results) {
      const value = parseSettingValue(row.value);
      applySetting(settings, row.key, value);
    }

    return settings;
  }

  const setSettings = async (next: CoworkSettings): Promise<CoworkSettings> => {
    const entries = Object.entries(next);
    for (const [key, value] of entries) {
      if (!ALLOWED_SETTINGS.has(key as keyof CoworkSettings)) {
        continue;
      }
      await prepare(db, "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
        key,
        JSON.stringify(value ?? ""),
      ]).run();
    }
    return next;
  };

  return {
    async get(): Promise<CoworkSettings> {
      return readAll();
    },

    async set(next: CoworkSettings): Promise<CoworkSettings> {
      return setSettings(next);
    },

    async update(updater: (current: CoworkSettings) => CoworkSettings): Promise<CoworkSettings> {
      const current = await readAll();
      const next = updater(current);
      await setSettings(next);
      return next;
    },
  };
}

function rowToProject(row: Record<string, unknown>): CoworkProject {
  return {
    projectId: String(row.project_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    pathHint: row.path_hint ? String(row.path_hint) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    metadata: row.metadata
      ? (JSON.parse(String(row.metadata)) as Record<string, unknown>)
      : undefined,
  };
}

async function createD1ProjectStore(db: D1Database): Promise<ProjectStoreLike> {
  return {
    async getAll(): Promise<CoworkProject[]> {
      const result = await prepare(db, "SELECT * FROM projects ORDER BY created_at DESC").all();
      return result.results.map(rowToProject);
    },

    async getById(projectId: string): Promise<CoworkProject | null> {
      const row = await prepare(db, "SELECT * FROM projects WHERE project_id = ?", [
        projectId,
      ]).first();
      return row ? rowToProject(row) : null;
    },

    async create(project: CoworkProject): Promise<CoworkProject> {
      await prepare(
        db,
        `INSERT INTO projects
          (project_id, name, description, path_hint, created_at, updated_at, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          project.projectId,
          project.name,
          project.description || null,
          project.pathHint || null,
          project.createdAt,
          project.updatedAt,
          JSON.stringify(project.metadata ?? {}),
        ]
      ).run();
      return project;
    },

    async update(
      projectId: string,
      updater: (project: CoworkProject) => CoworkProject
    ): Promise<CoworkProject | null> {
      const existing = await prepare(db, "SELECT * FROM projects WHERE project_id = ?", [
        projectId,
      ]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToProject(existing));
      await prepare(
        db,
        `UPDATE projects
          SET name = ?, description = ?, path_hint = ?, updated_at = ?, metadata = ?
          WHERE project_id = ?`,
        [
          updated.name,
          updated.description || null,
          updated.pathHint || null,
          updated.updatedAt,
          JSON.stringify(updated.metadata ?? {}),
          updated.projectId,
        ]
      ).run();
      return updated;
    },

    async delete(projectId: string): Promise<boolean> {
      const result = await prepare(db, "DELETE FROM projects WHERE project_id = ?", [
        projectId,
      ]).run();
      return (result.changes ?? 0) > 0;
    },
  };
}

function rowToWorkflowTemplate(row: Record<string, unknown>): CoworkWorkflowTemplate {
  return {
    templateId: String(row.template_id),
    name: String(row.name),
    description: String(row.description),
    mode: row.mode as CoworkWorkflowTemplate["mode"],
    inputs: row.inputs ? (JSON.parse(String(row.inputs)) as CoworkWorkflowTemplate["inputs"]) : [],
    prompt: String(row.prompt),
    expectedArtifacts: row.expected_artifacts
      ? (JSON.parse(String(row.expected_artifacts)) as string[])
      : [],
    version: String(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    usageCount:
      row.usage_count !== null && row.usage_count !== undefined
        ? Number(row.usage_count)
        : undefined,
    lastUsedAt:
      row.last_used_at !== null && row.last_used_at !== undefined
        ? Number(row.last_used_at)
        : undefined,
    lastUsedInputs: row.last_used_inputs
      ? (JSON.parse(String(row.last_used_inputs)) as Record<string, string>)
      : undefined,
    lastUsedSessionId: row.last_used_session_id ? String(row.last_used_session_id) : undefined,
  };
}

async function createD1WorkflowTemplateStore(db: D1Database): Promise<WorkflowTemplateStoreLike> {
  return {
    async getAll(): Promise<CoworkWorkflowTemplate[]> {
      const result = await prepare(
        db,
        "SELECT * FROM workflow_templates ORDER BY updated_at DESC"
      ).all();
      return result.results.map(rowToWorkflowTemplate);
    },

    async getById(templateId: string): Promise<CoworkWorkflowTemplate | null> {
      const row = await prepare(db, "SELECT * FROM workflow_templates WHERE template_id = ?", [
        templateId,
      ]).first();
      return row ? rowToWorkflowTemplate(row) : null;
    },

    async create(template: CoworkWorkflowTemplate): Promise<CoworkWorkflowTemplate> {
      await prepare(
        db,
        `INSERT INTO workflow_templates
          (template_id, name, description, mode, inputs, prompt, expected_artifacts, version, created_at, updated_at, usage_count, last_used_at, last_used_inputs, last_used_session_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.templateId,
          template.name,
          template.description,
          template.mode,
          JSON.stringify(template.inputs ?? []),
          template.prompt,
          JSON.stringify(template.expectedArtifacts ?? []),
          template.version,
          template.createdAt,
          template.updatedAt,
          template.usageCount ?? 0,
          template.lastUsedAt ?? null,
          template.lastUsedInputs ? JSON.stringify(template.lastUsedInputs) : null,
          template.lastUsedSessionId ?? null,
        ]
      ).run();
      return template;
    },

    async update(
      templateId: string,
      updater: (template: CoworkWorkflowTemplate) => CoworkWorkflowTemplate
    ): Promise<CoworkWorkflowTemplate | null> {
      const existing = await prepare(db, "SELECT * FROM workflow_templates WHERE template_id = ?", [
        templateId,
      ]).first();
      if (!existing) {
        return null;
      }
      const updated = updater(rowToWorkflowTemplate(existing));
      await prepare(
        db,
        `UPDATE workflow_templates
          SET name = ?, description = ?, mode = ?, inputs = ?, prompt = ?, expected_artifacts = ?, version = ?, updated_at = ?, usage_count = ?, last_used_at = ?, last_used_inputs = ?, last_used_session_id = ?
          WHERE template_id = ?`,
        [
          updated.name,
          updated.description,
          updated.mode,
          JSON.stringify(updated.inputs ?? []),
          updated.prompt,
          JSON.stringify(updated.expectedArtifacts ?? []),
          updated.version,
          updated.updatedAt,
          updated.usageCount ?? 0,
          updated.lastUsedAt ?? null,
          updated.lastUsedInputs ? JSON.stringify(updated.lastUsedInputs) : null,
          updated.lastUsedSessionId ?? null,
          updated.templateId,
        ]
      ).run();
      return updated;
    },

    async delete(templateId: string): Promise<boolean> {
      const result = await prepare(db, "DELETE FROM workflow_templates WHERE template_id = ?", [
        templateId,
      ]).run();
      return (result.changes ?? 0) > 0;
    },
  };
}

function rowToAuditEntry(row: Record<string, unknown>): CoworkAuditEntry {
  return {
    entryId: String(row.entry_id),
    sessionId: String(row.session_id),
    taskId: row.task_id ? String(row.task_id) : undefined,
    timestamp: Number(row.timestamp),
    action: String(row.action) as CoworkAuditAction,
    toolName: row.tool_name ? String(row.tool_name) : undefined,
    input: row.input ? (JSON.parse(String(row.input)) as Record<string, unknown>) : undefined,
    output: row.output ? JSON.parse(String(row.output)) : undefined,
    decision: row.decision
      ? (String(row.decision) as "allow" | "allow_with_confirm" | "deny")
      : undefined,
    ruleId: row.rule_id ? String(row.rule_id) : undefined,
    riskTags: parseRiskTags(String(row.risk_tags ?? "[]")),
    reason: row.reason ? String(row.reason) : undefined,
    durationMs: row.duration_ms ? Number(row.duration_ms) : undefined,
    outcome: row.outcome ? (String(row.outcome) as "success" | "error" | "denied") : undefined,
  };
}

function buildD1AuditFilterConditions(filter: CoworkAuditFilter): {
  conditions: string[];
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.sessionId) {
    conditions.push("session_id = ?");
    params.push(filter.sessionId);
  }
  if (filter.taskId) {
    conditions.push("task_id = ?");
    params.push(filter.taskId);
  }
  if (filter.toolName) {
    conditions.push("tool_name = ?");
    params.push(filter.toolName);
  }
  if (filter.action) {
    conditions.push("action = ?");
    params.push(filter.action);
  }
  if (filter.since !== undefined) {
    conditions.push("timestamp >= ?");
    params.push(filter.since);
  }
  if (filter.until !== undefined) {
    conditions.push("timestamp <= ?");
    params.push(filter.until);
  }

  return { conditions, params };
}

async function createD1AuditLogStore(db: D1Database): Promise<AuditLogStoreLike> {
  return {
    async log(entry: CoworkAuditEntry): Promise<void> {
      await prepare(
        db,
        `INSERT INTO audit_logs
          (entry_id, session_id, task_id, timestamp, action, tool_name, input, output,
           decision, rule_id, risk_tags, reason, duration_ms, outcome)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.entryId,
          entry.sessionId,
          entry.taskId ?? null,
          entry.timestamp,
          entry.action,
          entry.toolName ?? null,
          entry.input ? JSON.stringify(entry.input) : null,
          entry.output ? JSON.stringify(entry.output) : null,
          entry.decision ?? null,
          entry.ruleId ?? null,
          JSON.stringify(entry.riskTags ?? []),
          entry.reason ?? null,
          entry.durationMs ?? null,
          entry.outcome ?? null,
        ]
      ).run();
    },

    async getBySession(sessionId: string, filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const limit = filter?.limit ?? 1000;
      const offset = filter?.offset ?? 0;
      const result = await prepare(
        db,
        `SELECT * FROM audit_logs WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [sessionId, limit, offset]
      ).all();
      return result.results.map(rowToAuditEntry);
    },

    async getByTask(taskId: string): Promise<CoworkAuditEntry[]> {
      const result = await prepare(
        db,
        `SELECT * FROM audit_logs WHERE task_id = ? ORDER BY timestamp DESC`,
        [taskId]
      ).all();
      return result.results.map(rowToAuditEntry);
    },

    async query(filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
      const { conditions, params } = buildD1AuditFilterConditions(filter);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filter.limit ?? 1000;
      const offset = filter.offset ?? 0;
      params.push(limit, offset);

      const result = await prepare(
        db,
        `SELECT * FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        params
      ).all();
      return result.results.map(rowToAuditEntry);
    },

    async getStats(sessionId: string): Promise<{
      total: number;
      byAction: Record<string, number>;
      byTool: Record<string, number>;
      byOutcome: Record<string, number>;
    }> {
      const result = await prepare(
        db,
        `SELECT action, tool_name, outcome, COUNT(*) as count
         FROM audit_logs WHERE session_id = ?
         GROUP BY action, tool_name, outcome`,
        [sessionId]
      ).all();

      const byAction: Record<string, number> = {};
      const byTool: Record<string, number> = {};
      const byOutcome: Record<string, number> = {};
      let total = 0;

      for (const row of result.results) {
        const count = Number(row.count);
        total += count;

        const action = String(row.action);
        byAction[action] = (byAction[action] ?? 0) + count;

        if (row.tool_name) {
          const toolName = String(row.tool_name);
          byTool[toolName] = (byTool[toolName] ?? 0) + count;
        }

        if (row.outcome) {
          const outcome = String(row.outcome);
          byOutcome[outcome] = (byOutcome[outcome] ?? 0) + count;
        }
      }

      return { total, byAction, byTool, byOutcome };
    },
  };
}

export async function createD1StorageLayer(db: D1Database): Promise<StorageLayer> {
  await ensureSchema(db);
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
    workflowTemplateStore,
  ] = await Promise.all([
    createD1SessionStore(db),
    createD1TaskStore(db),
    createD1ArtifactStore(db),
    createD1ChatMessageStore(db),
    createD1ApprovalStore(db),
    createD1AgentStateStore(db),
    createD1ConfigStore(db),
    createD1ProjectStore(db),
    createD1AuditLogStore(db),
    createD1WorkflowTemplateStore(db),
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
    workflowTemplateStore,
  };
}
