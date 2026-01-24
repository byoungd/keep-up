import path from "node:path";

import type {
  ArtifactEnvelope,
  JSONSchema,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
  ToolError,
  ToolErrorCode,
} from "@ku0/agent-runtime-core";
import type {
  AgentToolkitArtifact,
  AgentToolkitRegistryBinding,
  ToolkitToolDefinition,
  ToolkitToolError,
  ToolkitToolResult,
} from "@ku0/agent-toolkit-rs";

export type ArtifactEmitter = {
  emit: (
    artifact: ArtifactEnvelope,
    context?: {
      correlationId?: string;
      source?: string;
      idempotencyKey?: string;
    }
  ) => {
    stored: boolean;
    valid: boolean;
    errors?: string[];
    artifactNodeId?: string;
  };
};

export interface AgentToolkitToolServerOptions {
  artifactEmitter?: ArtifactEmitter;
}

export class AgentToolkitToolServer implements MCPToolServer {
  readonly name = "toolkit";
  readonly description =
    "Rust agent toolkit library (file, note, convert, pptx, excel, media, web deploy).";

  private readonly registry: AgentToolkitRegistryBinding;
  private readonly tools: MCPTool[];
  private readonly artifactEmitter?: ArtifactEmitter;

  constructor(registry: AgentToolkitRegistryBinding, options: AgentToolkitToolServerOptions = {}) {
    this.registry = registry;
    this.artifactEmitter = options.artifactEmitter;
    this.registry.registerAllTools();
    this.tools = this.registry.getToolList().map((tool) => normalizeToolkitTool(tool));
  }

  listTools(): MCPTool[] {
    return this.tools;
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    const payload = {
      ...call.arguments,
      workspaceRoot: resolveWorkspaceRoot(context),
    };

    let result: ToolkitToolResult;
    try {
      result = this.registry.invoke(call.name, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [{ type: "text", text: message }],
        error: { code: "EXECUTION_FAILED", message },
      };
    }

    if (this.artifactEmitter && result.artifacts?.length) {
      emitArtifacts(this.artifactEmitter, result.artifacts, call.name, context);
    }

    // Strip toolkit-specific fields before returning to runtime.
    return toMcpToolResult(result);
  }

  async dispose(): Promise<void> {
    this.registry.reset();
  }
}

const TOOL_ERROR_CODES: ReadonlySet<ToolErrorCode> = new Set([
  "EXECUTION_FAILED",
  "TIMEOUT",
  "PERMISSION_DENIED",
  "PERMISSION_ESCALATION_REQUIRED",
  "INVALID_ARGUMENTS",
  "SANDBOX_VIOLATION",
  "RESOURCE_NOT_FOUND",
  "RATE_LIMITED",
  "CONFLICT",
  "DRYRUN_REJECTED",
  "RETRY_EXHAUSTED",
  "VALIDATION_ERROR",
  "PROMPT_INJECTION_BLOCKED",
  "DUPLICATE_FAILED_ACTION",
]);

function normalizeToolkitTool(tool: ToolkitToolDefinition): MCPTool {
  return {
    name: tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.inputSchema as unknown as JSONSchema,
    annotations: tool.annotations as MCPTool["annotations"],
  };
}

function toMcpToolResult(result: ToolkitToolResult): MCPToolResult {
  return {
    success: result.success,
    content: result.content,
    error: normalizeToolkitError(result.error),
  };
}

function normalizeToolkitError(error?: ToolkitToolError): ToolError | undefined {
  if (!error) {
    return undefined;
  }
  return {
    code: TOOL_ERROR_CODES.has(error.code as ToolErrorCode)
      ? (error.code as ToolErrorCode)
      : "EXECUTION_FAILED",
    message: error.message,
    details: error.details,
  };
}

function emitArtifacts(
  emitter: ArtifactEmitter,
  artifacts: AgentToolkitArtifact[],
  toolName: string,
  context: ToolContext
): void {
  const source = `tool:${toolName}`;
  for (const artifact of artifacts) {
    const envelope = buildReportCardArtifact(artifact, toolName, context);
    emitter.emit(envelope, {
      correlationId: context.correlationId,
      source,
      idempotencyKey: envelope.id,
    });
  }
}

function buildReportCardArtifact(
  artifact: AgentToolkitArtifact,
  toolName: string,
  context: ToolContext
): ArtifactEnvelope {
  const fileName = path.basename(artifact.path);
  const title = `Output: ${fileName}`;
  const summary = `Generated ${artifact.path} (${artifact.size} bytes, sha256=${artifact.checksum}).`;

  return {
    id: `file_${artifact.checksum}`,
    type: "ReportCard",
    schemaVersion: "1.0.0",
    title,
    payload: {
      summary,
      sections: [
        {
          heading: "Details",
          content: `Path: ${artifact.path}\nSize: ${artifact.size}\nChecksum: ${artifact.checksum}\nTool: ${toolName}`,
        },
      ],
      path: artifact.path,
      size: artifact.size,
      checksum: artifact.checksum,
      mimeType: artifact.mimeType,
    },
    taskNodeId: context.taskNodeId ?? "tool-output",
    createdAt: new Date().toISOString(),
    renderHints: {
      kind: "file",
    },
  };
}

function resolveWorkspaceRoot(context: ToolContext): string {
  return context.security.sandbox.workingDirectory ?? process.cwd();
}
