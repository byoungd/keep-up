import { createEventBus } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import { GatewayControlServer } from "../controlPlane/server";
import type {
  GatewayControlSessionCreateInput,
  GatewayControlSessionManager,
  GatewayControlSessionSummary,
  GatewayWebSocketLike,
} from "../controlPlane/types";

class MockSocket implements GatewayWebSocketLike {
  readonly sent: string[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }
}

class MockSessionManager implements GatewayControlSessionManager {
  private counter = 0;
  private readonly sessions = new Map<string, GatewayControlSessionSummary>();

  async list(): Promise<GatewayControlSessionSummary[]> {
    return Array.from(this.sessions.values());
  }

  async get(sessionId: string): Promise<GatewayControlSessionSummary | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async create(input: GatewayControlSessionCreateInput): Promise<GatewayControlSessionSummary> {
    const sessionId = input.sessionId ?? `session-${this.counter++}`;
    const now = Date.now();
    const session: GatewayControlSessionSummary = {
      sessionId,
      userId: input.userId,
      deviceId: input.deviceId,
      title: input.title,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      isolationLevel: input.isolationLevel,
      sandboxMode: input.sandboxMode,
      toolAllowlist: input.toolAllowlist,
      toolDenylist: input.toolDenylist,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      metadata: input.metadata,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async update(
    sessionId: string,
    updates: {
      title?: string | null;
      projectId?: string | null;
      workspaceId?: string | null;
      isolationLevel?: "main" | "sandbox" | "restricted";
      sandboxMode?: "none" | "workspace-write" | "docker" | null;
      toolAllowlist?: string[] | null;
      toolDenylist?: string[] | null;
      endedAt?: number | null;
      expiresAt?: number | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<GatewayControlSessionSummary | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return null;
    }
    const updated: GatewayControlSessionSummary = {
      ...existing,
      title: updates.title ?? existing.title,
      projectId: updates.projectId ?? existing.projectId,
      workspaceId: updates.workspaceId ?? existing.workspaceId,
      isolationLevel: updates.isolationLevel ?? existing.isolationLevel,
      sandboxMode: updates.sandboxMode ?? existing.sandboxMode,
      toolAllowlist: updates.toolAllowlist ?? existing.toolAllowlist,
      toolDenylist: updates.toolDenylist ?? existing.toolDenylist,
      endedAt: updates.endedAt ?? existing.endedAt,
      expiresAt: updates.expiresAt ?? existing.expiresAt,
      metadata: updates.metadata ?? existing.metadata,
      updatedAt: Date.now(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  async end(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("GatewayControlServer", () => {
  it("subscribes clients and forwards events", () => {
    const eventBus = createEventBus();
    const server = new GatewayControlServer({ eventBus });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-1" });

    handle.onMessage(
      JSON.stringify({
        type: "subscribe",
        patterns: ["tool:called"],
      })
    );

    eventBus.emitRaw("tool:called", { toolName: "bash", args: {} });

    const messages = socket.sent.map((payload) => JSON.parse(payload) as { type: string });
    expect(messages.some((msg) => msg.type === "welcome")).toBe(true);
    expect(messages.some((msg) => msg.type === "subscribed")).toBe(true);
    expect(messages.some((msg) => msg.type === "event")).toBe(true);
  });

  it("allows publish when enabled", () => {
    const eventBus = createEventBus();
    const server = new GatewayControlServer({ eventBus, allowPublish: true });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-2" });

    const events: string[] = [];
    eventBus.subscribe("custom:event", (event) => {
      events.push(event.type);
    });

    handle.onMessage(
      JSON.stringify({
        type: "publish",
        event: {
          type: "custom:event",
          payload: { ok: true },
        },
      })
    );

    expect(events).toEqual(["custom:event"]);
  });

  it("requires auth when token mode is enabled", () => {
    const eventBus = createEventBus();
    const server = new GatewayControlServer({
      eventBus,
      auth: { mode: "token", token: "secret" },
    });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-3" });

    handle.onMessage(
      JSON.stringify({
        type: "subscribe",
        patterns: ["tool:called"],
      })
    );

    handle.onMessage(
      JSON.stringify({
        type: "auth",
        token: "secret",
      })
    );

    handle.onMessage(
      JSON.stringify({
        type: "subscribe",
        patterns: ["tool:called"],
      })
    );

    const messages = socket.sent.map((payload) => JSON.parse(payload) as { type: string });
    expect(messages.some((msg) => msg.type === "error")).toBe(true);
    expect(messages.some((msg) => msg.type === "auth_ok")).toBe(true);
    expect(messages.some((msg) => msg.type === "subscribed")).toBe(true);
  });

  it("handles session management requests", async () => {
    const eventBus = createEventBus();
    const sessionManager = new MockSessionManager();
    const server = new GatewayControlServer({ eventBus, sessionManager });
    const socket = new MockSocket();
    const handle = server.handleConnection(socket, { clientId: "client-4" });

    handle.onMessage(
      JSON.stringify({
        type: "session.create",
        requestId: "req-create",
        session: { title: "Gateway Session", isolationLevel: "sandbox" },
      })
    );
    await tick();

    const created = socket.sent
      .map(
        (payload) => JSON.parse(payload) as { type: string; session?: GatewayControlSessionSummary }
      )
      .find((msg) => msg.type === "session.created")?.session;

    expect(created?.title).toBe("Gateway Session");
    expect(created?.isolationLevel).toBe("sandbox");

    handle.onMessage(
      JSON.stringify({
        type: "session.list",
        requestId: "req-list",
      })
    );
    await tick();

    const list = socket.sent
      .map(
        (payload) =>
          JSON.parse(payload) as { type: string; sessions?: GatewayControlSessionSummary[] }
      )
      .find((msg) => msg.type === "session.list")?.sessions;

    expect(list?.some((entry) => entry.sessionId === created?.sessionId)).toBe(true);

    if (!created?.sessionId) {
      throw new Error("Missing sessionId for gateway session test.");
    }

    handle.onMessage(
      JSON.stringify({
        type: "session.update",
        requestId: "req-update",
        sessionId: created.sessionId,
        updates: { title: "Renamed Session" },
      })
    );
    await tick();

    const updated = socket.sent
      .map(
        (payload) => JSON.parse(payload) as { type: string; session?: GatewayControlSessionSummary }
      )
      .find((msg) => msg.type === "session.updated")?.session;

    expect(updated?.title).toBe("Renamed Session");

    handle.onMessage(
      JSON.stringify({
        type: "session.end",
        requestId: "req-end",
        sessionId: created.sessionId,
      })
    );
    await tick();

    const ended = socket.sent
      .map((payload) => JSON.parse(payload) as { type: string; ok?: boolean })
      .find((msg) => msg.type === "session.ended");

    expect(ended?.ok).toBe(true);
  });
});
