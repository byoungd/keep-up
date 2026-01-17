/**
 * Audit Log API Routes
 *
 * Provides endpoints for querying audit logs by session, task, or custom filters.
 */

import { Hono } from "hono";
import { z } from "zod";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { AuditLogStoreLike, SessionStoreLike } from "../storage/contracts";

interface AuditLogRouteDeps {
  auditLogStore: AuditLogStoreLike;
  sessions: SessionStoreLike;
}

const auditQuerySchema = z.object({
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  toolName: z.string().optional(),
  action: z
    .enum([
      "tool_call",
      "tool_result",
      "tool_error",
      "policy_decision",
      "approval_requested",
      "approval_resolved",
    ])
    .optional(),
  since: z.number().optional(),
  until: z.number().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

export function createAuditLogRoutes(deps: AuditLogRouteDeps) {
  const app = new Hono();

  // Get audit logs for a session
  app.get("/sessions/:sessionId/audit-logs", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const limit = parseInt(c.req.query("limit") ?? "100", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const entries = await deps.auditLogStore.getBySession(sessionId, {
      limit: Math.min(limit, 1000),
      offset,
    });

    return c.json({ ok: true, entries, count: entries.length });
  });

  // Get audit logs for a specific task
  app.get("/tasks/:taskId/audit-logs", async (c) => {
    const taskId = c.req.param("taskId");
    const entries = await deps.auditLogStore.getByTask(taskId);
    return c.json({ ok: true, entries, count: entries.length });
  });

  // Get audit log stats for a session
  app.get("/sessions/:sessionId/audit-logs/stats", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const stats = await deps.auditLogStore.getStats(sessionId);
    return c.json({ ok: true, stats });
  });

  // Query audit logs with filters
  app.post("/audit-logs/query", async (c) => {
    const body = await readJsonBody(c);
    const parsed = auditQuerySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid query parameters", formatZodError(parsed.error));
    }

    const entries = await deps.auditLogStore.query(parsed.data);
    return c.json({ ok: true, entries, count: entries.length });
  });

  return app;
}
