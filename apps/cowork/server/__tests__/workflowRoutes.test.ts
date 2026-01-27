import type { CoworkWorkflowTemplate } from "@ku0/agent-runtime";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorkflowRoutes } from "../routes/workflows";
import type { AuditLogStoreLike, WorkflowTemplateStoreLike } from "../storage/contracts";
import type { CoworkAuditEntry, CoworkAuditFilter } from "../storage/types";

class MockWorkflowTemplateStore implements WorkflowTemplateStoreLike {
  private readonly templates = new Map<string, CoworkWorkflowTemplate>();

  async getAll(): Promise<CoworkWorkflowTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getById(templateId: string): Promise<CoworkWorkflowTemplate | null> {
    return this.templates.get(templateId) ?? null;
  }

  async create(template: CoworkWorkflowTemplate): Promise<CoworkWorkflowTemplate> {
    this.templates.set(template.templateId, template);
    return template;
  }

  async update(
    templateId: string,
    updater: (template: CoworkWorkflowTemplate) => CoworkWorkflowTemplate
  ): Promise<CoworkWorkflowTemplate | null> {
    const existing = this.templates.get(templateId);
    if (!existing) {
      return null;
    }
    const updated = updater(existing);
    this.templates.set(templateId, updated);
    return updated;
  }

  async delete(templateId: string): Promise<boolean> {
    return this.templates.delete(templateId);
  }
}

class MockAuditLogStore implements AuditLogStoreLike {
  public readonly entries: CoworkAuditEntry[] = [];

  async log(entry: CoworkAuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getBySession(_sessionId: string, _filter?: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async getByTask(_taskId: string): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async query(_filter: CoworkAuditFilter): Promise<CoworkAuditEntry[]> {
    return [];
  }

  async getStats(_sessionId: string): Promise<{
    total: number;
    byAction: Record<string, number>;
    byTool: Record<string, number>;
    byOutcome: Record<string, number>;
  }> {
    return { total: 0, byAction: {}, byTool: {}, byOutcome: {} };
  }
}

describe("Workflow template routes", () => {
  let app: Hono;
  let store: MockWorkflowTemplateStore;
  let auditStore: MockAuditLogStore;

  beforeEach(() => {
    store = new MockWorkflowTemplateStore();
    auditStore = new MockAuditLogStore();
    app = createWorkflowRoutes({
      workflowTemplates: store,
      auditLogs: auditStore,
    });
  });

  it("creates, updates, and lists templates", async () => {
    const createRes = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Release Checklist",
        description: "Prepare release steps.",
        mode: "plan",
        inputs: [{ key: "scope", label: "Scope", required: true }],
        prompt: "Review {{scope}} before release.",
        expectedArtifacts: ["plan.md"],
        version: "1.0.0",
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as { template: CoworkWorkflowTemplate };
    expect(createData.template.name).toBe("Release Checklist");

    const updateRes = await app.request(`/workflows/${createData.template.templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Updated description",
        expectedArtifacts: ["plan.md", "report.md"],
      }),
    });
    expect(updateRes.status).toBe(200);

    const listRes = await app.request("/workflows");
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as { templates: CoworkWorkflowTemplate[] };
    expect(listData.templates.length).toBe(1);
  });

  it("runs templates and validates required inputs", async () => {
    const createRes = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bug Sweep",
        description: "Check for bugs.",
        mode: "build",
        inputs: [{ key: "component", label: "Component", required: true }],
        prompt: "Audit {{component}} for regressions.",
        expectedArtifacts: [],
        version: "1.0.0",
      }),
    });
    const createData = (await createRes.json()) as { template: CoworkWorkflowTemplate };

    const missingRes = await app.request(`/workflows/${createData.template.templateId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: {} }),
    });
    expect(missingRes.status).toBe(400);

    const runRes = await app.request(`/workflows/${createData.template.templateId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: { component: "editor" },
        sessionId: "session-1",
      }),
    });
    expect(runRes.status).toBe(200);
    const runData = (await runRes.json()) as { prompt: string; template: CoworkWorkflowTemplate };
    expect(runData.prompt).toContain("editor");
    expect(runData.template.usageCount).toBe(1);
    expect(auditStore.entries.length).toBe(1);
  });

  it("imports templates", async () => {
    const importRes = await app.request("/workflows/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: [
          {
            templateId: "template-1",
            name: "Doc Sweep",
            description: "Update docs",
            mode: "plan",
            inputs: [],
            prompt: "Scan docs.",
            expectedArtifacts: [],
            version: "1.0.0",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
    });
    expect(importRes.status).toBe(200);
    const data = (await importRes.json()) as { templates: CoworkWorkflowTemplate[] };
    expect(data.templates.length).toBe(1);
  });

  it("accepts review mode templates", async () => {
    const res = await app.request("/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Review Checklist",
        description: "Risk assessment and review.",
        mode: "review",
        inputs: [],
        prompt: "Review the changes for risks.",
        expectedArtifacts: ["review.md"],
        version: "1.0.0",
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { template: CoworkWorkflowTemplate };
    expect(data.template.mode).toBe("review");
  });
});
