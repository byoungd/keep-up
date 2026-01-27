/**
 * MCP SDK Adapter
 *
 * Maps between agent-runtime MCP tool types and the official MCP SDK types.
 */

import type {
  CoworkPolicyActionLike,
  JSONSchema,
  MCPTool,
  MCPToolResult,
  McpUiToolMeta,
  McpUiToolVisibility,
  ToolContent,
} from "@ku0/agent-runtime-core";
import { COWORK_POLICY_ACTIONS } from "@ku0/agent-runtime-core";
import type {
  CallToolResult as SdkCallToolResult,
  Tool as SdkTool,
  ToolAnnotations as SdkToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

export interface ToolScopeConfig {
  defaultScopes?: string[];
  toolScopes?: Record<string, string[]>;
}

const CATEGORY_VALUES = new Set(["core", "knowledge", "external", "communication", "control"]);
const SCHEMA_TYPES = new Set(["object", "string", "number", "boolean", "array"]);
const COWORK_POLICY_ACTION_SET = new Set<string>(COWORK_POLICY_ACTIONS);
const UI_VISIBILITY_VALUES = new Set<McpUiToolVisibility>(["always", "contextual", "hidden"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoworkPolicyActionLike(value: string): value is CoworkPolicyActionLike {
  return COWORK_POLICY_ACTION_SET.has(value);
}

function parseUiVisibility(value: unknown): McpUiToolVisibility | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (!UI_VISIBILITY_VALUES.has(value as McpUiToolVisibility)) {
    return undefined;
  }
  return value as McpUiToolVisibility;
}

function parseUiMeta(meta?: Record<string, unknown>): McpUiToolMeta | undefined {
  if (!meta) {
    return undefined;
  }

  const ui = meta.ui;
  if (!isRecord(ui)) {
    const directUri = meta["ui/resourceUri"];
    if (typeof directUri === "string" && directUri.trim().length > 0) {
      return { resourceUri: directUri };
    }
    return undefined;
  }

  const resourceUri = ui.resourceUri;
  if (typeof resourceUri !== "string" || resourceUri.trim().length === 0) {
    const directUri = meta["ui/resourceUri"];
    if (typeof directUri === "string" && directUri.trim().length > 0) {
      return { resourceUri: directUri };
    }
    return undefined;
  }

  const mapped: McpUiToolMeta = {
    resourceUri,
  };

  if (typeof ui.label === "string" && ui.label.trim().length > 0) {
    mapped.label = ui.label;
  }
  if (typeof ui.icon === "string" && ui.icon.trim().length > 0) {
    mapped.icon = ui.icon;
  }
  const visibility = parseUiVisibility(ui.visibility);
  if (visibility) {
    mapped.visibility = visibility;
  }

  return mapped;
}

function toSdkAnnotations(annotations?: MCPTool["annotations"]): SdkToolAnnotations | undefined {
  if (!annotations) {
    return undefined;
  }

  return {
    title: annotations.category ? `${annotations.category} tool` : undefined,
    readOnlyHint: annotations.readOnly,
    destructiveHint: annotations.requiresConfirmation,
    idempotentHint: annotations.readOnly,
    openWorldHint: annotations.category === "external",
  };
}

function parseCategory(
  value: unknown
): NonNullable<MCPTool["annotations"]>["category"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (!CATEGORY_VALUES.has(value)) {
    return undefined;
  }
  return value as NonNullable<MCPTool["annotations"]>["category"];
}

function fromSdkAnnotations(
  annotations?: SdkToolAnnotations,
  meta?: Record<string, unknown>
): MCPTool["annotations"] | undefined {
  const mapped: MCPTool["annotations"] = {};

  if (annotations?.readOnlyHint !== undefined) {
    mapped.readOnly = annotations.readOnlyHint;
  }
  if (annotations?.destructiveHint !== undefined) {
    mapped.requiresConfirmation = annotations.destructiveHint;
  }

  const category = parseCategory(meta?.category);
  if (category) {
    mapped.category = category;
  }

  const policyAction = meta?.policyAction;
  if (typeof policyAction === "string" && isCoworkPolicyActionLike(policyAction)) {
    mapped.policyAction = policyAction;
  }

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function extractScopes(meta?: Record<string, unknown>): string[] | undefined {
  if (!meta) {
    return undefined;
  }

  const normalizeScopes = (scopes: string[]): string[] | undefined => {
    const normalized = scopes.map((scope) => scope.trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  };

  const candidates: unknown[] = [
    meta.requiredScopes,
    meta.scopes,
    isRecord(meta.oauth) ? (meta.oauth as Record<string, unknown>).scopes : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
      const normalized = normalizeScopes(candidate as string[]);
      if (normalized) {
        return normalized;
      }
    }
    if (typeof candidate === "string") {
      const normalized = normalizeScopes(candidate.split(/\s+/));
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

function applyScopeOverrides(
  annotations: MCPTool["annotations"] | undefined,
  scopeConfig?: ToolScopeConfig,
  toolName?: string
): MCPTool["annotations"] | undefined {
  if (!scopeConfig?.defaultScopes && !scopeConfig?.toolScopes) {
    return annotations;
  }

  const override =
    (toolName && scopeConfig.toolScopes ? scopeConfig.toolScopes[toolName] : undefined) ??
    scopeConfig.defaultScopes;

  if (!override || override.length === 0) {
    return annotations;
  }

  return {
    ...annotations,
    requiredScopes: override,
  };
}

function normalizeInputSchema(schema: JSONSchema): JSONSchema {
  if (schema.type === "object") {
    return schema;
  }

  return {
    type: "object",
    properties: {},
    required: [],
    description: schema.description,
  };
}

function normalizeSdkInputSchema(schema: SdkTool["inputSchema"] | undefined): JSONSchema {
  if (schema && isRecord(schema)) {
    const type = (schema as { type?: unknown }).type;
    if (typeof type === "string" && SCHEMA_TYPES.has(type)) {
      return schema as JSONSchema;
    }
  }

  return {
    type: "object",
    properties: {},
    required: [],
  };
}

function applyAnnotationMeta(
  meta: Record<string, unknown>,
  annotations: MCPTool["annotations"] | undefined
): void {
  if (!annotations) {
    return;
  }
  if (annotations.category) {
    meta.category = annotations.category;
  }
  if (annotations.requiredScopes) {
    meta.oauth = {
      ...(isRecord(meta.oauth) ? meta.oauth : {}),
      scopes: annotations.requiredScopes,
    };
  }
  if (annotations.estimatedDuration) {
    meta.estimatedDuration = annotations.estimatedDuration;
  }
  if (annotations.policyAction) {
    meta.policyAction = annotations.policyAction;
  }
}

function applyUiMeta(meta: Record<string, unknown>, ui?: McpUiToolMeta): void {
  if (!ui) {
    return;
  }
  const uiMeta = isRecord(meta.ui) ? { ...(meta.ui as Record<string, unknown>) } : {};
  uiMeta.resourceUri = ui.resourceUri;
  if (ui.label) {
    uiMeta.label = ui.label;
  }
  if (ui.icon) {
    uiMeta.icon = ui.icon;
  }
  if (ui.visibility) {
    uiMeta.visibility = ui.visibility;
  }
  meta.ui = uiMeta;
  if (meta["ui/resourceUri"] === undefined) {
    meta["ui/resourceUri"] = ui.resourceUri;
  }
}

function buildSdkMeta(tool: MCPTool): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = { ...(tool.metadata ?? {}) };
  applyAnnotationMeta(meta, tool.annotations);
  applyUiMeta(meta, tool.ui);
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function normalizeSdkTool(tool: SdkTool): SdkTool | null {
  if (!tool || typeof tool.name !== "string" || tool.name.trim().length === 0) {
    return null;
  }

  return {
    ...tool,
    description: tool.description ?? "MCP tool",
    inputSchema: normalizeSdkInputSchema(tool.inputSchema) as SdkTool["inputSchema"],
  };
}

export function toSdkTool(tool: MCPTool): SdkTool {
  const inputSchema = normalizeInputSchema(tool.inputSchema);
  const meta = buildSdkMeta(tool);

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchema as SdkTool["inputSchema"],
    annotations: toSdkAnnotations(tool.annotations),
    _meta: meta,
  };
}

export function fromSdkTool(tool: SdkTool, scopeConfig?: ToolScopeConfig): MCPTool {
  const meta = isRecord(tool._meta) ? { ...(tool._meta as Record<string, unknown>) } : undefined;
  let annotations = applyScopeOverrides(
    fromSdkAnnotations(tool.annotations, meta),
    scopeConfig,
    tool.name
  );

  const scopes = extractScopes(meta);
  if (scopes && (!annotations || !annotations.requiredScopes)) {
    annotations = {
      ...(annotations ?? {}),
      requiredScopes: scopes,
    };
  }

  const ui = parseUiMeta(meta);

  return {
    name: tool.name,
    description: tool.description ?? "MCP tool",
    inputSchema: normalizeSdkInputSchema(tool.inputSchema),
    annotations,
    ui,
    metadata: meta,
  };
}

type SdkContent = NonNullable<SdkCallToolResult["content"]>[number];

function toSdkContent(content: ToolContent): SdkContent {
  if (content.type === "resource") {
    return {
      type: "resource",
      resource: {
        uri: content.uri,
        text: "",
        mimeType: content.mimeType,
      },
    } as SdkContent;
  }

  return content as SdkContent;
}

function fromSdkContent(content: SdkContent): ToolContent {
  if (content.type === "resource") {
    const resource = content.resource;
    return {
      type: "resource",
      uri: resource.uri,
      mimeType: resource.mimeType,
    };
  }

  return content as ToolContent;
}

function extractErrorMessage(result: SdkCallToolResult): string | undefined {
  const content = result.content ?? [];
  for (const entry of content) {
    if (entry.type === "text") {
      return entry.text;
    }
  }
  return undefined;
}

export function toSdkResult(result: MCPToolResult): SdkCallToolResult {
  if (!result.success) {
    return {
      content: result.error?.message ? [{ type: "text", text: result.error.message }] : [],
      isError: true,
    };
  }

  return {
    content: result.content.map((entry) => toSdkContent(entry)),
    isError: false,
  };
}

export function fromSdkResult(result: SdkCallToolResult): MCPToolResult {
  const content = (result.content ?? []).map((entry: SdkContent) => fromSdkContent(entry));
  const isError = result.isError ?? false;

  if (!isError) {
    return {
      success: true,
      content,
    };
  }

  return {
    success: false,
    content,
    error: {
      code: "EXECUTION_FAILED",
      message: extractErrorMessage(result) ?? "Tool execution failed",
    },
  };
}
