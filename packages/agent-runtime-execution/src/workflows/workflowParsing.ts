import matter from "gray-matter";
import type { WorkflowPhase, WorkflowTemplate } from "./index";

export type WorkflowFrontmatter = {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  requiredTools?: string[];
  successCriteria?: string[];
  estimatedDuration?: number;
  phases: WorkflowPhase[];
  dependsOn?: string[];
  metadata?: Record<string, string>;
};

export type WorkflowValidationOptions = {
  idMaxLength?: number;
};

export type WorkflowParseOutcome =
  | { success: true; template: WorkflowTemplate }
  | { success: false; error: string };

const DEFAULT_ID_MAX_LENGTH = 64;

const ALLOWED_FIELDS = new Set([
  "id",
  "name",
  "description",
  "riskLevel",
  "requiredTools",
  "required-tools",
  "successCriteria",
  "success-criteria",
  "estimatedDuration",
  "estimated-duration",
  "phases",
  "dependsOn",
  "depends-on",
  "dependencies",
  "metadata",
]);

export function parseWorkflowMarkdown(
  content: string,
  options?: WorkflowValidationOptions
): WorkflowParseOutcome {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (err) {
    return { success: false, error: `Invalid YAML frontmatter: ${String(err)}` };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { success: false, error: "Missing YAML frontmatter in WORKFLOW.md" };
  }

  for (const key of Object.keys(parsed.data)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return { success: false, error: `Unsupported frontmatter field: ${key}` };
    }
  }

  const normalized = normalizeFrontmatter(parsed.data);
  const validated = validateFrontmatter(normalized, options);
  if (!validated.success) {
    return validated;
  }

  return { success: true, template: validated.template };
}

export function normalizeWorkflowId(value: string): string {
  return value.normalize("NFKC");
}

export function validateWorkflowId(
  value: string,
  options?: WorkflowValidationOptions
): string | null {
  const maxLength = options?.idMaxLength ?? DEFAULT_ID_MAX_LENGTH;
  const normalized = normalizeWorkflowId(value);
  if (normalized.length === 0 || normalized.length > maxLength) {
    return `Workflow id must be between 1 and ${maxLength} characters`;
  }
  if (normalized !== normalized.toLowerCase()) {
    return "Workflow id must be lowercase";
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) {
    return "Workflow id must use lowercase letters, numbers, and hyphens";
  }
  if (normalized.includes("--")) {
    return "Workflow id cannot contain consecutive hyphens";
  }
  return null;
}

type ValidationResult<T> = { success: true; value: T } | { success: false; error: string };

function normalizeFrontmatter(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  if (normalized["required-tools"] !== undefined) {
    normalized.requiredTools = normalized["required-tools"];
    delete normalized["required-tools"];
  }
  if (normalized["success-criteria"] !== undefined) {
    normalized.successCriteria = normalized["success-criteria"];
    delete normalized["success-criteria"];
  }
  if (normalized["estimated-duration"] !== undefined) {
    normalized.estimatedDuration = normalized["estimated-duration"];
    delete normalized["estimated-duration"];
  }
  if (normalized["depends-on"] !== undefined) {
    normalized.dependsOn = normalized["depends-on"];
    delete normalized["depends-on"];
  }
  if (normalized.dependencies !== undefined) {
    normalized.dependsOn = normalized.dependencies;
    delete normalized.dependencies;
  }
  return normalized;
}

function validateFrontmatter(
  data: Record<string, unknown>,
  options?: WorkflowValidationOptions
): { success: true; template: WorkflowTemplate } | { success: false; error: string } {
  const header = resolveTemplateHeader(data, options);
  if (!header.success) {
    return header;
  }

  const phasesResult = resolvePhases(data.phases, options);
  if (!phasesResult.success) {
    return phasesResult;
  }

  const extras = resolveTemplateExtras(data);
  if (!extras.success) {
    return extras;
  }

  const template: WorkflowTemplate = {
    id: header.value.id,
    name: header.value.name,
    description: header.value.description,
    riskLevel: header.value.riskLevel,
    requiredTools: extras.value.requiredTools,
    successCriteria: extras.value.successCriteria,
    phases: phasesResult.value,
  };

  if (extras.value.estimatedDuration !== undefined) {
    template.estimatedDuration = extras.value.estimatedDuration;
  }
  if (extras.value.dependsOn && extras.value.dependsOn.length > 0) {
    template.dependsOn = extras.value.dependsOn;
  }
  if (extras.value.metadata) {
    template.metadata = extras.value.metadata;
  }

  return { success: true, template };
}

