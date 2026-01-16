import type { CoworkProject } from "@ku0/agent-runtime";
import { Hono } from "hono";
import { formatZodError, jsonError, readJsonBody } from "../http";
import { createProjectSchema } from "../schemas";
import type { ProjectStoreLike } from "../storage/contracts";

interface ProjectRouteDeps {
  projectStore: ProjectStoreLike;
}

export function createProjectRoutes(deps: ProjectRouteDeps) {
  const app = new Hono();

  app.get("/projects", async (c) => {
    const projects = await deps.projectStore.getAll();
    return c.json({ ok: true, projects });
  });

  app.get("/projects/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const project = await deps.projectStore.getById(projectId);
    if (!project) {
      return jsonError(c, 404, "Project not found");
    }
    return c.json({ ok: true, project });
  });

  app.post("/projects", async (c) => {
    const body = await readJsonBody(c);
    const parsed = createProjectSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid project payload", formatZodError(parsed.error));
    }

    const { name, description, pathHint, metadata } = parsed.data;
    const project: CoworkProject = {
      projectId: crypto.randomUUID(),
      name,
      description,
      pathHint,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata,
    };

    await deps.projectStore.create(project);
    return c.json({ ok: true, project }, 201);
  });

  app.patch("/projects/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const body = await readJsonBody(c);
    const parsed = createProjectSchema.partial().safeParse(body ?? {});
    if (!parsed.success) {
      return jsonError(c, 400, "Invalid project update", formatZodError(parsed.error));
    }

    const updated = await deps.projectStore.update(projectId, (project) => ({
      ...project,
      ...parsed.data,
      updatedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Project not found");
    }

    return c.json({ ok: true, project: updated });
  });

  app.delete("/projects/:projectId", async (c) => {
    const projectId = c.req.param("projectId");
    const deleted = await deps.projectStore.delete(projectId);
    if (!deleted) {
      return jsonError(c, 404, "Project not found");
    }
    return c.json({ ok: true });
  });

  return app;
}
