/**
 * MCP SDK Adapter
 *
 * Maps between agent-runtime MCP tool types and the official MCP SDK types.
 */

import type {
  CallToolResult as SdkCallToolResult,
  Tool as SdkTool,
  ToolAnnotations as SdkToolAnnotations,
} from "@modelcontextprotocol/sdk/types";
import type { JSONSchema, MCPTool, MCPToolResult, ToolContent } from "../../types";

export interface ToolScopeConfig {
  defaultScopes?: string[];
  toolScopes?: Record<string, string[]>;
}

const CATEGORY_VALUES = new Set(["core", "knowledge", "external", "communication", "control"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

function extractScopes(meta?: Record<string, unknown>): string[] | undefined {
  if (!meta) {
    return undefined;
  }

  const candidates: unknown[] = [
    meta.requiredScopes,
    meta.scopes,
    isRecord(meta.oauth) ? (meta.oauth as Record<string, unknown>).scopes : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) {
      return candidate as string[];
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

export function toSdkTool(tool: MCPTool): SdkTool {
  const inputSchema = normalizeInputSchema(tool.inputSchema);
  const meta: Record<string, unknown> = { ...(tool.metadata ?? {}) };

  if (tool.annotations?.category) {
    meta.category = tool.annotations.category;
  }
  if (tool.annotations?.requiredScopes) {
    meta.oauth = {
      ...(isRecord(meta.oauth) ? meta.oauth : {}),
      scopes: tool.annotations.requiredScopes,
    };
  }
  if (tool.annotations?.estimatedDuration) {
    meta.estimatedDuration = tool.annotations.estimatedDuration;
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchema as SdkTool["inputSchema"],
    annotations: toSdkAnnotations(tool.annotations),
    _meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

export function fromSdkTool(tool: SdkTool, scopeConfig?: ToolScopeConfig): MCPTool {
  const meta = tool._meta ? { ...(tool._meta as Record<string, unknown>) } : undefined;
  const annotations = applyScopeOverrides(
    fromSdkAnnotations(tool.annotations, meta),
    scopeConfig,
    tool.name
  );

  if (annotations && !annotations.requiredScopes) {
    const scopes = extractScopes(meta);
    if (scopes) {
      annotations.requiredScopes = scopes;
    }
  }

  return {
    name: tool.name,
    description: tool.description ?? "MCP tool",
    inputSchema: tool.inputSchema as unknown as JSONSchema,
    annotations,
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
