/**
 * MCP Tool Registry
 *
 * Plugin-based tool registry with dynamic registration, hot-reload,
 * and event-driven architecture for maximum decoupling.
 */

import type { RuntimeEventBus } from "@ku0/agent-runtime-control";
import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
  ToolError,
} from "@ku0/agent-runtime-core";
import { COWORK_POLICY_ACTIONS } from "@ku0/agent-runtime-core";

// ============================================================================
// Event System for Decoupling
// ============================================================================

export type RegistryEventType =
  | "server:registered"
  | "server:unregistered"
  | "tool:called"
  | "tool:completed"
  | "tool:error";

export interface RegistryEvent {
  type: RegistryEventType;
  timestamp: number;
  data: unknown;
}

export type RegistryEventHandler = (event: RegistryEvent) => void;

// ============================================================================
// Registry Interface (for dependency injection)
// ============================================================================

/** Abstract registry interface - allows swapping implementations */
export interface IToolRegistry {
  /** Register a tool server */
  register(server: MCPToolServer): Promise<void>;
  /** Unregister a tool server */
  unregister(serverName: string): Promise<void>;
  /** List all available tools */
  listTools(): MCPTool[];
  /** Call a tool by name */
  callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult>;
  /** Get a specific server */
  getServer(name: string): MCPToolServer | undefined;
  /** Check if a tool exists */
  hasTool(name: string): boolean;
  /** Resolve the server for a tool name (if known) */
  resolveToolServer?(toolName: string): string | undefined;
  /** Subscribe to registry events */
  on(event: RegistryEventType, handler: RegistryEventHandler): () => void;
}

export interface ToolRegistryOptions {
  eventBus?: RuntimeEventBus;
  source?: string;
  /** Require qualified tool names (server:tool) to avoid collisions */
  enforceQualifiedNames?: boolean;
}

// ============================================================================
// Tool Registry Implementation
// ============================================================================

export class ToolRegistry implements IToolRegistry {
  private readonly servers = new Map<string, MCPToolServer>();
  private readonly toolIndex = new Map<string, string>(); // toolName -> serverName
  private readonly unqualifiedOwners = new Map<string, Set<string>>();
  private readonly eventHandlers = new Map<RegistryEventType, Set<RegistryEventHandler>>();
  private readonly eventBus?: RuntimeEventBus;
  private readonly source?: string;
  private readonly enforceQualifiedNames: boolean;

  constructor(options: ToolRegistryOptions = {}) {
    this.eventBus = options.eventBus;
    this.source = options.source ?? "tool-registry";
    this.enforceQualifiedNames = options.enforceQualifiedNames ?? true;
  }

  /**
   * Register a tool server.
   * Initializes the server if it has an initialize method.
   */
  async register(server: MCPToolServer): Promise<void> {
    if (this.servers.has(server.name)) {
      throw new Error(`Server "${server.name}" is already registered`);
    }

    // Initialize server if needed
    if (server.initialize) {
      await server.initialize();
    }

    // Register server
    this.servers.set(server.name, server);

    // Index all tools
    for (const tool of server.listTools()) {
      this.assertPolicyAction(server.name, tool);
      this.indexTool(server.name, tool.name);
    }

    this.emit("server:registered", {
      serverName: server.name,
      tools: this.listToolsForServer(server.name, server),
    });
  }

  /**
   * Unregister a tool server.
   * Disposes the server if it has a dispose method.
   */
  async unregister(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) {
      return;
    }

    // Remove tool index entries
    for (const tool of server.listTools()) {
      this.unindexTool(serverName, tool.name);
    }

    // Dispose server if needed
    if (server.dispose) {
      await server.dispose();
    }

