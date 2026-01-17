import { Hono } from "hono";
import { jsonError } from "../http";
import type { SessionStoreLike } from "../storage/contracts";

interface CostRoutesDeps {
  sessionStore: SessionStoreLike;
}

export function createCostRoutes(deps: CostRoutesDeps) {
  const app = new Hono();

  app.get("/sessions/:id/cost", async (c) => {
    const id = c.req.param("id");

    const session = await deps.sessionStore.getById(id);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    // Placeholder return - in real implementation we would aggregate from TaskStore or MessageStore
    return c.json({
      ok: true,
      cost: {
        sessionId: id,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        currency: "USD",
        summary:
          "Cost tracking backend not fully persisted yet. Refer to client-side stream metadata.",
      },
    });
  });

  return app;
}
