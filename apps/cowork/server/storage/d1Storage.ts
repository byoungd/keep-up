import type {
  CoworkConnectorGrant,
  CoworkFolderGrant,
  CoworkProject,
  CoworkSession,
  CoworkTask,
} from "@ku0/agent-runtime";
import type {
  AgentStateCheckpointStoreLike,
  ApprovalStoreLike,
  ArtifactStoreLike,
  ChatMessageStoreLike,
  ConfigStoreLike,
  ProjectStoreLike,
  SessionStoreLike,
  StorageLayer,
  TaskStoreLike,
} from "./contracts";
import type {
  AgentStateCheckpointRecord,
  CoworkApproval,
  CoworkArtifactRecord,
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
  "openAiKey",
  "anthropicKey",
  "defaultModel",
  "theme",
]);

function parseSettingValue(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return raw;
  }
}

function applySetting(settings: CoworkSettings, key: string, value: string | undefined): void {
  if (!ALLOWED_SETTINGS.has(key as keyof CoworkSettings) || value === undefined) {
    return;
  }

  if (key === "theme") {
    if (value === "light" || value === "dark") {
      settings.theme = value;
    }
    return;
  }

  const settingKey = key as keyof CoworkSettings;
  if (settingKey !== "theme") {
    settings[settingKey] = value;
  }
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
          (artifact_id, session_id, task_id, title, type, artifact, source_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(artifact_id) DO UPDATE SET
            session_id = excluded.session_id,
            task_id = excluded.task_id,
            title = excluded.title,
            type = excluded.type,
            artifact = excluded.artifact,
            source_path = excluded.source_path,
            updated_at = excluded.updated_at`,
        [
          artifact.artifactId,
          artifact.sessionId,
          artifact.taskId ?? null,
          artifact.title,
          artifact.type,
          JSON.stringify(artifact.artifact),
          artifact.sourcePath ?? null,
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
  ] = await Promise.all([
    createD1SessionStore(db),
    createD1TaskStore(db),
    createD1ArtifactStore(db),
    createD1ChatMessageStore(db),
    createD1ApprovalStore(db),
    createD1AgentStateStore(db),
    createD1ConfigStore(db),
    createD1ProjectStore(db),
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
  };
}
