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
  AuditLogStoreLike,
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
  CoworkAuditAction,
  CoworkAuditEntry,
  CoworkAuditFilter,
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
    approvalStore,
    agentStateStore,
    configStore,
    projectStore,
    auditLogStore,
  ] = await Promise.all([
    createD1SessionStore(db),
    createD1TaskStore(db),
    createD1ArtifactStore(db),
    createD1ApprovalStore(db),
    createD1AgentStateStore(db),
    createD1ConfigStore(db),
    createD1ProjectStore(db),
    createD1AuditLogStore(db),
  ]);

  return {
    sessionStore,
    taskStore,
    artifactStore,
    approvalStore,
    agentStateStore,
    configStore,
    projectStore,
    auditLogStore,
  };
}
