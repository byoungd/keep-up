import type { CoworkSession } from "@ku0/agent-runtime";
import { Hono } from "hono";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { GatewayControlRuntime } from "../runtime/gatewayControl";
import { resolveSessionIsolation, resolveSessionSandboxMode } from "../runtime/utils";

interface GatewayHealthDeps {
  gateway?: GatewayControlRuntime;
  taskRuntime?: CoworkTaskRuntime;
}

export function createGatewayHealthRoutes(deps: GatewayHealthDeps) {
  const app = new Hono();

  app.get("/gateway/health", async (c) => {
    if (!deps.gateway) {
      return c.json(
        {
          ok: false,
          error: "Gateway runtime unavailable",
          timestamp: Date.now(),
        },
        503
      );
    }

    const sessionSummary = deps.taskRuntime
      ? summarizeSessions(await deps.taskRuntime.listSessions())
      : undefined;

    return c.json({
      ok: true,
      gateway: deps.gateway.getStatus(),
      sessions: sessionSummary,
      timestamp: Date.now(),
    });
  });

  return app;
}

function summarizeSessions(sessions: CoworkSession[]) {
  const summary = {
    total: sessions.length,
    active: 0,
    ended: 0,
    isolation: { main: 0, sandbox: 0, restricted: 0 },
    sandboxMode: { none: 0, "workspace-write": 0, docker: 0 },
    toolAllowlistConfigured: 0,
    toolDenylistConfigured: 0,
  };

  for (const session of sessions) {
    if (session.endedAt) {
      summary.ended += 1;
    } else {
      summary.active += 1;
    }
    const isolation = resolveSessionIsolation(session);
    summary.isolation[isolation] += 1;
    const sandboxMode = resolveSessionSandboxMode({
      isolationLevel: isolation,
      sandboxMode: session.sandboxMode,
    });
    summary.sandboxMode[sandboxMode] += 1;
    if (session.toolAllowlist && session.toolAllowlist.length > 0) {
      summary.toolAllowlistConfigured += 1;
    }
    if (session.toolDenylist && session.toolDenylist.length > 0) {
      summary.toolDenylistConfigured += 1;
    }
  }

  return summary;
}
