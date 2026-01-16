import type { CoworkSession } from "@ku0/agent-runtime";
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

  getAll(): Promise<CoworkSession[]> {
    return this.store.getAll();
  }

  getById(sessionId: string): Promise<CoworkSession | null> {
    return this.store.getById(sessionId);
  }

  create(session: CoworkSession): Promise<CoworkSession> {
    return this.store.upsert(session);
  }

  update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    return this.store.update(sessionId, updater);
  }

  delete(sessionId: string): Promise<boolean> {
    return this.store.delete(sessionId);
  }
}

export function createSessionStore(filePath: string): SessionStore {
  return new SessionStore(filePath);
}
