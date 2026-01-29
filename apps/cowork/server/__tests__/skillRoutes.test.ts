import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSkillRoutes } from "../routes/skills";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { SessionStoreLike } from "../storage/contracts";

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

function createSession(): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    isolationLevel: "main",
    grants: [],
    connectors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("Skill routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let taskRuntime: CoworkTaskRuntime;

  beforeEach(async () => {
    sessionStore = new MockSessionStore();
    await sessionStore.create(createSession());
    taskRuntime = {
      listSkills: vi.fn(async () => ({ skills: [{ id: "alpha" }], disabled: [] })),
    } as unknown as CoworkTaskRuntime;

    app = createSkillRoutes({
      taskRuntime,
      sessions: sessionStore,
    });
  });

  it("returns 503 when runtime is unavailable", async () => {
    const offlineApp = createSkillRoutes({ sessions: sessionStore });
    const res = await offlineApp.request("/sessions/session-1/skills");
    expect(res.status).toBe(503);
  });

  it("returns 404 when session is missing", async () => {
    const res = await app.request("/sessions/missing/skills");
    expect(res.status).toBe(404);
  });

  it("returns skills for a session", async () => {
    const res = await app.request("/sessions/session-1/skills");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; skills: Array<{ id: string }> };
    expect(data.ok).toBe(true);
    expect(data.skills[0]?.id).toBe("alpha");
  });
});
