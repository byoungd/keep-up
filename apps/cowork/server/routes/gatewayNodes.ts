import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";
import type { GatewayControlRuntime } from "../runtime/gatewayControl";

interface GatewayNodeDeps {
  gateway?: GatewayControlRuntime;
}

export function createGatewayNodeRoutes(deps: GatewayNodeDeps) {
  const app = new Hono();

  app.get("/gateway/nodes", (c) => {
    const nodes = deps.gateway?.nodes;
    if (!nodes) {
      return c.json(
        {
          ok: false,
          error: "Gateway node runtime unavailable",
          timestamp: Date.now(),
        },
        503
      );
    }

    return c.json({
      ok: true,
      nodes: nodes.list(),
      status: nodes.getStatus(),
      timestamp: Date.now(),
    });
  });

  app.get("/gateway/nodes/:id", (c) => {
    const nodes = deps.gateway?.nodes;
    if (!nodes) {
      return c.json(
        {
          ok: false,
          error: "Gateway node runtime unavailable",
          timestamp: Date.now(),
        },
        503
      );
    }

    const nodeId = c.req.param("id");
    const node = nodes.describe(nodeId);
    if (!node) {
      return jsonError(c, 404, `Node ${nodeId} not found`);
    }

    return c.json({
      ok: true,
      node,
      timestamp: Date.now(),
    });
  });

  app.post("/gateway/nodes/:id/invoke", async (c) => {
    const nodes = deps.gateway?.nodes;
    if (!nodes) {
      return c.json(
        {
          ok: false,
          error: "Gateway node runtime unavailable",
          timestamp: Date.now(),
        },
        503
      );
    }

    const nodeId = c.req.param("id");
    const body = (await readJsonBody(c)) as { command?: unknown; args?: unknown } | null;
    const command = typeof body?.command === "string" ? body.command : undefined;
    if (!command) {
      return jsonError(c, 400, "command is required");
    }

    const args =
      body?.args && typeof body.args === "object"
        ? (body.args as Record<string, unknown>)
        : undefined;
    const result = await nodes.invoke(nodeId, command, args);

    return c.json({
      ok: true,
      nodeId,
      command,
      result,
      timestamp: Date.now(),
    });
  });

  return app;
}
