import type { CoworkWorkspaceEvent, CoworkWorkspaceSession } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import {
  workspaceSessionCreateSchema,
  workspaceSessionEventSchema,
  workspaceSessionUpdateSchema,
} from "../schemas";
import type {
  SessionStoreLike,
  WorkspaceEventStoreLike,
  WorkspaceSessionStoreLike,
} from "../storage/contracts";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";

interface WorkspaceSessionRouteDeps {
  sessions: SessionStoreLike;
  workspaceSessions: WorkspaceSessionStoreLike;
  workspaceEvents: WorkspaceEventStoreLike;
  events: SessionEventHub;
}

type WorkspaceEventInput = {
  kind: CoworkWorkspaceEvent["kind"];
  payload: CoworkWorkspaceEvent["payload"];
  source?: CoworkWorkspaceEvent["source"];
  timestamp?: number;
};

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveWorkspaceId(
  session: { workspaceId?: string; grants: Array<{ rootPath: string }> },
  override?: string
): string | undefined {
  return override ?? session.workspaceId ?? session.grants[0]?.rootPath;
}

function parseEventInputs(body: unknown): WorkspaceEventInput[] | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as { event?: unknown; events?: unknown };
  if (Array.isArray(payload.events)) {
    return payload.events as WorkspaceEventInput[];
  }
  if (payload.event && typeof payload.event === "object") {
    return [payload.event as WorkspaceEventInput];
  }
  return null;
}

