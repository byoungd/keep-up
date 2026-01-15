import type { CoworkSession, CoworkTask } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { createSessionSchema, createTaskSchema, updateTaskStatusSchema } from "../schemas";
import type { SessionStoreLike, TaskStoreLike } from "../storage";
import { COWORK_EVENTS, type SessionEventHub } from "../streaming/eventHub";

interface SessionRouteDeps {
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
  events: SessionEventHub;
}

export function createSessionRoutes(deps: SessionRouteDeps) {
  const app = new Hono();

  app.post("/sessions", async (c) => {
    const body = await readJsonBody(c);
    const parsed = createSessionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid session payload", formatZodError(parsed.error));
    }

    const { userId, deviceId, grants, connectors } = parsed.data;
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

    const now = Date.now();
    const task: CoworkTask = {
      taskId: crypto.randomUUID(),
      sessionId,
      title: parsed.data.title ?? "Cowork Task",
      prompt: parsed.data.prompt,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };

    await deps.taskStore.create(task);
    console.info("[cowork] task created", {
      sessionId,
      taskId: task.taskId,
      status: task.status,
    });
    deps.events.publish(sessionId, COWORK_EVENTS.TASK_CREATED, {
      taskId: task.taskId,
      status: task.status,
      title: task.title,
    });

    return c.json({ ok: true, task }, 201);
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
    });
    console.info("[cowork] task updated", {
      sessionId: updated.sessionId,
      taskId: updated.taskId,
      status: updated.status,
    });

    return c.json({ ok: true, task: updated });
  });

  return app;
}
