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
      "artifact_apply",
      "artifact_revert",
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

  app.get("/sessions/:sessionId/audit-logs", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const limit = parseLimit(c.req.query("limit"));
    const offset = parseOffset(c.req.query("offset"));

    const entries = await deps.auditLogStore.getBySession(sessionId, {
      limit,
      offset,
    });

    return c.json({ ok: true, entries, count: entries.length });
  });

  app.get("/tasks/:taskId/audit-logs", async (c) => {
    const taskId = c.req.param("taskId");
    const entries = await deps.auditLogStore.getByTask(taskId);
    return c.json({ ok: true, entries, count: entries.length });
  });

  app.get("/sessions/:sessionId/audit-logs/stats", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const stats = await deps.auditLogStore.getStats(sessionId);
    return c.json({ ok: true, stats });
  });

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

function parseLimit(raw: string | undefined, fallback = 100): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 1000);
}

function parseOffset(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
