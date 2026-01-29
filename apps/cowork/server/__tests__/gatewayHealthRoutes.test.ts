import type { CoworkSession } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createGatewayHealthRoutes } from "../routes/gatewayHealth";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { GatewayControlRuntime } from "../runtime/gatewayControl";

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
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Gateway health routes", () => {
  let app: Hono;

  it("returns 503 when the gateway is unavailable", async () => {
    app = createGatewayHealthRoutes({});
    const res = await app.request("/gateway/health");
    expect(res.status).toBe(503);
    const data = (await res.json()) as { ok: boolean; error: string };
    expect(data.ok).toBe(false);
    expect(data.error).toBe("Gateway runtime unavailable");
  });

  it("returns gateway status with session summary", async () => {
    const gateway = {
      getStatus: () => ({ enabled: true, port: 4000 }),
    } as GatewayControlRuntime;

    const sessions: CoworkSession[] = [
      createSession({
        sessionId: "session-1",
        isolationLevel: "main",
        sandboxMode: "none",
        toolAllowlist: ["read"],
      }),
      createSession({
        sessionId: "session-2",
        isolationLevel: "sandbox",
        sandboxMode: "docker",
        toolDenylist: ["write"],
        endedAt: Date.now(),
      }),
    ];

    const taskRuntime = {
      listSessions: async () => sessions,
    } as CoworkTaskRuntime;

    app = createGatewayHealthRoutes({ gateway, taskRuntime });

    const res = await app.request("/gateway/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      gateway: { enabled: boolean; port: number };
      sessions: {
        total: number;
        active: number;
        ended: number;
        isolation: { main: number; sandbox: number; restricted: number };
        sandboxMode: { none: number; "workspace-write": number; docker: number };
        toolAllowlistConfigured: number;
        toolDenylistConfigured: number;
      };
    };
    expect(data.ok).toBe(true);
    expect(data.gateway.port).toBe(4000);
    expect(data.sessions.total).toBe(2);
    expect(data.sessions.active).toBe(1);
    expect(data.sessions.ended).toBe(1);
    expect(data.sessions.isolation).toEqual({ main: 1, sandbox: 1, restricted: 0 });
    expect(data.sessions.sandboxMode).toEqual({ none: 1, "workspace-write": 0, docker: 1 });
    expect(data.sessions.toolAllowlistConfigured).toBe(1);
    expect(data.sessions.toolDenylistConfigured).toBe(1);
  });

  it("omits sessions summary when task runtime is missing", async () => {
    const gateway = {
      getStatus: () => ({ enabled: true, port: 4000 }),
    } as GatewayControlRuntime;

    app = createGatewayHealthRoutes({ gateway });
    const res = await app.request("/gateway/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions?: unknown };
    expect(data.sessions).toBeUndefined();
  });
});
