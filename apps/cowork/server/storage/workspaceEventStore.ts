import type { CoworkWorkspaceEvent } from "@ku0/agent-runtime";
import type { CoworkWorkspaceEventInput } from "./contracts";
import { JsonStore } from "./jsonStore";

export class WorkspaceEventStore {
  private readonly store: JsonStore<CoworkWorkspaceEvent>;

  constructor(filePath: string) {
    this.store = new JsonStore<CoworkWorkspaceEvent>({
      filePath,
      idKey: "eventId",
      fallback: [],
    });
  }

  async getAll(): Promise<CoworkWorkspaceEvent[]> {
    return this.store.getAll();
  }

  async getByWorkspaceSession(
    workspaceSessionId: string,
    options: { afterSequence?: number; limit?: number } = {}
  ): Promise<CoworkWorkspaceEvent[]> {
    const events = await this.store.getAll();
    let filtered = events.filter((event) => event.workspaceSessionId === workspaceSessionId);
    const afterSequence = options.afterSequence;
    if (afterSequence !== undefined) {
      filtered = filtered.filter((event) => event.sequence > afterSequence);
    }
    filtered.sort((a, b) => a.sequence - b.sequence);
    if (options.limit !== undefined) {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }

  async append(event: CoworkWorkspaceEventInput): Promise<CoworkWorkspaceEvent> {
    const [stored] = await this.appendMany([event]);
    return stored;
  }

  async appendMany(events: CoworkWorkspaceEventInput[]): Promise<CoworkWorkspaceEvent[]> {
    if (events.length === 0) {
      return [];
    }
    const { workspaceSessionId } = events[0];
    for (const event of events) {
      if (event.workspaceSessionId !== workspaceSessionId) {
        throw new Error("Workspace event batch must share the same workspaceSessionId.");
      }
    }
    const existing = await this.getByWorkspaceSession(workspaceSessionId);
    const maxSequence = existing.reduce((max, event) => Math.max(max, event.sequence), 0);
    const now = Date.now();
    const stored: CoworkWorkspaceEvent[] = [];

    for (let i = 0; i < events.length; i += 1) {
      const input = events[i];
      const sequence = maxSequence + i + 1;
      const next: CoworkWorkspaceEvent = {
        eventId: input.eventId ?? crypto.randomUUID(),
        workspaceSessionId: input.workspaceSessionId,
        sessionId: input.sessionId,
        sequence,
        timestamp: input.timestamp ?? now,
        kind: input.kind,
        payload: input.payload,
        source: input.source,
      };
      await this.store.upsert(next);
      stored.push(next);
    }

    return stored;
  }
}

export function createWorkspaceEventStore(filePath: string): WorkspaceEventStore {
  return new WorkspaceEventStore(filePath);
}
