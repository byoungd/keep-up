import type { CoworkSession } from "@ku0/agent-runtime";
import { resolveSessionIsolationConfig } from "../runtime/utils";
import { JsonStore } from "./jsonStore";

export class SessionStore {
  private readonly store: JsonStore<CoworkSession>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkSession>({
      filePath,
      idKey: "sessionId",
      fallback: [],
    });
  }

  private normalizeSession(session: CoworkSession): CoworkSession {
    const resolved = resolveSessionIsolationConfig(session);
    return {
      ...session,
      isolationLevel: resolved.isolationLevel,
      sandboxMode: resolved.sandboxMode,
      toolAllowlist: resolved.toolAllowlist,
      toolDenylist: resolved.toolDenylist,
    };
  }

  async getAll(): Promise<CoworkSession[]> {
    const sessions = await this.store.getAll();
    return sessions.map((session) => this.normalizeSession(session));
  }

  async getById(sessionId: string): Promise<CoworkSession | null> {
    const session = await this.store.getById(sessionId);
    return session ? this.normalizeSession(session) : null;
  }

  create(session: CoworkSession): Promise<CoworkSession> {
    return this.store.upsert(this.normalizeSession(session));
  }

  update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    return this.store.update(sessionId, (session) =>
      this.normalizeSession(updater(this.normalizeSession(session)))
    );
  }

  delete(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }
}

export function createSessionStore(filePath: string): SessionStore {
  return new SessionStore(filePath);
}
