import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditLogRoutes } from "../routes/auditLogs";
import type { AuditLogStoreLike, SessionStoreLike } from "../storage/contracts";
import type { CoworkAuditEntry, CoworkAuditFilter } from "../storage/types";

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

class MockAuditLogStore implements AuditLogStoreLike {
  public readonly entries: CoworkAuditEntry[] = [];
  public readonly getBySession = vi.fn(
    async (_sessionId: string, _filter?: CoworkAuditFilter) => []
  );
  public readonly getByTask = vi.fn(async (_taskId: string) => []);
  public readonly query = vi.fn(async (_filter: CoworkAuditFilter) => []);
  public readonly getStats = vi.fn(async (_sessionId: string) => ({
    total: 0,
    byAction: {},
    byTool: {},
    byOutcome: {},
  }));

  async log(entry: CoworkAuditEntry): Promise<void> {
    this.entries.push(entry);
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

describe("Audit log routes", () => {
  let app: Hono;
  let sessionStore: MockSessionStore;
  let auditStore: MockAuditLogStore;

  beforeEach(async () => {
    sessionStore = new MockSessionStore();
    auditStore = new MockAuditLogStore();
    await sessionStore.create(createSession());

    app = createAuditLogRoutes({
      auditLogStore: auditStore,
      sessions: sessionStore,
    });
  });

  it("returns session audit logs", async () => {
    const res = await app.request("/sessions/session-1/audit-logs?limit=25&offset=5");
    expect(res.status).toBe(200);
    expect(auditStore.getBySession).toHaveBeenCalledWith("session-1", {
      limit: 25,
      offset: 5,
    });
  });

  it("returns 404 for missing sessions", async () => {
    const res = await app.request("/sessions/missing/audit-logs");
    expect(res.status).toBe(404);
  });

  it("returns task audit logs", async () => {
    const res = await app.request("/tasks/task-1/audit-logs");
    expect(res.status).toBe(200);
    expect(auditStore.getByTask).toHaveBeenCalledWith("task-1");
  });

  it("returns session audit stats", async () => {
    const res = await app.request("/sessions/session-1/audit-logs/stats");
    expect(res.status).toBe(200);
    expect(auditStore.getStats).toHaveBeenCalledWith("session-1");
  });

  it("returns 404 for missing stats sessions", async () => {
    const res = await app.request("/sessions/missing/audit-logs/stats");
    expect(res.status).toBe(404);
  });

  it("rejects invalid audit log queries", async () => {
    const res = await app.request("/audit-logs/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 2000 }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts audit log queries", async () => {
    const res = await app.request("/audit-logs/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", limit: 10 }),
    });
    expect(res.status).toBe(200);
    expect(auditStore.query).toHaveBeenCalledWith({ sessionId: "session-1", limit: 10 });
  });
});
