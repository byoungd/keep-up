import { Hono } from "hono";
import type { GatewayControlRuntime } from "../runtime/gatewayControl";

interface GatewayHealthDeps {
  gateway?: GatewayControlRuntime;
}

export function createGatewayHealthRoutes(deps: GatewayHealthDeps) {
  const app = new Hono();

  app.get("/gateway/health", (c) => {
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

    return c.json({
      ok: true,
      gateway: deps.gateway.getStatus(),
      timestamp: Date.now(),
    });
  });

  return app;
}
