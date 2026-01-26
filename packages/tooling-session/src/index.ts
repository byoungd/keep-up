import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_STATE_DIR = ".keep-up";
const DEFAULT_SESSIONS_FILE = "sessions.json";

export type SessionRole = "user" | "assistant" | "system";

export interface SessionMessage {
  role: SessionRole;
  content: string;
  timestamp: number;
}

export type ToolCallStatus = "started" | "completed" | "failed";

export type ToolCallContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; uri: string; mimeType?: string };

export interface ToolCallResult {
  success: boolean;
  content: ToolCallContent[];
  error?: {
    message: string;
    code?: string;
  };
  meta?: {
    durationMs?: number;
    toolName?: string;
    sandboxed?: boolean;
    outputSpool?: unknown;
  };
}

export interface ToolCallRecord {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
  errorCode?: string;
  result?: ToolCallResult;
}

export type ApprovalKind = "tool" | "plan" | "escalation";
export type ApprovalStatus = "requested" | "approved" | "rejected" | "timeout";

export interface ApprovalRecord {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  request: {
    toolName?: string;
    description?: string;
    arguments?: Record<string, unknown>;
    risk?: string;
    reason?: string;
    reasonCode?: string;
    riskTags?: string[];
    taskNodeId?: string;
    escalation?: unknown;
  };
  requestedAt: number;
  resolvedAt?: number;
  decisionReason?: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
  toolCalls: ToolCallRecord[];
  approvals: ApprovalRecord[];
}

export interface SessionStoreOptions {
  baseDir?: string;
  fileName?: string;
}

export function resolveToolingStateDir(): string {
  const override = process.env.KEEPUP_STATE_DIR;
  return override ? path.resolve(override) : path.join(os.homedir(), DEFAULT_STATE_DIR);
}

export async function ensureToolingStateDir(): Promise<string> {
  const dir = resolveToolingStateDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function resolveToolingPath(fileName: string): string {
  return path.join(resolveToolingStateDir(), fileName);
}

export class SessionStore {
  private readonly filePath: string;

  constructor(options: SessionStoreOptions = {}) {
    const fileName = options.fileName ?? DEFAULT_SESSIONS_FILE;
    this.filePath = options.baseDir ? path.join(options.baseDir, fileName) : fileName;
  }

  async list(limit = 10): Promise<SessionRecord[]> {
    const sessions = await this.loadAll();
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const sessions = await this.loadAll();
    return sessions.find((session) => session.id === id);
  }

  async save(session: SessionRecord): Promise<void> {
    const sessions = await this.loadAll();
    const existingIndex = sessions.findIndex((item) => item.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }
    await this.saveAll(sessions);
  }

  async delete(id: string): Promise<boolean> {
    const sessions = await this.loadAll();
    const next = sessions.filter((session) => session.id !== id);
    if (next.length === sessions.length) {
      return false;
    }
    await this.saveAll(next);
    return true;
  }

  private async loadAll(): Promise<SessionRecord[]> {
    try {
      const data = await readFile(await this.resolvePath(), "utf8");
      const parsed = JSON.parse(data) as SessionRecord[];
      return Array.isArray(parsed) ? parsed.map(normalizeSessionRecord) : [];
    } catch {
      return [];
    }
  }

  private async saveAll(sessions: SessionRecord[]): Promise<void> {
    await ensureToolingStateDir();
    await writeFile(await this.resolvePath(), JSON.stringify(sessions, null, 2), "utf8");
  }

  private async resolvePath(): Promise<string> {
    if (path.isAbsolute(this.filePath)) {
      return this.filePath;
    }
    const baseDir = await ensureToolingStateDir();
    return path.join(baseDir, this.filePath);
  }
}

function normalizeSessionRecord(record: SessionRecord): SessionRecord {
  return {
    ...record,
    messages: record.messages ?? [],
    toolCalls: record.toolCalls ?? [],
    approvals: record.approvals ?? [],
  };
}

export * from "./runtime";
