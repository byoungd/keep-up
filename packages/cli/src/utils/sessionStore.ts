import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureCliStateDir } from "./statePaths";

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}

export interface SessionStoreOptions {
  baseDir?: string;
  fileName?: string;
}

export class SessionStore {
  private readonly filePath: string;

  constructor(options: SessionStoreOptions = {}) {
    const fileName = options.fileName ?? "cli-sessions.json";
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
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async saveAll(sessions: SessionRecord[]): Promise<void> {
    await ensureCliStateDir();
    await writeFile(await this.resolvePath(), JSON.stringify(sessions, null, 2), "utf8");
  }

  private async resolvePath(): Promise<string> {
    if (path.isAbsolute(this.filePath)) {
      return this.filePath;
    }
    const baseDir = await ensureCliStateDir();
    return path.join(baseDir, this.filePath);
  }
}
