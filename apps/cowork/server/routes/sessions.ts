import type { CoworkSession } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { getLogger } from "../logger";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import { resolveSessionIsolationConfig } from "../runtime/utils";
import {
  createSessionSchema,
  createTaskSchema,
  updateSessionSchema,
  updateTaskStatusSchema,
} from "../schemas";
import type { SessionStoreLike, TaskStoreLike } from "../storage/contracts";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";
import { resolveCurrentUserId } from "../utils/currentUser";

interface SessionRouteDeps {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  events: SessionEventHub;
  taskRuntime?: CoworkTaskRuntime;
}

type SessionPatchInput = {
  title?: string;
  projectId?: string | null;
  endedAt?: number;
  isolationLevel?: CoworkSession["isolationLevel"];
  sandboxMode?: CoworkSession["sandboxMode"] | null;
  toolAllowlist?: CoworkSession["toolAllowlist"] | null;
  toolDenylist?: CoworkSession["toolDenylist"] | null;
};

export function createSessionRoutes(deps: SessionRouteDeps) {
  const app = new Hono();
  const logger = getLogger("sessions");

  app.post("/sessions", async (c) => {
    const body = await readJsonBody(c);
    const parsed = createSessionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid session payload", formatZodError(parsed.error));
    }

    const {
      userId,
      deviceId,
      grants,
      connectors,
      title,
      isolationLevel,
      sandboxMode,
      toolAllowlist,
      toolDenylist,
    } = parsed.data;
    const requestUserId = resolveCurrentUserId(c);
    const resolvedConfig = resolveSessionIsolationConfig({
      isolationLevel,
      sandboxMode,
      toolAllowlist,
      toolDenylist,
      userId: userId ?? requestUserId ?? undefined,
      currentUserId: requestUserId,
    });
    const session: CoworkSession = {
      sessionId: crypto.randomUUID(),
      userId: userId ?? requestUserId ?? "local-user",
      deviceId: deviceId ?? "local-device",
      platform: "macos",
      mode: "cowork",
      isolationLevel: resolvedConfig.isolationLevel,
      sandboxMode: resolvedConfig.sandboxMode,
      toolAllowlist: resolvedConfig.toolAllowlist,
      toolDenylist: resolvedConfig.toolDenylist,
      grants: grants.map((grant) => ({
        ...grant,
        id: grant.id ?? crypto.randomUUID(),
      })),
      connectors: connectors.map((connector) => ({
        ...connector,
        id: connector.id ?? crypto.randomUUID(),
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: title ?? deriveSessionTitle(grants),
    };

    await deps.sessionStore.create(session);
    logger.info("session created", {
      sessionId: session.sessionId,
      userId: session.userId,
    });
    deps.events.publish(session.sessionId, COWORK_EVENTS.SESSION_CREATED, {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      isolationLevel: session.isolationLevel,
      sandboxMode: session.sandboxMode,
      toolAllowlist: session.toolAllowlist,
      toolDenylist: session.toolDenylist,
    });

    return c.json({ ok: true, session }, 201);
  });

  app.get("/sessions", async (c) => {
    const sessions = await deps.sessionStore.getAll();
    return c.json({ ok: true, sessions });
  });

  app.get("/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }
    return c.json({ ok: true, session });
  });

  app.get("/sessions/:sessionId/tasks", async (c) => {
    const sessionId = c.req.param("sessionId");
    const tasks = await deps.taskStore.getBySession(sessionId);
    return c.json({ ok: true, tasks });
  });

  app.post("/sessions/:sessionId/tasks", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await readJsonBody(c);
    const parsed = createTaskSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid task payload", formatZodError(parsed.error));
    }

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    if (!deps.taskRuntime) {
      return jsonError(c, 503, "Cowork runtime is unavailable");
    }

    try {
      const task = await deps.taskRuntime.enqueueTask(session.sessionId, parsed.data);
      logger.info("task created", {
        sessionId,
        taskId: task.taskId,
        status: task.status,
      });
      return c.json({ ok: true, task }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enqueue task";
      return jsonError(c, 503, message);
    }
  });

  app.patch("/tasks/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const body = await readJsonBody(c);
    const parsed = updateTaskStatusSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid task update", formatZodError(parsed.error));
    }

    const updated = await deps.taskStore.update(taskId, (task) => ({
      ...task,
      status: parsed.data.status,
      updatedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Task not found");
    }

    deps.events.publish(updated.sessionId, COWORK_EVENTS.TASK_UPDATED, {
      taskId: updated.taskId,
      status: updated.status,
      title: updated.title,
      prompt: updated.prompt,
      modelId: updated.modelId,
      providerId: updated.providerId,
      fallbackNotice: updated.fallbackNotice,
      metadata: updated.metadata,
    });
    logger.info("task updated", {
      sessionId: updated.sessionId,
      taskId: updated.taskId,
      status: updated.status,
    });

    return c.json({ ok: true, task: updated });
  });

  app.delete("/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    await deps.sessionStore.delete(sessionId);
    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_DELETED, { sessionId });
    return c.json({ ok: true });
  });

  app.patch("/sessions/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await readJsonBody(c);
    const parsed = updateSessionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid session update", formatZodError(parsed.error));
    }

    const updated = await deps.sessionStore.update(sessionId, (prev) =>
      applySessionPatch(prev, parsed.data)
    );

    if (!updated) {
      return jsonError(c, 404, "Session not found");
    }

    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_UPDATED, {
      sessionId,
      title: updated.title,
      isolationLevel: updated.isolationLevel,
      sandboxMode: updated.sandboxMode,
      toolAllowlist: updated.toolAllowlist,
      toolDenylist: updated.toolDenylist,
    });

    return c.json({ ok: true, session: updated });
  });

  // ============================================================================
  // Agent Mode API (Plan/Build Mode)
  // ============================================================================

  /**
   * GET /sessions/:sessionId/mode
   * Get the current agent mode for a session
   */
  app.get("/sessions/:sessionId/mode", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    return c.json({
      ok: true,
      mode: session.agentMode ?? "build",
      sessionId,
    });
  });

  /**
   * PUT /sessions/:sessionId/mode
   * Set the agent mode for a session
   */
  app.put("/sessions/:sessionId/mode", async (c) => {
    const sessionId = c.req.param("sessionId");
    const body = await readJsonBody(c);

    const mode = (body as { mode?: string } | null)?.mode;
    if (mode !== "plan" && mode !== "build" && mode !== "review") {
      return jsonError(c, 400, "Invalid mode. Must be 'plan', 'build', or 'review'");
    }

    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const previousMode = session.agentMode ?? "build";
    const updated = await deps.sessionStore.update(sessionId, (prev) => ({
      ...prev,
      agentMode: mode,
      updatedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Session not found");
    }

    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_UPDATED, {
      sessionId,
      agentMode: mode,
    });
    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_MODE_CHANGED, {
      sessionId,
      mode,
      previousMode,
    });
    deps.taskRuntime?.updateSessionMode(sessionId, mode);

    return c.json({
      ok: true,
      mode: updated.agentMode ?? "build",
      sessionId,
    });
  });

  /**
   * POST /sessions/:sessionId/mode/toggle
   * Toggle between plan and build mode
   */
  app.post("/sessions/:sessionId/mode/toggle", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const currentMode = session.agentMode ?? "build";
    const modeOrder = ["plan", "build", "review"] as const;
    const nextIndex = Math.max(0, modeOrder.indexOf(currentMode)) + 1;
    const newMode = modeOrder[nextIndex % modeOrder.length];

    const updated = await deps.sessionStore.update(sessionId, (prev) => ({
      ...prev,
      agentMode: newMode,
      updatedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Session not found");
    }

    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_UPDATED, {
      sessionId,
      agentMode: newMode,
    });
    deps.events.publish(sessionId, COWORK_EVENTS.SESSION_MODE_CHANGED, {
      sessionId,
      mode: newMode,
      previousMode: currentMode,
    });
    deps.taskRuntime?.updateSessionMode(sessionId, newMode);

    return c.json({
      ok: true,
      previousMode: currentMode,
      mode: newMode,
      sessionId,
    });
  });

  return app;
}

