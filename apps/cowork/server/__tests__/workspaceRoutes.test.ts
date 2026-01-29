import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceRoutes } from "../routes/workspaces";
import type { SessionStoreLike } from "../storage/contracts";

class MockSessionStore implements SessionStoreLike {
  constructor(private readonly sessions: CoworkSession[]) {}

  async getAll(): Promise<CoworkSession[]> {
    return this.sessions;
  }

  async getById(_sessionId: string): Promise<CoworkSession | null> {
    return null;
  }

  async create(session: CoworkSession): Promise<CoworkSession> {
    this.sessions.push(session);
    return session;
  }

  async update(
    _sessionId: string,
    _updater: (session: CoworkSession) => CoworkSession
  ): Promise<CoworkSession | null> {
    return null;
  }

  async delete(_sessionId: string): Promise<boolean> {
    return false;
  }
}

function createSession(overrides: Partial<CoworkSession>): CoworkSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    deviceId: "device-1",
    platform: "macos",
    mode: "cowork",
    isolationLevel: "main",
    grants: [],
    connectors: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("Workspace routes", () => {
  let app: Hono;

  beforeEach(() => {
    const sessions: CoworkSession[] = [
      createSession({
        sessionId: "session-a",
        workspaceId: "ws-1",
        grants: [{ id: "grant-a", rootPath: "/Users/me/projectA", allowWrite: true }],
        createdAt: 10,
        updatedAt: 20,
      }),
      createSession({
        sessionId: "session-b",
        workspaceId: "ws-1",
        grants: [{ id: "grant-b", rootPath: "/Users/me/projectA", allowWrite: true }],
        createdAt: 5,
        updatedAt: 30,
      }),
      createSession({
        sessionId: "session-c",
        workspaceId: undefined,
        grants: [{ id: "grant-c", rootPath: "/Users/me/Other", allowWrite: true }],
        createdAt: 15,
        updatedAt: 16,
      }),
    ];

    const sessionStore = new MockSessionStore(sessions);
    app = createWorkspaceRoutes({ sessionStore });
  });

  it("builds workspace summaries from sessions", async () => {
    const res = await app.request("/workspaces");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      workspaces: Array<{
        workspaceId: string;
        name: string;
        createdAt: number;
        lastOpenedAt: number;
      }>;
    };
    expect(data.ok).toBe(true);
    expect(data.workspaces).toHaveLength(2);
    expect(data.workspaces[0]?.workspaceId).toBe("ws-1");
    expect(data.workspaces[0]?.name).toBe("projectA");
    expect(data.workspaces[0]?.createdAt).toBe(5);
    expect(data.workspaces[0]?.lastOpenedAt).toBe(30);
    expect(data.workspaces[1]?.name).toBe("Other");
  });
});
