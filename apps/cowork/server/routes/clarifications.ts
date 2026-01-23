import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import { clarificationAnswerSchema } from "../schemas";

interface ClarificationRouteDeps {
  taskRuntime?: CoworkTaskRuntime;
}

export function createClarificationRoutes(deps: ClarificationRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/clarifications", async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Clarification runtime unavailable");
    }
    const clarifications = deps.taskRuntime.listClarifications(sessionId);
    return c.json({ ok: true, clarifications });
  });

  app.patch("/clarifications/:clarificationId", async (c) => {
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Clarification runtime unavailable");
    }
    const clarificationId = c.req.param("clarificationId");
    const body = await readJsonBody(c);
    const parsed = clarificationAnswerSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid clarification response", formatZodError(parsed.error));
    }

    const response = deps.taskRuntime.submitClarification({
      requestId: clarificationId,
      answer: parsed.data.answer,
      selectedOption: parsed.data.selectedOption,
    });

    if (!response) {
      return jsonError(c, 404, "Clarification not found");
    }

    return c.json({ ok: true, response });
  });

  return app;
}