type TemplateHeader = {
  id: string;
  name: string;
  description: string;
  riskLevel: WorkflowFrontmatter["riskLevel"];
};

type TemplateExtras = {
  requiredTools: string[];
  successCriteria: string[];
  dependsOn?: string[];
  estimatedDuration?: number;
  metadata?: Record<string, string>;
};

function resolveTemplateHeader(
  data: Record<string, unknown>,
  options?: WorkflowValidationOptions
): ValidationResult<TemplateHeader> {
  const idResult = requireString(data, "id");
  if (!idResult.success) {
    return idResult;
  }
  const nameResult = requireString(data, "name");
  if (!nameResult.success) {
    return nameResult;
  }
  const descriptionResult = requireString(data, "description");
  if (!descriptionResult.success) {
    return descriptionResult;
  }

  const idError = validateWorkflowId(idResult.value, options);
  if (idError) {
    return { success: false, error: idError };
  }

  const riskResult = resolveRiskLevel(data.riskLevel);
  if (!riskResult.success) {
    return riskResult;
  }

  return {
    success: true,
    value: {
      id: normalizeWorkflowId(idResult.value),
      name: nameResult.value,
      description: descriptionResult.value,
      riskLevel: riskResult.value,
    },
  };
}

function resolveTemplateExtras(data: Record<string, unknown>): ValidationResult<TemplateExtras> {
  const requiredTools = resolveStringArray(data.requiredTools, "requiredTools");
  if (!requiredTools.success) {
    return requiredTools;
  }
  const successCriteria = resolveStringArray(data.successCriteria, "successCriteria");
  if (!successCriteria.success) {
    return successCriteria;
  }
  const dependsOn = resolveStringArray(data.dependsOn, "dependsOn");
  if (!dependsOn.success) {
    return dependsOn;
  }
  const estimatedDuration = resolveOptionalNumber(data.estimatedDuration);
  if (!estimatedDuration.success) {
    return estimatedDuration;
  }
  const metadata = resolveMetadata(data.metadata);
  if (!metadata.success) {
    return metadata;
  }

  return {
    success: true,
    value: {
      requiredTools: requiredTools.value ?? [],
      successCriteria: successCriteria.value ?? [],
      dependsOn: dependsOn.value ?? undefined,
      estimatedDuration: estimatedDuration.value,
      metadata: metadata.value,
    },
  };
}

function requireString(
  data: Record<string, unknown>,
  key: "id" | "name" | "description"
): ValidationResult<string> {
  const value = typeof data[key] === "string" ? data[key].trim() : "";
  if (!value) {
    return { success: false, error: `Workflow frontmatter missing required field: ${key}` };
  }
  return { success: true, value };
}

function resolveRiskLevel(value: unknown): ValidationResult<WorkflowFrontmatter["riskLevel"]> {
  if (typeof value !== "string") {
    return { success: false, error: "Workflow riskLevel must be provided" };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return { success: true, value: normalized };
  }
  return { success: false, error: "Workflow riskLevel must be low, medium, or high" };
}

function resolvePhases(
  value: unknown,
  options?: WorkflowValidationOptions
): ValidationResult<WorkflowPhase[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { success: false, error: "Workflow phases must be a non-empty list" };
  }

  const phases: WorkflowPhase[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parsePhaseEntry(value[index], index, options);
    if (!parsed.success) {
      return parsed;
    }
    if (seen.has(parsed.value.id)) {
      return { success: false, error: `Duplicate phase id: ${parsed.value.id}` };
    }
    seen.add(parsed.value.id);
    phases.push(parsed.value);
  }

  phases.sort((a, b) => a.order - b.order);
  return { success: true, value: phases };
}

