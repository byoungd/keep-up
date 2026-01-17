import { Hono } from "hono";
import { jsonError } from "../http";
import type {
  ArtifactStoreLike,
  AuditLogStoreLike,
  SessionStoreLike,
  TaskStoreLike,
} from "../storage/contracts";

interface ArtifactRouteDeps {
  artifactStore: ArtifactStoreLike;
  auditLogStore: AuditLogStoreLike;
  sessionStore: SessionStoreLike;
  taskStore: TaskStoreLike;
}

export function createArtifactRoutes(deps: ArtifactRouteDeps) {
  const app = new Hono();

  app.get("/sessions/:sessionId/artifacts", async (c) => {
    const sessionId = c.req.param("sessionId");
    const session = await deps.sessionStore.getById(sessionId);
    if (!session) {
      return jsonError(c, 404, "Session not found");
    }

    const [artifacts, tasks] = await Promise.all([
      deps.artifactStore.getBySession(sessionId),
      deps.taskStore.getBySession(sessionId),
    ]);
    const taskTitles = buildTaskTitleMap(tasks);

    return c.json({
      ok: true,
      artifacts: artifacts
        .map((artifact) =>
          withTitles(artifact, {
            sessionTitle: session.title,
            taskTitle: taskTitles.get(artifact.taskId ?? "") ?? undefined,
          })
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    });
  });

  app.get("/library/artifacts", async (c) => {
    const [artifacts, sessions, tasks] = await Promise.all([
      deps.artifactStore.getAll(),
      deps.sessionStore.getAll(),
      deps.taskStore.getAll(),
    ]);

    const sessionTitles = buildSessionTitleMap(sessions);
    const taskTitles = buildTaskTitleMap(tasks);

    return c.json({
      ok: true,
      artifacts: artifacts
        .map((artifact) =>
          withTitles(artifact, {
            sessionTitle: sessionTitles.get(artifact.sessionId),
            taskTitle: taskTitles.get(artifact.taskId ?? "") ?? undefined,
          })
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    });
  });

  app.post("/artifacts/:artifactId/apply", async (c) => {
    const artifactId = c.req.param("artifactId");
    const record = await deps.artifactStore.getById(artifactId);
    if (!record) {
      return jsonError(c, 404, "Artifact not found");
    }
    if (record.type !== "diff") {
      return jsonError(c, 400, "Only diff artifacts can be applied");
    }

    const now = Date.now();
    const updated = await deps.artifactStore.upsert({
      ...record,
      status: "applied",
      appliedAt: now,
      version: record.version + 1,
      updatedAt: now,
    });

    void deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: record.sessionId,
      taskId: record.taskId,
      timestamp: now,
      action: "artifact_apply",
      toolName: "artifact.apply",
      input: { artifactId },
      outcome: "success",
    });

    return c.json({ ok: true, artifact: updated });
  });

  app.post("/artifacts/:artifactId/revert", async (c) => {
    const artifactId = c.req.param("artifactId");
    const record = await deps.artifactStore.getById(artifactId);
    if (!record) {
      return jsonError(c, 404, "Artifact not found");
    }
    if (record.type !== "diff") {
      return jsonError(c, 400, "Only diff artifacts can be reverted");
    }

    const now = Date.now();
    const updated = await deps.artifactStore.upsert({
      ...record,
      status: "reverted",
      appliedAt: undefined,
      version: record.version + 1,
      updatedAt: now,
    });

    void deps.auditLogStore.log({
      entryId: crypto.randomUUID(),
      sessionId: record.sessionId,
      taskId: record.taskId,
      timestamp: now,
      action: "artifact_revert",
      toolName: "artifact.revert",
      input: { artifactId },
      outcome: "success",
    });

    return c.json({ ok: true, artifact: updated });
  });

  return app;
}

function buildSessionTitleMap(
  sessions: Array<{ sessionId: string; title?: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const session of sessions) {
    if (session.title) {
      map.set(session.sessionId, session.title);
    }
  }
  return map;
}

function buildTaskTitleMap(tasks: Array<{ taskId: string; title: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const task of tasks) {
    map.set(task.taskId, task.title);
  }
  return map;
}

function withTitles<T extends { sessionId: string; taskId?: string }>(
  artifact: T,
  titles: { sessionTitle?: string; taskTitle?: string }
) {
  return {
    ...artifact,
    sessionTitle: titles.sessionTitle,
    taskTitle: titles.taskTitle,
  };
}
