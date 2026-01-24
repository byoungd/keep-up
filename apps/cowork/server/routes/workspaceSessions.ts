import type { CoworkWorkspaceEvent, CoworkWorkspaceSession } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { WorkspaceSessionRuntime } from "../runtime/services/WorkspaceSessionRuntime";
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
  runtime?: WorkspaceSessionRuntime;
}

type WorkspaceEventInput = {
  kind: CoworkWorkspaceEvent["kind"];
  payload: CoworkWorkspaceEvent["payload"];
  source?: CoworkWorkspaceEvent["source"];
  timestamp?: number;
};

type RuntimeSessionInfo = {
  status: CoworkWorkspaceSession["status"];
  createdAt: number;
  updatedAt: number;
};

type WorkspaceSessionUpdateResult = {
  updated: CoworkWorkspaceSession | null;
  controllerChanged: boolean;
  previousController: CoworkWorkspaceSession["controller"] | null;
  previousControllerId?: string;
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

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startRuntimeSession(
  runtime: WorkspaceSessionRuntime | undefined,
  input: {
    workspaceSessionId: string;
    kind: CoworkWorkspaceSession["kind"];
    ownerAgentId?: string;
  }
): { runtimeSession: RuntimeSessionInfo | null; error?: string } {
  if (!runtime) {
    return { runtimeSession: null };
  }
  try {
    return {
      runtimeSession: runtime.createSession({
        workspaceSessionId: input.workspaceSessionId,
        kind: input.kind,
        ownerAgentId: input.ownerAgentId,
      }),
    };
  } catch (error) {
    return { runtimeSession: null, error: formatErrorMessage(error) };
  }
}

function applyRuntimeStatusUpdate(
  runtime: WorkspaceSessionRuntime | undefined,
  workspaceSessionId: string,
  currentStatus: CoworkWorkspaceSession["status"],
  nextStatus?: CoworkWorkspaceSession["status"]
): string | null {
  if (!runtime || !nextStatus || nextStatus === currentStatus) {
    return null;
  }
  try {
    if (nextStatus === "paused") {
      runtime.pauseSession(workspaceSessionId);
    } else if (nextStatus === "active") {
      runtime.resumeSession(workspaceSessionId);
    } else if (nextStatus === "closed") {
      runtime.closeSession(workspaceSessionId);
    }
    return null;
  } catch (error) {
    return formatErrorMessage(error);
  }
}

async function updateWorkspaceSessionRecord(
  store: WorkspaceSessionStoreLike,
  workspaceSessionId: string,
  input: {
    nextStatus: CoworkWorkspaceSession["status"];
    controller?: CoworkWorkspaceSession["controller"];
    controllerId?: string;
    metadata?: Record<string, unknown>;
    endedAt?: number;
  }
): Promise<WorkspaceSessionUpdateResult> {
  let controllerChanged = false;
  let previousController: CoworkWorkspaceSession["controller"] | null = null;
  let previousControllerId: string | undefined;

  const updated = await store.update(workspaceSessionId, (prev) => {
    const now = Date.now();
    const endedAt =
      input.endedAt ?? (input.nextStatus === "closed" && !prev.endedAt ? now : prev.endedAt);
    const nextController = input.controller ?? prev.controller;
    const nextControllerId = input.controllerId ?? prev.controllerId;

    controllerChanged =
      nextController !== prev.controller || nextControllerId !== prev.controllerId;
    previousController = prev.controller;
    previousControllerId = prev.controllerId;

    return {
      ...prev,
      status: input.nextStatus,
      controller: nextController,
      controllerId: nextControllerId,
      endedAt,
      updatedAt: now,
      metadata: input.metadata ? { ...(prev.metadata ?? {}), ...input.metadata } : prev.metadata,
    };
  });

  return {
    updated,
    controllerChanged,
    previousController,
    previousControllerId,
  };
}

async function maybeEmitControllerHandoff(
  deps: Pick<WorkspaceSessionRouteDeps, "workspaceEvents" | "events">,
  session: CoworkWorkspaceSession,
  controllerChanged: boolean,
  previousController: CoworkWorkspaceSession["controller"] | null,
  previousControllerId?: string
): Promise<void> {
  if (!controllerChanged || !previousController) {
    return;
  }
  const event = await deps.workspaceEvents.append({
    workspaceSessionId: session.workspaceSessionId,
    sessionId: session.sessionId,
    kind: "log_line",
    payload: {
      message: "control_handoff",
      from: previousController,
      to: session.controller,
      fromId: previousControllerId,
      toId: session.controllerId,
    },
    source: "system",
  });
  deps.events.publish(session.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_EVENT, {
    sessionId: session.sessionId,
    workspaceSessionId: session.workspaceSessionId,
    event,
  });
}

function maybePublishSessionEnded(events: SessionEventHub, session: CoworkWorkspaceSession): void {
  if (session.status !== "closed" || !session.endedAt) {
    return;
  }
  events.publish(session.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_ENDED, {
    sessionId: session.sessionId,
    workspaceSessionId: session.workspaceSessionId,
    endedAt: session.endedAt,
  });
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

    const workspaceSessionId = crypto.randomUUID();
    const runtimeResult = startRuntimeSession(deps.runtime, {
      workspaceSessionId,
      kind: parsed.data.kind,
      ownerAgentId: parsed.data.ownerAgentId,
    });
    if (runtimeResult.error) {
      return jsonError(c, 500, "Failed to start workspace session", runtimeResult.error);
    }

    const now = Date.now();
    const createdAt = runtimeResult.runtimeSession?.createdAt ?? now;
    const updatedAt = runtimeResult.runtimeSession?.updatedAt ?? createdAt;
    const status = runtimeResult.runtimeSession?.status ?? "created";
    const workspaceSession: CoworkWorkspaceSession = {
      workspaceSessionId,
      sessionId,
      workspaceId: resolveWorkspaceId(session, parsed.data.workspaceId),
      kind: parsed.data.kind,
      status,
      ownerAgentId: parsed.data.ownerAgentId,
      controller: parsed.data.controller ?? "agent",
      controllerId: parsed.data.controllerId,
      createdAt,
      updatedAt,
      metadata: parsed.data.metadata,
    };

    const created = await deps.workspaceSessions.create(workspaceSession);
    deps.events.publish(sessionId, COWORK_EVENTS.WORKSPACE_SESSION_CREATED, {
      sessionId,
      workspaceSession: created,
    });

    await deps.runtime?.drainAndPublish();
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
    const existing = await deps.workspaceSessions.getById(workspaceSessionId);
    if (!existing) {
      return jsonError(c, 404, "Workspace session not found");
    }
    const body = await readJsonBody(c);
    const parsed = workspaceSessionUpdateSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid workspace session update", formatZodError(parsed.error));
    }

    const nextStatus = parsed.data.status ?? existing.status;
    const runtimeError = applyRuntimeStatusUpdate(
      deps.runtime,
      workspaceSessionId,
      existing.status,
      parsed.data.status
    );
    if (runtimeError) {
      return jsonError(c, 500, "Failed to update workspace session runtime", runtimeError);
    }

    const { updated, controllerChanged, previousController, previousControllerId } =
      await updateWorkspaceSessionRecord(deps.workspaceSessions, workspaceSessionId, {
        nextStatus,
        controller: parsed.data.controller,
        controllerId: parsed.data.controllerId,
        metadata: parsed.data.metadata,
        endedAt: parsed.data.endedAt,
      });

    if (!updated) {
      return jsonError(c, 404, "Workspace session not found");
    }

    deps.events.publish(updated.sessionId, COWORK_EVENTS.WORKSPACE_SESSION_UPDATED, {
      sessionId: updated.sessionId,
      workspaceSession: updated,
    });

    await maybeEmitControllerHandoff(
      deps,
      updated,
      controllerChanged,
      previousController,
      previousControllerId
    );

    maybePublishSessionEnded(deps.events, updated);

    await deps.runtime?.drainAndPublish();
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

    await deps.runtime?.drainAndPublish();
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
