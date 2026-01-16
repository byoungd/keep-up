import type { CoworkSession } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import type { CoworkTaskRuntime } from "../runtime/coworkTaskRuntime";
import {
  createSessionSchema,
  createTaskSchema,
  updateSessionSchema,
  updateTaskStatusSchema,
} from "../schemas";
import type { SessionStoreLike, TaskStoreLike } from "../storage/contracts";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";

interface SessionRouteDeps {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  events: SessionEventHub;
  taskRuntime?: CoworkTaskRuntime;
}

export function createSessionRoutes(deps: SessionRouteDeps) {
  const app = new Hono();

  app.post("/sessions", async (c) => {
    const body = await readJsonBody(c);
    const parsed = createSessionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid session payload", formatZodError(parsed.error));
    }

    const { userId, deviceId, grants, connectors, title } = parsed.data;
    const session: CoworkSession = {
      sessionId: crypto.randomUUID(),
      userId: userId ?? "local-user",
      deviceId: deviceId ?? "local-device",
      platform: "macos",
      mode: "cowork",
      grants: grants.map((grant) => ({
        ...grant,
        id: grant.id ?? crypto.randomUUID(),
      })),
      connectors: connectors.map((connector) => ({
        ...connector,
        id: connector.id ?? crypto.randomUUID(),
      })),
      createdAt: Date.now(),
      title: title ?? deriveSessionTitle(grants),
    };

    await deps.sessionStore.create(session);
    console.info("[cowork] session created", {
      sessionId: session.sessionId,
      userId: session.userId,
    });
    deps.events.publish(session.sessionId, COWORK_EVENTS.SESSION_CREATED, {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
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
      const task = await deps.taskRuntime.enqueueTask(session, parsed.data);
      console.info("[cowork] task created", {
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
    });
    console.info("[cowork] task updated", {
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

    const { title, projectId, endedAt } = parsed.data;

    const updated = await deps.sessionStore.update(sessionId, (prev) => {
      const next: CoworkSession = { ...prev };
      if (title !== undefined) {
        next.title = title;
      }
      if (projectId !== undefined) {
        next.projectId = projectId ?? undefined;
      }
      if (endedAt !== undefined) {
        next.endedAt = endedAt;
      }
      return next;
    });

    if (!updated) {
      return jsonError(c, 404, "Session not found");
    }

    return c.json({ ok: true, session: updated });
  });

  return app;
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
