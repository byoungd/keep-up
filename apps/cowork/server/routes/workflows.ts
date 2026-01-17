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

  app.post("/workflows/:templateId/run", async (c) => {
    const templateId = c.req.param("templateId");
    const template = await deps.workflowTemplates.getById(templateId);
    if (!template) {
      return jsonError(c, 404, "Workflow template not found");
    }

    const body = (await readJsonBody(c)) as WorkflowRunPayload | null;
    const parsedInputs = parseRunInputs(body?.inputs);
    if (!parsedInputs.ok) {
      return jsonError(c, 400, parsedInputs.error);
    }
    const inputs = parsedInputs.value;

    const validation = validateInputs(template.inputs, inputs);
    if (!validation.ok) {
      return jsonError(c, 400, validation.error);
    }

    const prompt = renderPrompt(template.prompt, inputs);
    const now = Date.now();
    const updated = await updateWorkflowUsage({
      store: deps.workflowTemplates,
      templateId,
      inputs,
      sessionId: body?.sessionId,
      timestamp: now,
    });
    await logWorkflowRun({
      auditLogs: deps.auditLogs,
      sessionId: body?.sessionId,
      template: updated ?? template,
      inputs,
      timestamp: now,
    });

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

  const steps: UpdateStep[] = [
    {
      parse: () => parseOptionalName(body.name),
      apply: (value) => {
        update.name = value as string;
      },
    },
    {
      parse: () => parseOptionalDescription(body.description),
      apply: (value) => {
        update.description = value as string;
      },
    },
    {
      parse: () => parseOptionalMode(body.mode),
      apply: (value) => {
        update.mode = value as CoworkWorkflowTemplate["mode"];
      },
    },
    {
      parse: () => parseOptionalPrompt(body.prompt),
      apply: (value) => {
        update.prompt = value as string;
      },
    },
    {
      parse: () => parseOptionalInputs(body.inputs),
      apply: (value) => {
        update.inputs = value as CoworkWorkflowTemplateInput[];
      },
    },
    {
      parse: () => parseOptionalExpectedArtifacts(body.expectedArtifacts),
      apply: (value) => {
        update.expectedArtifacts = value as string[];
      },
    },
    {
      parse: () => parseOptionalVersion(body.version),
      apply: (value) => {
        update.version = value as string;
      },
    },
  ];

  for (const step of steps) {
    const result = step.parse();
    if (!result.ok) {
      return result;
    }
    if (result.value !== undefined) {
      step.apply(result.value);
    }
  }

  return { ok: true, value: update };
}

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
    const parsed = parseInputEntry(input, seenKeys);
    if (!parsed.ok) {
      return parsed;
    }
    result.push(parsed.value);
  }

  return { ok: true, value: result };
}

function parseRunInputs(
  rawInputs: WorkflowRunPayload["inputs"]
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (rawInputs === undefined || rawInputs === null) {
    return { ok: true, value: {} };
  }
  if (!isRecord(rawInputs)) {
    return { ok: false, error: "inputs must be an object" };
  }
  const inputs: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawInputs)) {
    if (typeof value !== "string") {
      return { ok: false, error: `input '${key}' must be a string` };
    }
    inputs[key] = value;
  }
  return { ok: true, value: inputs };
}

async function updateWorkflowUsage(params: {
  store: WorkflowTemplateStoreLike;
  templateId: string;
  inputs: Record<string, string>;
  sessionId?: string;
  timestamp: number;
}): Promise<CoworkWorkflowTemplate | null> {
  const { store, templateId, inputs, sessionId, timestamp } = params;
  return store.update(templateId, (existing) => ({
    ...existing,
    usageCount: (existing.usageCount ?? 0) + 1,
    lastUsedAt: timestamp,
    lastUsedInputs: inputs,
    lastUsedSessionId: sessionId ?? existing.lastUsedSessionId,
    updatedAt: timestamp,
  }));
}

async function logWorkflowRun(params: {
  auditLogs?: AuditLogStoreLike;
  sessionId?: string;
  template: CoworkWorkflowTemplate;
  inputs: Record<string, string>;
  timestamp: number;
}): Promise<void> {
  const { auditLogs, sessionId, template, inputs, timestamp } = params;
  if (!auditLogs || !sessionId) {
    return;
  }
  await auditLogs.log({
    entryId: crypto.randomUUID(),
    sessionId,
    timestamp,
    action: "workflow_run",
    input: {
      templateId: template.templateId,
      version: template.version,
      mode: template.mode,
      inputs,
    },
  });
}

function parseOptionalName(
  name: WorkflowTemplatePayload["name"]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (name === undefined) {
    return { ok: true, value: undefined };
  }
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Template name is required" };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalDescription(description: WorkflowTemplatePayload["description"]): {
  ok: true;
  value: string | undefined;
} {
  if (description === undefined) {
    return { ok: true, value: undefined };
  }
  return {
    ok: true,
    value: typeof description === "string" ? description.trim() : "",
  };
}

function parseOptionalMode(
  mode: WorkflowTemplatePayload["mode"]
): { ok: true; value: CoworkWorkflowTemplate["mode"] | undefined } | { ok: false; error: string } {
  if (mode === undefined) {
    return { ok: true, value: undefined };
  }
  if (mode !== "plan" && mode !== "build") {
    return { ok: false, error: "mode must be 'plan' or 'build'" };
  }
  return { ok: true, value: mode };
}

function parseOptionalPrompt(
  prompt: WorkflowTemplatePayload["prompt"]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (prompt === undefined) {
    return { ok: true, value: undefined };
  }
  const trimmed = typeof prompt === "string" ? prompt.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Template prompt is required" };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalInputs(
  inputs: WorkflowTemplatePayload["inputs"]
): { ok: true; value: CoworkWorkflowTemplateInput[] | undefined } | { ok: false; error: string } {
  if (inputs === undefined) {
    return { ok: true, value: undefined };
  }
  const parsed = parseInputs(inputs);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, value: parsed.value };
}

function parseOptionalExpectedArtifacts(
  expectedArtifacts: WorkflowTemplatePayload["expectedArtifacts"]
): { ok: true; value: string[] | undefined } | { ok: false; error: string } {
  if (expectedArtifacts === undefined) {
    return { ok: true, value: undefined };
  }
  const parsed = parseExpectedArtifacts(expectedArtifacts);
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, value: parsed.value };
}

function parseOptionalVersion(
  version: WorkflowTemplatePayload["version"]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (version === undefined) {
    return { ok: true, value: undefined };
  }
  const trimmed = typeof version === "string" ? version.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Template version is required" };
  }
  return { ok: true, value: trimmed };
}

type UpdateResult = { ok: true; value: unknown } | { ok: false; error: string };

type UpdateStep = {
  parse: () => UpdateResult;
  apply: (value: unknown) => void;
};

function parseInputEntry(
  input: unknown,
  seenKeys: Set<string>
): { ok: true; value: CoworkWorkflowTemplateInput } | { ok: false; error: string } {
  if (!isRecord(input) || typeof input.key !== "string") {
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
  const placeholder = typeof input.placeholder === "string" ? input.placeholder.trim() : undefined;
  return { ok: true, value: { key, label, required, placeholder } };
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
