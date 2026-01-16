import type { CoworkProject, CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type {
  ApprovalStoreLike,
  ConfigStoreLike,
  ProjectStoreLike,
  SessionStoreLike,
  StorageLayer,
  TaskStoreLike,
} from "./contracts";
import type { CoworkApproval, CoworkSettings } from "./types";

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
      CREATE TABLE IF NOT EXISTS approvals (
        approval_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
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
    grants: parseJsonArray<CoworkSession["grants"][number]>(row.grants),
    connectors: parseJsonArray<CoworkSession["connectors"][number]>(row.connectors),
    createdAt: Number(row.created_at),
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
    action: String(row.action),
    riskTags: parseRiskTags(String(row.risk_tags ?? "[]")),
    reason: row.reason ? String(row.reason) : undefined,
    status: row.status as CoworkApproval["status"],
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : undefined,
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
          (session_id, user_id, device_id, platform, mode, grants, connectors, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          session.userId,
          session.deviceId,
          session.platform,
          session.mode,
          JSON.stringify(session.grants ?? []),
          JSON.stringify(session.connectors ?? []),
          session.createdAt,
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
          SET user_id = ?, device_id = ?, platform = ?, mode = ?, grants = ?, connectors = ?, ended_at = ?
          WHERE session_id = ?`,
        [
          updated.userId,
          updated.deviceId,
          updated.platform,
          updated.mode,
          JSON.stringify(updated.grants ?? []),
          JSON.stringify(updated.connectors ?? []),
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
          (approval_id, session_id, action, risk_tags, reason, status, created_at, resolved_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          approval.approvalId,
          approval.sessionId,
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
          SET session_id = ?, action = ?, risk_tags = ?, reason = ?, status = ?, created_at = ?, resolved_at = ?
          WHERE approval_id = ?`,
        [
          updated.sessionId,
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
  const [sessionStore, taskStore, approvalStore, configStore, projectStore] = await Promise.all([
    createD1SessionStore(db),
    createD1TaskStore(db),
    createD1ApprovalStore(db),
    createD1ConfigStore(db),
    createD1ProjectStore(db),
  ]);

  return {
    sessionStore,
    taskStore,
    approvalStore,
    configStore,
    projectStore,
  };
}
