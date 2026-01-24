import type { CoworkWorkspaceSession } from "@ku0/agent-runtime";
import { JsonStore } from "./jsonStore";

export class WorkspaceSessionStore {
  private readonly store: JsonStore<CoworkWorkspaceSession>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkWorkspaceSession>({
      filePath,
      idKey: "workspaceSessionId",
      fallback: [],
    });
  }

  getAll(): Promise<CoworkWorkspaceSession[]> {
    return this.store.getAll();
  }

  getById(workspaceSessionId: string): Promise<CoworkWorkspaceSession | null> {
    return this.store.getById(workspaceSessionId);
  }

  getBySession(sessionId: string): Promise<CoworkWorkspaceSession[]> {
    return this.store
      .getAll()
      .then((items) => items.filter((session) => session.sessionId === sessionId));
  }

  create(session: CoworkWorkspaceSession): Promise<CoworkWorkspaceSession> {
    return this.store.upsert(session);
  }

  update(
    workspaceSessionId: string,
    updater: (session: CoworkWorkspaceSession) => CoworkWorkspaceSession
  ): Promise<CoworkWorkspaceSession | null> {
    return this.store.update(workspaceSessionId, updater);
  }

  delete(workspaceSessionId: string): Promise<boolean> {
    return this.store.delete(workspaceSessionId);
  }
}

export function createWorkspaceSessionStore(filePath: string): WorkspaceSessionStore {
  return new WorkspaceSessionStore(filePath);
}
