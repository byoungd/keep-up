import { Hono } from "hono";
import { jsonError } from "../http";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import type { SessionStoreLike } from "../storage/contracts";

interface SkillRouteDeps {
  taskRuntime?: CoworkTaskRuntime;
  sessions: SessionStoreLike;
}

export function createSkillRoutes(deps: SkillRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/skills", async (c) => {
    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Skills runtime unavailable");
    }
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const result = await deps.taskRuntime.listSkills(sessionId, session);
    return c.json({ ok: true, ...result });
  });

  return app;
}
