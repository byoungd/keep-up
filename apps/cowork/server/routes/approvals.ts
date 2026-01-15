import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { CoworkRuntimeBridge } from "../runtime/coworkRuntime";
import { approvalDecisionSchema, toolCheckSchema } from "../schemas";
import type { ApprovalStoreLike, SessionStoreLike } from "../storage";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";

interface ApprovalRouteDeps {
  approvals: ApprovalStoreLike;
  sessions: SessionStoreLike;
  events: SessionEventHub;
  runtime: CoworkRuntimeBridge;
}

export function createApprovalRoutes(deps: ApprovalRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/approvals", async (c) => {
    const sessionId = c.req.param("sessionId");
    const approvals = await deps.approvals.getBySession(sessionId);
    return c.json({ ok: true, approvals });
  });

  app.post("/sessions/:sessionId/tools/check", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await readJsonBody(c);
    const parsed = toolCheckSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid tool check payload", formatZodError(parsed.error));
    }

    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const result = await deps.runtime.checkAction(session, parsed.data);
    if (result.status === "approval_required") {
      console.info("[cowork] approval required", {
        sessionId,
        approvalId: result.approval.approvalId,
        action: result.approval.action,
        riskTags: result.approval.riskTags,
      });
      deps.events.publish(sessionId, COWORK_EVENTS.APPROVAL_REQUIRED, {
        approvalId: result.approval.approvalId,
        action: result.approval.action,
        riskTags: result.approval.riskTags,
        reason: result.approval.reason,
      });
    }

    return c.json({ ok: true, result });
  });

  app.patch("/approvals/:approvalId", async (c) => {
    const approvalId = c.req.param("approvalId");
    const body = await readJsonBody(c);
    const parsed = approvalDecisionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid approval decision", formatZodError(parsed.error));
    }

    const updated = await deps.approvals.update(approvalId, (approval) => ({
      ...approval,
      status: parsed.data.status,
      resolvedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Approval not found");
    }

    console.info("[cowork] approval resolved", {
      sessionId: updated.sessionId,
      approvalId: updated.approvalId,
      status: updated.status,
    });
    deps.events.publish(updated.sessionId, COWORK_EVENTS.APPROVAL_RESOLVED, {
      approvalId: updated.approvalId,
      status: updated.status,
    });

    return c.json({ ok: true, approval: updated });
  });

  return app;
}
