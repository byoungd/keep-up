import type { CoworkWorkflowTemplate, CoworkWorkflowTemplateInput } from "@ku0/agent-runtime";
import { isRecord } from "@ku0/shared";
import { Hono } from "hono";
import { jsonError, readJsonBody } from "../http";
import type { AuditLogStoreLike, WorkflowTemplateStoreLike } from "../storage/contracts";

interface WorkflowRouteDeps {
  workflowTemplates: WorkflowTemplateStoreLike;
  auditLogs?: AuditLogStoreLike;
}

interface WorkflowTemplatePayload {
  templateId?: string;
  name?: string;
  description?: string;
  mode?: CoworkWorkflowTemplate["mode"];
  inputs?: CoworkWorkflowTemplateInput[];
  prompt?: string;
  expectedArtifacts?: string[];
  version?: string;
}

interface WorkflowRunPayload {
  inputs?: Record<string, string>;
  sessionId?: string;
}

interface WorkflowImportPayload {
  templates?: CoworkWorkflowTemplate[];
}

const DEFAULT_VERSION = "1.0.0";

export function createWorkflowRoutes(deps: WorkflowRouteDeps) {
  const app = new Hono();

  app.get("/workflows", async (c) => {
    const templates = await deps.workflowTemplates.getAll();
    return c.json({ ok: true, templates });
  });

  app.get("/workflows/:templateId", async (c) => {
    const templateId = c.req.param("templateId");
    const template = await deps.workflowTemplates.getById(templateId);
    if (!template) {
      return jsonError(c, 404, "Workflow template not found");
    }
    return c.json({ ok: true, template });
  });

  app.post("/workflows", async (c) => {
    const body = (await readJsonBody(c)) as WorkflowTemplatePayload | null;
    const parsed = parseWorkflowTemplate(body);
    if (!parsed.ok) {
      return jsonError(c, 400, parsed.error);
    }

    const template: CoworkWorkflowTemplate = {
      ...parsed.value,
      templateId: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    };
    await deps.workflowTemplates.create(template);
    return c.json({ ok: true, template }, 201);
  });

  app.put("/workflows/:templateId", async (c) => {
    const templateId = c.req.param("templateId");
    const body = (await readJsonBody(c)) as WorkflowTemplatePayload | null;
    const update = parseWorkflowUpdate(body);
    if (!update.ok) {
      return jsonError(c, 400, update.error);
    }

    const updated = await deps.workflowTemplates.update(templateId, (existing) => ({
      ...existing,
      ...update.value,
      updatedAt: Date.now(),
    }));

    if (!updated) {
      return jsonError(c, 404, "Workflow template not found");
    }

    return c.json({ ok: true, template: updated });
  });

  app.delete("/workflows/:templateId", async (c) => {
    const templateId = c.req.param("templateId");
    const deleted = await deps.workflowTemplates.delete(templateId);
    if (!deleted) {
      return jsonError(c, 404, "Workflow template not found");
    }
    return c.json({ ok: true });
  });

  // biome-ignore lint:complexity/noExcessiveCognitiveComplexity
  app.post("/workflows/:templateId/run", async (c) => {
    const templateId = c.req.param("templateId");
    const template = await deps.workflowTemplates.getById(templateId);
    if (!template) {
      return jsonError(c, 404, "Workflow template not found");
    }

    const body = (await readJsonBody(c)) as WorkflowRunPayload | null;
    const rawInputs = body?.inputs ?? {};
    if (!isRecord(rawInputs)) {
      return jsonError(c, 400, "inputs must be an object");
    }
    const inputs: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawInputs)) {
      if (typeof value !== "string") {
        return jsonError(c, 400, `input '${key}' must be a string`);
      }
      inputs[key] = value;
    }

    const validation = validateInputs(template.inputs, inputs);
    if (!validation.ok) {
      return jsonError(c, 400, validation.error);
    }

    const prompt = renderPrompt(template.prompt, inputs);
    const now = Date.now();
    const updated = await deps.workflowTemplates.update(templateId, (existing) => ({
      ...existing,
      usageCount: (existing.usageCount ?? 0) + 1,
      lastUsedAt: now,
      lastUsedInputs: inputs,
      lastUsedSessionId: body?.sessionId ?? existing.lastUsedSessionId,
      updatedAt: now,
    }));

    if (updated && deps.auditLogs && body?.sessionId) {
      await deps.auditLogs.log({
        entryId: crypto.randomUUID(),
        sessionId: body.sessionId,
        timestamp: now,
        action: "workflow_run",
        input: {
          templateId: updated.templateId,
          version: updated.version,
          mode: updated.mode,
          inputs,
        },
      });
    }

    return c.json({ ok: true, prompt, template: updated ?? template });
  });

  app.post("/workflows/import", async (c) => {
    const body = (await readJsonBody(c)) as WorkflowImportPayload | null;
    if (!body?.templates || !Array.isArray(body.templates)) {
      return jsonError(c, 400, "templates must be an array");
    }

    const imported: CoworkWorkflowTemplate[] = [];
    for (const raw of body.templates) {
      const parsed = parseWorkflowTemplate(raw);
      if (!parsed.ok) {
        return jsonError(c, 400, parsed.error);
      }
      const now = Date.now();
      const template: CoworkWorkflowTemplate = {
        ...parsed.value,
        templateId: raw.templateId ?? crypto.randomUUID(),
        createdAt: raw.createdAt ?? now,
        updatedAt: now,
        usageCount: raw.usageCount ?? 0,
        lastUsedAt: raw.lastUsedAt,
        lastUsedInputs: raw.lastUsedInputs,
        lastUsedSessionId: raw.lastUsedSessionId,
      };
      await deps.workflowTemplates.create(template);
      imported.push(template);
    }

    return c.json({ ok: true, templates: imported });
  });

  return app;
}

