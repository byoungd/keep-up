import type {
  CoworkSession,
  CoworkWorkspaceEvent,
  CoworkWorkspaceSession,
} from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { COWORK_EVENTS } from "../events";
import { createWorkspaceSessionRoutes } from "../routes/workspaceSessions";
import type {
  CoworkWorkspaceEventInput,
  SessionStoreLike,
  WorkspaceEventStoreLike,
  WorkspaceSessionStoreLike,
} from "../storage/contracts";
import { SessionEventHub } from "../streaming/eventHub";

class MockSessionStore implements SessionStoreLike {
  private readonly sessions = new Map<string, CoworkSession>();

  async getAll(): Promise<CoworkSession[]> {
    return Array.from(this.sessions.values());
  }

  async getById(sessionId: string): Promise<CoworkSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async create(session: CoworkSession): Promise<CoworkSession> {
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async update(
    sessionId: string,
    updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

class MockWorkspaceSessionStore implements WorkspaceSessionStoreLike {
  private readonly sessions = new Map<string, CoworkWorkspaceSession>();

  async getAll(): Promise<CoworkWorkspaceSession[]> {
    return Array.from(this.sessions.values());
  }

  async getById(workspaceSessionId: string): Promise<CoworkWorkspaceSession | null> {
    return this.sessions.get(workspaceSessionId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkWorkspaceSession[]> {
    return Array.from(this.sessions.values()).filter((session) => session.sessionId === sessionId);
  }

  async create(session: CoworkWorkspaceSession): Promise<CoworkWorkspaceSession> {
    this.sessions.set(session.workspaceSessionId, session);
    return session;
  }

  async update(
    workspaceSessionId: string,
    updater: (session: CoworkWorkspaceSession) => CoworkWorkspaceSession
  ): Promise<CoworkWorkspaceSession | null> {
    const existing = this.sessions.get(workspaceSessionId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.sessions.set(workspaceSessionId, updated);
    return updated;
  }

  async delete(workspaceSessionId: string): Promise<boolean> {
    return this.sessions.delete(workspaceSessionId);
  }
}

class MockWorkspaceEventStore implements WorkspaceEventStoreLike {
  public readonly events: CoworkWorkspaceEvent[] = [];

  async getByWorkspaceSession(
    workspaceSessionId: string,
    options: { afterSequence?: number; limit?: number } = {}
  ): Promise<CoworkWorkspaceEvent[]> {
    let filtered = this.events.filter((event) => event.workspaceSessionId === workspaceSessionId);
    if (options.afterSequence !== undefined) {
      filtered = filtered.filter((event) => event.sequence > options.afterSequence);
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
    let maxSequence = 0;
    for (const existing of this.events) {
      if (existing.workspaceSessionId === workspaceSessionId) {
        maxSequence = Math.max(maxSequence, existing.sequence);
      }
    }

    const now = Date.now();
    const stored = events.map((event, index) => ({
      eventId: event.eventId ?? crypto.randomUUID(),
      workspaceSessionId: event.workspaceSessionId,
      sessionId: event.sessionId,
      sequence: maxSequence + index + 1,
      timestamp: event.timestamp ?? now,
      kind: event.kind,
      payload: event.payload,
      source: event.source,
    }));
    this.events.push(...stored);
    return stored;
  }
}

function createCoworkSession(): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: "grant-1",
        rootPath: "/workspace",
        allowCreate: true,
        allowWrite: true,
        allowDelete: true,
      },
    ],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("Workspace session routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let workspaceSessionStore: MockWorkspaceSessionStore;
  let workspaceEventStore: MockWorkspaceEventStore;
  let eventHub: SessionEventHub;

  beforeEach(async () => {
    sessionStore = new MockSessionStore();
    workspaceSessionStore = new MockWorkspaceSessionStore();
    workspaceEventStore = new MockWorkspaceEventStore();
    eventHub = new SessionEventHub();
    await sessionStore.create(createCoworkSession());

    app = createWorkspaceSessionRoutes({
      sessions: sessionStore,
      workspaceSessions: workspaceSessionStore,
      workspaceEvents: workspaceEventStore,
      events: eventHub,
    });
  });

  it("creates and lists workspace sessions", async () => {
    const res = await app.request("/sessions/session-1/workspace-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "terminal" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { workspaceSession?: CoworkWorkspaceSession };
    expect(data.workspaceSession?.kind).toBe("terminal");

    const listRes = await app.request("/sessions/session-1/workspace-sessions");
    const listData = (await listRes.json()) as { workspaceSessions: CoworkWorkspaceSession[] };
    expect(listData.workspaceSessions).toHaveLength(1);

    const events = eventHub.listSince("session-1");
    expect(events.some((event) => event.type === COWORK_EVENTS.WORKSPACE_SESSION_CREATED)).toBe(
      true
    );
  });

  it("appends events and supports afterSequence filtering", async () => {
    const createRes = await app.request("/sessions/session-1/workspace-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "browser" }),
    });
    const createData = (await createRes.json()) as { workspaceSession: CoworkWorkspaceSession };
    const workspaceSessionId = createData.workspaceSession.workspaceSessionId;

    const eventsRes = await app.request(`/workspace-sessions/${workspaceSessionId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: [
          { kind: "log_line", payload: { message: "hello" } },
          { kind: "log_line", payload: { message: "world" } },
        ],
      }),
    });
    expect(eventsRes.status).toBe(201);
    const eventsData = (await eventsRes.json()) as { workspaceEvents: CoworkWorkspaceEvent[] };
    expect(eventsData.workspaceEvents[0]?.sequence).toBe(1);
    expect(eventsData.workspaceEvents[1]?.sequence).toBe(2);

    const listRes = await app.request(
      `/workspace-sessions/${workspaceSessionId}/events?afterSequence=1`
    );
    const listData = (await listRes.json()) as { workspaceEvents: CoworkWorkspaceEvent[] };
    expect(listData.workspaceEvents).toHaveLength(1);
    expect(listData.workspaceEvents[0]?.sequence).toBe(2);
  });

  it("records control handoff events on controller change", async () => {
    const createRes = await app.request("/sessions/session-1/workspace-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "terminal" }),
    });
    const createData = (await createRes.json()) as { workspaceSession: CoworkWorkspaceSession };
    const workspaceSessionId = createData.workspaceSession.workspaceSessionId;

    const updateRes = await app.request(`/workspace-sessions/${workspaceSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ controller: "user" }),
    });
    expect(updateRes.status).toBe(200);

    const storedEvents = await workspaceEventStore.getByWorkspaceSession(workspaceSessionId);
    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0]?.kind).toBe("log_line");
    expect(storedEvents[0]?.payload?.message).toBe("control_handoff");
  });
});