function parsePhaseEntry(
  raw: unknown,
  index: number,
  options?: WorkflowValidationOptions
): ValidationResult<WorkflowPhase> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { success: false, error: "Workflow phase entries must be objects" };
  }
  const phase = raw as Record<string, unknown>;
  const nameResult = requirePhaseString(phase, "name");
  if (!nameResult.success) {
    return nameResult;
  }
  const descriptionResult = requirePhaseString(phase, "description");
  if (!descriptionResult.success) {
    return descriptionResult;
  }

  const idResult = resolvePhaseId(phase.id, nameResult.value, index, options);
  if (!idResult.success) {
    return idResult;
  }

  const order = resolveOptionalNumber(phase.order);
  if (!order.success) {
    return order;
  }

  const tools = resolveStringArray(phase.tools, "tools");
  if (!tools.success) {
    return tools;
  }
  const outputs = resolveStringArray(phase.outputs, "outputs");
  if (!outputs.success) {
    return outputs;
  }
  const validation = resolveOptionalString(phase.validation);
  if (!validation.success) {
    return validation;
  }

  const parallelizable = typeof phase.parallelizable === "boolean" ? phase.parallelizable : false;

  return {
    success: true,
    value: {
      id: idResult.value,
      order: order.value ?? index + 1,
      name: nameResult.value,
      description: descriptionResult.value,
      tools: tools.value ?? [],
      outputs: outputs.value ?? [],
      validation: validation.value,
      parallelizable,
    },
  };
}

function resolvePhaseId(
  value: unknown,
  name: string,
  index: number,
  options?: WorkflowValidationOptions
): ValidationResult<string> {
  const fallbackId = slugifyId(name, index);
  const idRaw = typeof value === "string" ? value.trim() : fallbackId;
  const idError = validateWorkflowId(idRaw, options);
  if (idError) {
    return { success: false, error: `Phase id invalid: ${idError}` };
  }
  return { success: true, value: normalizeWorkflowId(idRaw) };
}

function requirePhaseString(
  phase: Record<string, unknown>,
  key: "name" | "description"
): ValidationResult<string> {
  const value = typeof phase[key] === "string" ? phase[key].trim() : "";
  if (!value) {
    return { success: false, error: `Workflow phase missing required field: ${key}` };
  }
  return { success: true, value };
}

function resolveStringArray(
  value: unknown,
  fieldName: string
): ValidationResult<string[] | undefined> {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }
  if (typeof value === "string") {
    return { success: true, value: [value] };
  }
  if (!Array.isArray(value)) {
    return { success: false, error: `Workflow ${fieldName} must be a string or list of strings` };
  }
  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { success: false, error: `Workflow ${fieldName} must contain strings only` };
    }
    if (entry.trim()) {
      items.push(entry.trim());
    }
  }
  return { success: true, value: items };
}

function resolveOptionalNumber(value: unknown): ValidationResult<number | undefined> {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { success: true, value };
  }
  return { success: false, error: "Workflow estimatedDuration must be a number" };
}

function resolveOptionalString(value: unknown): ValidationResult<string | undefined> {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { success: true, value: trimmed.length > 0 ? trimmed : undefined };
  }
  return { success: false, error: "Workflow validation must be a string" };
}

function resolveMetadata(value: unknown): ValidationResult<Record<string, string> | undefined> {
  if (value === undefined || value === null) {
    return { success: true, value: undefined };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { success: false, error: "Workflow metadata must be a mapping of key/value strings" };
  }
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    metadata[key] = typeof entry === "string" ? entry : String(entry);
  }
  return { success: true, value: metadata };
}

function slugifyId(value: string, index: number): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (normalized) {
    return normalized;
  }
  return `phase-${index + 1}`;
}
