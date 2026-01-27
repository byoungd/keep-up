import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionRoutes } from "../routes/sessions";
import type { SessionStoreLike, TaskStoreLike } from "../storage/contracts";
import { COWORK_EVENTS, SessionEventHub } from "../streaming/eventHub";

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
    const next = updater(existing);
    this.sessions.set(sessionId, next);
    return next;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

class MockTaskStore implements TaskStoreLike {
  private readonly tasks = new Map<string, CoworkTask>();

  async getAll(): Promise<CoworkTask[]> {
    return Array.from(this.tasks.values());
  }

  async getById(taskId: string): Promise<CoworkTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async getBySession(sessionId: string): Promise<CoworkTask[]> {
    return Array.from(this.tasks.values()).filter((task) => task.sessionId === sessionId);
  }

  async create(task: CoworkTask): Promise<CoworkTask> {
    this.tasks.set(task.taskId, task);
    return task;
  }

  async update(
    taskId: string,
    updater: (task: CoworkTask) => CoworkTask
  ): Promise<CoworkTask | null> {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      return null;
    }
    const next = updater(existing);
    this.tasks.set(taskId, next);
    return next;
  }
}

function createSession(): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    grants: [
      {
        id: "grant-1",
        rootPath: "/tmp",
        allowWrite: true,
        allowDelete: true,
        allowCreate: true,
      },
    ],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("Session mode routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let taskStore: MockTaskStore;
  let eventHub: SessionEventHub;
  const taskRuntime = { updateSessionMode: vi.fn() };

  beforeEach(async () => {
    sessionStore = new MockSessionStore();
    taskStore = new MockTaskStore();
    eventHub = new SessionEventHub();
    await sessionStore.create(createSession());

    app = createSessionRoutes({
      sessionStore,
      taskStore,
      events: eventHub,
      taskRuntime,
    });
  });

  it("defaults to build mode when agentMode is unset", async () => {
    const res = await app.request("/sessions/session-1/mode");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mode: string };
    expect(data.mode).toBe("build");
  });

  it("accepts review mode updates and emits events", async () => {
    const res = await app.request("/sessions/session-1/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "review" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mode: string };
    expect(data.mode).toBe("review");
    expect(taskRuntime.updateSessionMode).toHaveBeenCalledWith("session-1", "review");

    const events = eventHub.listSince("session-1");
    expect(events.some((event) => event.type === COWORK_EVENTS.SESSION_MODE_CHANGED)).toBe(true);
  });

  it("toggles modes in order plan -> build -> review -> plan", async () => {
    await sessionStore.update("session-1", (session) => ({ ...session, agentMode: "plan" }));

    const res1 = await app.request("/sessions/session-1/mode/toggle", { method: "POST" });
    const data1 = (await res1.json()) as { mode: string };
    expect(data1.mode).toBe("build");

    const res2 = await app.request("/sessions/session-1/mode/toggle", { method: "POST" });
    const data2 = (await res2.json()) as { mode: string };
    expect(data2.mode).toBe("review");

    const res3 = await app.request("/sessions/session-1/mode/toggle", { method: "POST" });
    const data3 = (await res3.json()) as { mode: string };
    expect(data3.mode).toBe("plan");
  });
});