function parseWorkflowTemplate(body: WorkflowTemplatePayload | CoworkWorkflowTemplate | null):
  | {
      ok: true;
      value: Omit<
        CoworkWorkflowTemplate,
        | "templateId"
        | "createdAt"
        | "updatedAt"
        | "usageCount"
        | "lastUsedAt"
        | "lastUsedInputs"
        | "lastUsedSessionId"
      >;
    }
  | { ok: false; error: string } {
  if (!body) {
    return { ok: false, error: "Template body is required" };
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return { ok: false, error: "Template name is required" };
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const mode = body.mode;
  if (mode !== "plan" && mode !== "build") {
    return { ok: false, error: "mode must be 'plan' or 'build'" };
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, error: "Template prompt is required" };
  }

  const parsedInputs = parseInputs(body.inputs);
  if (!parsedInputs.ok) {
    return parsedInputs;
  }

  const expectedArtifacts = parseExpectedArtifacts(body.expectedArtifacts);
  if (!expectedArtifacts.ok) {
    return expectedArtifacts;
  }

  const version =
    typeof body.version === "string" && body.version.trim().length > 0
      ? body.version.trim()
      : DEFAULT_VERSION;

  return {
    ok: true,
    value: {
      name,
      description,
      mode,
      inputs: parsedInputs.value,
      prompt,
      expectedArtifacts: expectedArtifacts.value,
      version,
    },
  };
}

// biome-ignore lint:complexity/noExcessiveCognitiveComplexity
function parseWorkflowUpdate(body: WorkflowTemplatePayload | null):
  | {
      ok: true;
      value: Partial<CoworkWorkflowTemplate>;
    }
  | { ok: false; error: string } {
  if (!body) {
    return { ok: false, error: "Template body is required" };
  }
  const update: Partial<CoworkWorkflowTemplate> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return { ok: false, error: "Template name is required" };
    }
    update.name = name;
  }

  if (body.description !== undefined) {
    update.description = typeof body.description === "string" ? body.description.trim() : "";
  }

  if (body.mode !== undefined) {
    if (body.mode !== "plan" && body.mode !== "build") {
      return { ok: false, error: "mode must be 'plan' or 'build'" };
    }
    update.mode = body.mode;
  }

  if (body.prompt !== undefined) {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return { ok: false, error: "Template prompt is required" };
    }
    update.prompt = prompt;
  }

  if (body.inputs !== undefined) {
    const parsedInputs = parseInputs(body.inputs);
    if (!parsedInputs.ok) {
      return parsedInputs;
    }
    update.inputs = parsedInputs.value;
  }

  if (body.expectedArtifacts !== undefined) {
    const expectedArtifacts = parseExpectedArtifacts(body.expectedArtifacts);
    if (!expectedArtifacts.ok) {
      return expectedArtifacts;
    }
    update.expectedArtifacts = expectedArtifacts.value;
  }

  if (body.version !== undefined) {
    const version = typeof body.version === "string" ? body.version.trim() : "";
    if (!version) {
      return { ok: false, error: "Template version is required" };
    }
    update.version = version;
  }

  return { ok: true, value: update };
}

// biome-ignore lint:complexity/noExcessiveCognitiveComplexity
function parseInputs(
  inputs: WorkflowTemplatePayload["inputs"]
): { ok: true; value: CoworkWorkflowTemplateInput[] } | { ok: false; error: string } {
  if (!inputs) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(inputs)) {
    return { ok: false, error: "inputs must be an array" };
  }

  const seenKeys = new Set<string>();
  const result: CoworkWorkflowTemplateInput[] = [];
  for (const input of inputs) {
    if (!input || typeof input.key !== "string") {
      return { ok: false, error: "input key must be a string" };
    }
    const key = input.key.trim();
    if (!key) {
      return { ok: false, error: "input key is required" };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return { ok: false, error: `input key '${key}' is invalid` };
    }
    if (seenKeys.has(key)) {
      return { ok: false, error: `input key '${key}' is duplicated` };
    }
    seenKeys.add(key);
    const label = typeof input.label === "string" ? input.label.trim() : key;
    const required = Boolean(input.required);
    const placeholder =
      typeof input.placeholder === "string" ? input.placeholder.trim() : undefined;
    result.push({ key, label, required, placeholder });
  }

  return { ok: true, value: result };
}

function parseExpectedArtifacts(
  expectedArtifacts: WorkflowTemplatePayload["expectedArtifacts"]
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!expectedArtifacts) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(expectedArtifacts)) {
    return { ok: false, error: "expectedArtifacts must be an array" };
  }
  const cleaned = expectedArtifacts
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return { ok: true, value: cleaned };
}

function validateInputs(
  inputs: CoworkWorkflowTemplateInput[],
  values: Record<string, string>
): { ok: true } | { ok: false; error: string } {
  for (const input of inputs) {
    if (!input.required) {
      continue;
    }
    const value = values[input.key];
    if (typeof value !== "string" || value.trim().length === 0) {
      return { ok: false, error: `Missing required input: ${input.key}` };
    }
  }
  return { ok: true };
}

function renderPrompt(prompt: string, values: Record<string, string>): string {
  return prompt.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined ? "" : value;
  });
}