function applySessionPatch(prev: CoworkSession, input: SessionPatchInput): CoworkSession {
  const next: CoworkSession = {
    ...prev,
    title: input.title !== undefined ? input.title : prev.title,
    projectId: input.projectId === undefined ? prev.projectId : (input.projectId ?? undefined),
    endedAt: input.endedAt !== undefined ? input.endedAt : prev.endedAt,
  };
  const resolvedConfig = resolveSessionIsolationConfig({
    isolationLevel: input.isolationLevel ?? prev.isolationLevel,
    sandboxMode: input.sandboxMode === null ? undefined : (input.sandboxMode ?? prev.sandboxMode),
    toolAllowlist:
      input.toolAllowlist === null ? undefined : (input.toolAllowlist ?? prev.toolAllowlist),
    toolDenylist:
      input.toolDenylist === null ? undefined : (input.toolDenylist ?? prev.toolDenylist),
    userId: prev.userId,
  });

  return {
    ...next,
    isolationLevel: resolvedConfig.isolationLevel,
    sandboxMode: resolvedConfig.sandboxMode,
    toolAllowlist: resolvedConfig.toolAllowlist,
    toolDenylist: resolvedConfig.toolDenylist,
  };
}

function deriveSessionTitle(grants: Array<{ rootPath: string }>): string {
  const rootPath = grants[0]?.rootPath;
  if (!rootPath) {
    return "Untitled Session";
  }
  const parts = rootPath.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? rootPath;
  return `${name} Session`;
}