    this.servers.delete(serverName);
    this.emit("server:unregistered", { serverName });
  }

  /**
   * List all available tools from all servers.
   */
  listTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const [serverName, server] of this.servers) {
      tools.push(...this.listToolsForServer(serverName, server));
    }
    return tools;
  }

  /**
   * List tools with their qualified names.
   */
  listToolsWithServer(): Array<{ server: string; tool: MCPTool }> {
    const result: Array<{ server: string; tool: MCPTool }> = [];
    for (const [serverName, server] of this.servers) {
      for (const tool of server.listTools()) {
        result.push({ server: serverName, tool: this.formatTool(serverName, tool) });
      }
    }
    return result;
  }

  /**
   * Call a tool by name.
   * Supports both simple names (if unique) and qualified names (server:tool).
   */
  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    const startTime = Date.now();
    const callId = this.generateCallId();

    // Find the server for this tool
    const serverName = this.toolIndex.get(call.name);
    if (!serverName) {
      const error: ToolError = {
        code: "RESOURCE_NOT_FOUND",
        message: `Tool "${call.name}" not found`,
      };
      this.emit("tool:error", { toolName: call.name, error, callId });
      this.emitToolFailed(call.name, callId, error.message, context.correlationId);
      return { success: false, content: [], error };
    }

    const server = this.servers.get(serverName);
    if (!server) {
      const error: ToolError = {
        code: "RESOURCE_NOT_FOUND",
        message: `Server "${serverName}" not found`,
      };
      this.emit("tool:error", { toolName: call.name, error, callId });
      this.emitToolFailed(call.name, callId, error.message, context.correlationId);
      return { success: false, content: [], error };
    }

    // Extract simple tool name if qualified
    const simpleName = call.name.includes(":") ? call.name.split(":")[1] : call.name;

    this.emit("tool:called", { toolName: call.name, arguments: call.arguments, callId });
    this.emitToolCalled(call.name, call.arguments, callId, context.correlationId);

    try {
      const result = await server.callTool(
        { name: simpleName, arguments: call.arguments },
        context
      );
      const durationMs = Date.now() - startTime;

      // Create immutable result with execution metadata (don't mutate original)
      const resultWithMeta: MCPToolResult = {
        ...result,
        meta: {
          ...result.meta,
          durationMs,
          toolName: call.name,
          sandboxed: context.security.sandbox.type !== "none",
        },
      };

      this.emit("tool:completed", {
        toolName: call.name,
        result: resultWithMeta,
        durationMs,
        callId,
      });
      this.emitToolCompleted(call.name, callId, durationMs, context.correlationId);
      return resultWithMeta;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error: ToolError = {
        code: "EXECUTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
        details: err instanceof Error ? err.stack : undefined,
      };

      this.emit("tool:error", { toolName: call.name, error, durationMs, callId });
      this.emitToolFailed(call.name, callId, error.message, context.correlationId);

      return {
        success: false,
        content: [{ type: "text", text: error.message }],
        error,
        meta: {
          durationMs,
          toolName: call.name,
          sandboxed: context.security.sandbox.type !== "none",
        },
      };
    }
  }

  /**
   * Get a specific server by name.
   */
  getServer(name: string): MCPToolServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Check if a tool exists.
   */
  hasTool(name: string): boolean {
    return this.toolIndex.has(name);
  }

  /**
   * Resolve the server name for a given tool name (qualified or unqualified).
   */
  resolveToolServer(toolName: string): string | undefined {
    return this.toolIndex.get(toolName);
  }

  /**
   * Get all registered server names.
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Subscribe to registry events.
   * Returns an unsubscribe function.
   */
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

  private formatTool(serverName: string, tool: MCPTool): MCPTool {
    if (!this.enforceQualifiedNames) {
      return tool;
    }
    return { ...tool, name: `${serverName}:${tool.name}` };
  }

  private listToolsForServer(serverName: string, server: MCPToolServer): MCPTool[] {
    return server.listTools().map((tool) => this.formatTool(serverName, tool));
  }

  private assertPolicyAction(serverName: string, tool: MCPTool): void {
    const policyAction = tool.annotations?.policyAction;
    if (!policyAction) {
      throw new Error(`Tool "${serverName}:${tool.name}" is missing annotations.policyAction`);
    }
    const isValid = COWORK_POLICY_ACTIONS.includes(policyAction);
    if (!isValid) {
      throw new Error(
        `Tool "${serverName}:${tool.name}" has invalid policyAction "${policyAction}"`
      );
    }
  }

  private indexTool(serverName: string, toolName: string): void {
    const qualifiedName = `${serverName}:${toolName}`;
    this.toolIndex.set(qualifiedName, serverName);

    if (this.enforceQualifiedNames) {
      return;
    }

    const owners = this.unqualifiedOwners.get(toolName) ?? new Set<string>();
    owners.add(serverName);
    this.unqualifiedOwners.set(toolName, owners);

    if (owners.size === 1) {
      this.toolIndex.set(toolName, serverName);
    } else {
      this.toolIndex.delete(toolName);
    }
  }

  private unindexTool(serverName: string, toolName: string): void {
    this.toolIndex.delete(`${serverName}:${toolName}`);

    if (this.enforceQualifiedNames) {
      return;
    }

    const owners = this.unqualifiedOwners.get(toolName);
    if (!owners) {
      return;
    }
    owners.delete(serverName);

    if (owners.size === 0) {
      this.unqualifiedOwners.delete(toolName);
      this.toolIndex.delete(toolName);
      return;
    }

    if (owners.size === 1) {
      const [remaining] = owners;
      this.toolIndex.set(toolName, remaining);
    } else {
      this.toolIndex.delete(toolName);
    }
  }

  /**
   * Emit an event to all subscribers.
   */
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
          // Don't let handler errors break the registry
        }
      }
    }
  }

  private emitToolCalled(
    toolName: string,
    args: Record<string, unknown>,
    callId: string,
    correlationId?: string
  ): void {
    this.eventBus?.emit(
      "tool:called",
      { toolName, args, callId },
      {
        source: this.source,
        correlationId,
        priority: "normal",
      }
    );
  }

  private emitToolCompleted(
    toolName: string,
    callId: string,
    durationMs: number,
    correlationId?: string
  ): void {
    this.eventBus?.emit(
      "tool:completed",
      { toolName, callId, durationMs },
      {
        source: this.source,
        correlationId,
        priority: "normal",
      }
    );
  }

  private emitToolFailed(
    toolName: string,
    callId: string,
    error: string,
    correlationId?: string
  ): void {
    this.eventBus?.emit(
      "tool:failed",
      { toolName, callId, error },
      {
        source: this.source,
        correlationId,
        priority: "normal",
      }
    );
  }

  private generateCallId(): string {
    return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Dispose all servers and clean up.
   */
  async dispose(): Promise<void> {
    const serverNames = Array.from(this.servers.keys());
    for (const name of serverNames) {
      await this.unregister(name);
    }
    this.eventHandlers.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new tool registry instance.
 */
export function createToolRegistry(options?: ToolRegistryOptions): ToolRegistry {
  return new ToolRegistry(options);
}
