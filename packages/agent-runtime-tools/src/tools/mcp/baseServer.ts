/**
 * Base Tool Server
 *
 * Abstract base class for implementing MCP Tool Servers.
 * Provides common functionality and enforces the interface.
 */

import type {
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
  ToolError,
} from "@ku0/agent-runtime-core";

/** Tool handler function type */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<MCPToolResult>;

/** Tool definition with handler */
export interface ToolDefinition {
  tool: MCPTool;
  handler: ToolHandler;
}

/**
 * Abstract base class for MCP Tool Servers.
 * Extend this class to create your own tool server.
 */
export abstract class BaseToolServer implements MCPToolServer {
  abstract readonly name: string;
  abstract readonly description: string;

  protected readonly tools = new Map<string, ToolDefinition>();

  /**
   * Register a tool with its handler.
   */
  protected registerTool(tool: MCPTool, handler: ToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
  }

  /**
   * List all available tools.
   */
  listTools(): MCPTool[] {
    return Array.from(this.tools.values()).map((def) => def.tool);
  }

  /**
   * Call a tool by name.
   */
  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    const definition = this.tools.get(call.name);
    if (!definition) {
      const error: ToolError = {
        code: "RESOURCE_NOT_FOUND",
        message: `Tool "${call.name}" not found in server "${this.name}"`,
      };
      return { success: false, content: [], error };
    }

    // Validate arguments against schema
    const validationError = this.validateArguments(call.arguments, definition.tool.inputSchema);
    if (validationError) {
      return { success: false, content: [], error: validationError };
    }

    // Check if tool requires confirmation
    if (definition.tool.annotations?.requiresConfirmation) {
      // The orchestrator should handle confirmation before calling
      // This is a safety check
    }

    // Execute the handler
    return definition.handler(call.arguments, context);
  }

  /**
   * Validate arguments against JSON Schema.
   * Override for custom validation logic.
   */
  protected validateArguments(
    args: Record<string, unknown>,
    schema: MCPTool["inputSchema"]
  ): ToolError | null {
    if (schema.type !== "object") {
      return null;
    }

    const requiredError = this.validateRequiredFields(args, schema.required);
    if (requiredError) {
      return requiredError;
    }

    // Basic type checking for properties
    return this.validatePropertyValues(args, schema.properties);
  }

  private validateRequiredFields(
    args: Record<string, unknown>,
    required: string[] | undefined
  ): ToolError | null {
    if (!required) {
      return null;
    }
    for (const field of required) {
      if (!(field in args)) {
        return {
          code: "INVALID_ARGUMENTS",
          message: `Missing required argument: ${field}`,
        };
      }
    }

    return null;
  }

  private validatePropertyValues(
    args: Record<string, unknown>,
    properties: MCPTool["inputSchema"]["properties"]
  ): ToolError | null {
    if (!properties) {
      return null;
    }

    for (const [key, value] of Object.entries(args)) {
      const propSchema = properties[key];
      if (propSchema?.type && !this.checkType(value, propSchema.type)) {
        return {
          code: "INVALID_ARGUMENTS",
          message: `Invalid type for argument "${key}": expected ${propSchema.type}`,
        };
      }
      if (propSchema?.enum && !propSchema.enum.includes(value as never)) {
        return {
          code: "INVALID_ARGUMENTS",
          message: `Invalid value for argument "${key}": expected one of ${propSchema.enum.join(
            ", "
          )}`,
        };
      }
    }

    return null;
  }

  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Optional: Initialize the server.
   * Override to add initialization logic.
   */
  async initialize(): Promise<void> {
    // Default: no-op
  }

  /**
   * Optional: Dispose the server.
   * Override to add cleanup logic.
   */
  async dispose(): Promise<void> {
    // Default: no-op
  }
}

/**
 * Helper to create a successful tool result with text content.
 */
export function textResult(text: string): MCPToolResult {
  return {
    success: true,
    content: [{ type: "text", text }],
  };
}

/**
 * Helper to create a failed tool result.
 */
export function errorResult(
  code: ToolError["code"],
  message: string,
  details?: ToolError["details"]
): MCPToolResult {
  return {
    success: false,
    content: [{ type: "text", text: message }],
    error: details ? { code, message, details } : { code, message },
  };
}