export function createWorkspaceSessionRoutes(deps: WorkspaceSessionRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/workspace-sessions", async (c) => {
    const sessionId = c.req.param("sessionId");
    const workspaceSessions = await deps.workspaceSessions.getBySession(sessionId);
    return c.json({ ok: true, workspaceSessions });
  });

  app.post("/sessions/:sessionId/workspace-sessions", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await readJsonBody(c);
    const parsed = workspaceSessionCreateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid workspace session payload", formatZodError(parsed.error));
    }

    const session = await deps.sessions.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const now = Date.now();
    const workspaceSession: CoworkWorkspaceSession = {
      workspaceSessionId: crypto.randomUUID(),
      sessionId,
      workspaceId: resolveWorkspaceId(session, parsed.data.workspaceId),
      kind: parsed.data.kind,
      status: "requested",
      ownerAgentId: parsed.data.ownerAgentId,
      controller: parsed.data.controller ?? "agent",
      controllerId: parsed.data.controllerId,
      createdAt: now,
      updatedAt: now,
      metadata: parsed.data.metadata,
    };

    const created = await deps.workspaceSessions.create(workspaceSession);
    deps.events.publish(sessionId, COWORK_EVENTS.WORKSPACE_SESSION_CREATED, {
      sessionId,
      workspaceSession: created,
    });

    return c.json({ ok: true, workspaceSession: created }, 201);
  });

  app.get("/workspace-sessions/:workspaceSessionId", async (c) => {
    const workspaceSessionId = c.req.param("workspaceSessionId");
    const session = await deps.workspaceSessions.getById(workspaceSessionId);
    if (!session) {
      return jsonError(c, 404, "Workspace session not found");
    }
    return c.json({ ok: true, workspaceSession: session });
  });

  app.patch("/workspace-sessions/:workspaceSessionId", async (c) => {
    const workspaceSessionId = c.req.param("workspaceSessionId");
    const body = await readJsonBody(c);
    const parsed = workspaceSessionUpdateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid workspace session update", formatZodError(parsed.error));
    }

    let controllerChanged = false;
    let previousController: CoworkWorkspaceSession["controller"] | null = null;
    let previousControllerId: string | undefined;

    const updated = await deps.workspaceSessions.update(workspaceSessionId, (prev) => {
      const now = Date.now();
      const nextStatus = parsed.data.status ?? prev.status;
      const endedAt =
        parsed.data.endedAt ?? (nextStatus === "ended" && !prev.endedAt ? now : prev.endedAt);
      const nextController = parsed.data.controller ?? prev.controller;
      const nextControllerId = parsed.data.controllerId ?? prev.controllerId;

      controllerChanged =
        nextController !== prev.controller || nextControllerId !== prev.controllerId;
      previousController = prev.controller;
      previousControllerId = prev.controllerId;

      return {
        ...prev,
        status: nextStatus,
        controller: nextController,
        controllerId: nextControllerId,
        endedAt,
        updatedAt: now,
        metadata: parsed.data.metadata
          ? { ...(prev.metadata ?? {}), ...parsed.data.metadata }
          : prev.metadata,
      };
    });

    if (!updated) {
      return jsonError(c, 404, "Workspace session not found");
    }

    deps.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_UPDATED, {
      sessionId: updated.sessionId,
      workspaceSession: updated,
    });

    if (controllerChanged && previousController) {
      const event = await deps.workspaceEvents.append({
        workspaceSessionId: updated.workspaceSessionId,
        sessionId: updated.sessionId,
        kind: "control_handoff",
        payload: {
          from: previousController,
          to: updated.controller,
          fromId: previousControllerId,
          toId: updated.controllerId,
        },
        source: "system",
      });
      deps.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_EVENT, {
        sessionId: updated.sessionId,
        workspaceSessionId: updated.workspaceSessionId,
        event,
      });
    }

    if (updated.status === "ended" && updated.endedAt) {
      deps.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_ENDED, {
        sessionId: updated.sessionId,
        workspaceSessionId: updated.workspaceSessionId,
        endedAt: updated.endedAt,
      });
    }

    return c.json({ ok: true, workspaceSession: updated });
  });

  app.delete("/workspace-sessions/:workspaceSessionId", async (c) => {
    const workspaceSessionId = c.req.param("workspaceSessionId");
    const existing = await deps.workspaceSessions.getById(workspaceSessionId);
    if (!existing) {
      return jsonError(c, 404, "Workspace session not found");
    }

    await deps.workspaceSessions.delete(workspaceSessionId);
    deps.events.publish(existing.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_ENDED, {
      sessionId: existing.sessionId,
      workspaceSessionId: existing.workspaceSessionId,
      endedAt: existing.endedAt ?? Date.now(),
    });
    return c.json({ ok: true });
  });

  app.get("/workspace-sessions/:workspaceSessionId/events", async (c) => {
    const workspaceSessionId = c.req.param("workspaceSessionId");
    const session = await deps.workspaceSessions.getById(workspaceSessionId);
    if (!session) {
      return jsonError(c, 404, "Workspace session not found");
    }

    const afterSequence = parseNumber(c.req.query("afterSequence"));
    const limit = parseNumber(c.req.query("limit"));
    const events = await deps.workspaceEvents.getByWorkspaceSession(workspaceSessionId, {
      afterSequence,
      limit,
    });
    return c.json({ ok: true, workspaceEvents: events });
  });

  app.post("/workspace-sessions/:workspaceSessionId/events", async (c) => {
    const workspaceSessionId = c.req.param("workspaceSessionId");
    const session = await deps.workspaceSessions.getById(workspaceSessionId);
    if (!session) {
      return jsonError(c, 404, "Workspace session not found");
    }

    const body = await readJsonBody(c);
    const inputs = parseEventInputs(body);
    if (!inputs) {
      return jsonError(c, 400, "Invalid workspace event payload");
    }

    const validated: WorkspaceEventInput[] = [];
    for (const input of inputs) {
      const parsed = workspaceSessionEventSchema.safeParse(input ?? {});
      if (!parsed.success) {
        return jsonError(c, 400, "Invalid workspace event payload", formatZodError(parsed.error));
      }
      validated.push(parsed.data);
    }

    const stored = await deps.workspaceEvents.appendMany(
      validated.map((event) => ({
        workspaceSessionId,
        sessionId: session.sessionId,
        kind: event.kind,
        payload: event.payload,
        source: event.source,
        timestamp: event.timestamp,
      }))
    );

    await deps.workspaceSessions.update(workspaceSessionId, (prev) => ({
      ...prev,
      updatedAt: Date.now(),
    }));

    for (const event of stored) {
      deps.events.publish(session.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_EVENT, {
        sessionId: session.sessionId,
        workspaceSessionId,
        event,
      });
    }

    return c.json({ ok: true, workspaceEvents: stored }, 201);
  });

  return app;
}
