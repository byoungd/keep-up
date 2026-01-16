import type { CoworkProject } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createProjectRoutes } from "../routes/projects";
import type { ProjectStoreLike } from "../storage/contracts";

// Mock Store Implementation
class MockProjectStore implements ProjectStoreLike {
  private projects: Map<string, CoworkProject> = new Map();

  async getAll(): Promise<CoworkProject[]> {
    return Array.from(this.projects.values());
  }

  async getById(projectId: string): Promise<CoworkProject | null> {
    return this.projects.get(projectId) ?? null;
  }

  async create(project: CoworkProject): Promise<CoworkProject> {
    this.projects.set(project.projectId, project);
    return project;
  }

  async update(
    projectId: string,
    updater: (prev: CoworkProject) => CoworkProject
  ): Promise<CoworkProject | null> {
    const prev = this.projects.get(projectId);
    if (!prev) {
      return null;
    }
    const next = updater(prev);
    this.projects.set(projectId, next);
    return next;
  }

  async delete(projectId: string): Promise<boolean> {
    return this.projects.delete(projectId);
  }
}

describe("Project Management API", () => {
  let projectStore: MockProjectStore;
  let app: Hono;

  beforeEach(() => {
    projectStore = new MockProjectStore();
    app = createProjectRoutes({ projectStore });
  });

  it("should create a project", async () => {
    const res = await app.request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Project", description: "A test project" }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { ok: boolean; project: CoworkProject };
    expect(data.ok).toBe(true);
    expect(data.project.name).toBe("Test Project");
    expect(data.project.description).toBe("A test project");
    expect(data.project.projectId).toBeDefined();
  });

  it("should list projects", async () => {
    await projectStore.create({
      projectId: "p1",
      name: "Project 1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await app.request("/projects");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { projects: CoworkProject[] };
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toBe("Project 1");
  });

  it("should get a project by ID", async () => {
    const created = await projectStore.create({
      projectId: "p2",
      name: "Project 2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await app.request(`/projects/${created.projectId}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; project: CoworkProject };
    expect(data.project.projectId).toBe(created.projectId);
  });

  it("should update a project", async () => {
    const created = await projectStore.create({
      projectId: "p3",
      name: "Project 3",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await app.request(`/projects/${created.projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; project: CoworkProject };
    expect(data.project.name).toBe("Updated Name");

    const inStore = await projectStore.getById(created.projectId);
    expect(inStore?.name).toBe("Updated Name");
  });

  it("should delete a project", async () => {
    const created = await projectStore.create({
      projectId: "p4",
      name: "Project 4",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await app.request(`/projects/${created.projectId}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const check = await projectStore.getById(created.projectId);
    expect(check).toBeNull();
  });
});
