/**
 * Tool Registry View
 *
 * Provides an isolated, allowlist-filtered view of a tool registry.
 */

import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  SecurityPolicy,
  ToolContext,
  ToolError,
  ToolRegistryScope,
} from "@ku0/agent-runtime-core";
import type {
  IToolRegistry,
  RegistryEvent,
  RegistryEventHandler,
  RegistryEventType,
} from "./registry";

export interface ToolRegistryViewOptions {
  allowedTools: ToolRegistryScope["allowedTools"];
}

class ToolServerView implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  constructor(
    private readonly server: MCPToolServer,
    private readonly serverName: string,
    private readonly isToolAllowed: (toolName: string, serverName: string) => boolean
  ) {
    this.name = server.name;
    this.description = server.description;
  }

  listTools(): MCPTool[] {
    return this.server.listTools().filter((tool) => this.isToolAllowed(tool.name, this.serverName));
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    if (!this.isToolAllowed(call.name, this.serverName)) {
      return createPermissionDeniedResult(`${this.serverName}:${call.name}`);
    }
    return this.server.callTool(call, context);
  }

  async initialize(): Promise<void> {
    await this.server.initialize?.();
  }

  async dispose(): Promise<void> {
    await this.server.dispose?.();
  }
}

export class ToolRegistryView implements IToolRegistry {
  private readonly allowedTools: string[];
  private readonly eventHandlers = new Map<RegistryEventType, Set<RegistryEventHandler>>();

  constructor(
    private readonly baseRegistry: IToolRegistry,
    options: ToolRegistryViewOptions
  ) {
    this.allowedTools = normalizeAllowedTools(options.allowedTools);
  }

  async register(_server: MCPToolServer): Promise<void> {
    throw new Error("Tool registry views are read-only.");
  }

  async unregister(_serverName: string): Promise<void> {
    throw new Error("Tool registry views are read-only.");
  }

  listTools(): MCPTool[] {
    return this.baseRegistry
      .listTools()
      .filter((tool) => this.isToolAllowed(tool.name, this.resolveServerName(tool.name)));
  }

  hasTool(name: string): boolean {
    if (!this.baseRegistry.hasTool(name)) {
      return false;
    }
    return this.isToolAllowed(name, this.resolveServerName(name));
  }

  resolveToolServer(toolName: string): string | undefined {
    const resolved = this.resolveServerName(toolName);
    if (!resolved) {
      return undefined;
    }
    return this.isToolAllowed(toolName, resolved) ? resolved : undefined;
  }

  getServer(name: string): MCPToolServer | undefined {
    const server = this.baseRegistry.getServer(name);
    if (!server) {
      return undefined;
    }
    const hasAllowedTools = server.listTools().some((tool) => this.isToolAllowed(tool.name, name));
    if (!hasAllowedTools) {
      return undefined;
    }
    return new ToolServerView(server, name, this.isToolAllowed.bind(this));
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    const startTime = Date.now();
    const callId = generateCallId();
    const serverName = this.resolveServerName(call.name);

    if (!this.isToolAllowed(call.name, serverName)) {
      const error: ToolError = {
        code: "PERMISSION_DENIED",
        message: "Tool not allowed for this agent type",
      };
      this.emit("tool:error", { toolName: call.name, error, callId });
      return {
        success: false,
        content: [{ type: "text", text: "Tool not allowed for this agent" }],
        error,
      };
    }

    this.emit("tool:called", { toolName: call.name, arguments: call.arguments, callId });

    try {
      const result = await this.baseRegistry.callTool(call, context);
      const durationMs = Date.now() - startTime;
      this.emit("tool:completed", {
        toolName: call.name,
        result,
        durationMs,
        callId,
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error: ToolError = {
        code: "EXECUTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof Error ? err.stack : undefined,
      };
      this.emit("tool:error", { toolName: call.name, error, durationMs, callId });
      return buildExecutionErrorResult(call.name, context.security, durationMs, error);
    }
  }

  on(eventType: RegistryEventType, handler: RegistryEventHandler): () => void {
    let handlers = this.eventHandlers.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(eventType, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
    };
  }

  private emit(type: RegistryEventType, data: unknown): void {
    const event: RegistryEvent = {
      type,
      timestamp: Date.now(),
      data,
    };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Ignore handler errors to keep registry view stable.
        }
      }
    }
  }

  private resolveServerName(toolName: string): string | undefined {
    return this.baseRegistry.resolveToolServer?.(toolName) ?? parseToolName(toolName).server;
  }

  private isToolAllowed(toolName: string, serverName?: string): boolean {
    if (isCompletionToolName(toolName)) {
      return true;
    }
    if (this.allowedTools.length === 0) {
      return false;
    }
    const candidates = resolveToolCandidates(toolName, serverName);
    for (const pattern of this.allowedTools) {
      for (const candidate of candidates) {
        if (matchesToolPattern(candidate, pattern)) {
          return true;
        }
      }
    }
    return false;
  }
}

export function createToolRegistryView(
  baseRegistry: IToolRegistry,
  options: ToolRegistryViewOptions
): ToolRegistryView {
  return new ToolRegistryView(baseRegistry, options);
}

function normalizeAllowedTools(allowedTools: string[]): string[] {
  return allowedTools.map((tool) => tool.trim()).filter(Boolean);
}

function parseToolName(name: string): { server?: string; operation: string } {
  if (!name.includes(":")) {
    return { operation: name };
  }
  const [server, operation] = name.split(":");
  return { server, operation: operation ?? "" };
}

function resolveToolCandidates(toolName: string, serverName?: string): string[] {
  const candidates = [toolName];
  if (!toolName.includes(":") && serverName) {
    candidates.push(`${serverName}:${toolName}`);
  }
  return candidates;
}

function matchesToolPattern(toolName: string, pattern: string): boolean {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "*") {
    return true;
  }
  if (trimmed === toolName) {
    return true;
  }
  if (trimmed.endsWith(":*")) {
    const prefix = trimmed.slice(0, -2);
    return toolName.startsWith(prefix);
  }
  return false;
}

function isCompletionToolName(toolName: string): boolean {
  return toolName === "complete_task" || toolName.endsWith(":complete_task");
}

function createPermissionDeniedResult(_toolName: string): MCPToolResult {
  return {
    success: false,
    content: [{ type: "text", text: "Tool not allowed for this agent" }],
    error: { code: "PERMISSION_DENIED", message: "Tool not allowed for this agent type" },
  };
}

function buildExecutionErrorResult(
  toolName: string,
  security: SecurityPolicy,
  durationMs: number,
  error: ToolError
): MCPToolResult {
  return {
    success: false,
    content: [{ type: "text", text: error.message }],
    error,
    meta: {
      durationMs,
      toolName,
      sandboxed: security.sandbox.type !== "none",
    },
  };
}

function generateCallId(): string {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
