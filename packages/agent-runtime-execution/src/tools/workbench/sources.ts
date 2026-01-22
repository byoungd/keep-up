import { spawn } from "node:child_process";
import {
  COWORK_POLICY_ACTIONS,
  type JSONSchema,
  type JSONSchemaProperty,
  type MCPTool,
  type MCPToolCall,
  type MCPToolResult,
  type MCPToolServer,
  type ToolContext,
  type ToolError,
  type ToolErrorCode,
} from "@ku0/agent-runtime-core";
import type {
  AdapterRegistry,
  ToolContext as CoordinatorToolContext,
} from "@ku0/agent-runtime-tools";
import {
  ExternalToolServer,
  type ToolCoordinator,
  ValidationError,
} from "@ku0/agent-runtime-tools";

export interface ToolWorkbenchSource {
  name: string;
  load(): Promise<MCPToolServer[]>;
}

export class StaticToolSource implements ToolWorkbenchSource {
  readonly name: string;

  constructor(
    private readonly servers: MCPToolServer[],
    name = "static"
  ) {
    this.name = name;
  }

  async load(): Promise<MCPToolServer[]> {
    return this.servers;
  }
}

export interface CommandToolServerConfig {
  name: string;
  description?: string;
  listCommand: string;
  callCommand: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export class CommandToolServer implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  private cachedTools: MCPTool[] = [];
  private readonly config: CommandToolServerConfig;

  constructor(config: CommandToolServerConfig) {
    this.config = config;
    this.name = config.name;
    this.description = config.description ?? "Command-backed tool server";
  }

  async initialize(): Promise<void> {
    await this.refreshTools();
  }

  listTools(): MCPTool[] {
    return this.cachedTools;
  }

  async callTool(call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    if (!this.cachedTools.find((tool) => tool.name === call.name)) {
      await this.refreshTools();
    }

    if (!this.cachedTools.find((tool) => tool.name === call.name)) {
      return errorResult("RESOURCE_NOT_FOUND", `Tool "${call.name}" not found`);
    }

    const command = `${this.config.callCommand} ${call.name}`.trim();
    const result = await execCommand(command, JSON.stringify(call.arguments), {
      cwd: this.config.cwd,
      env: this.config.env,
      timeoutMs: this.config.timeoutMs,
    });

    if (result.timedOut) {
      return errorResult("TIMEOUT", `Tool call timed out after ${result.timeoutMs}ms`);
    }

    if (result.exitCode !== 0) {
      return errorResult(
        "EXECUTION_FAILED",
        result.stderr || `Tool call failed with exit code ${result.exitCode}`,
        {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        }
      );
    }

    const parsed = parseJsonResult(result.stdout);
    if (parsed && isMcpToolResult(parsed)) {
      return parsed;
    }

    return {
      success: true,
      content: [{ type: "text", text: result.stdout.trim() }],
    };
  }

  private async refreshTools(): Promise<void> {
    const result = await execCommand(this.config.listCommand, undefined, {
      cwd: this.config.cwd,
      env: this.config.env,
      timeoutMs: this.config.timeoutMs,
    });

    if (result.timedOut || result.exitCode !== 0) {
      return;
    }

    const tools = parseToolList(result.stdout);
    if (!tools) {
      return;
    }
    const validTools: MCPTool[] = [];

    for (const tool of tools) {
      const validation = validateMcpTool(tool);
      if (validation.valid) {
        validTools.push(tool);
      }
    }

    this.cachedTools = validTools;
  }
}

export class CommandToolSource implements ToolWorkbenchSource {
  readonly name: string;

  constructor(private readonly config: CommandToolServerConfig) {
    this.name = config.name;
  }

  async load(): Promise<MCPToolServer[]> {
    return [new CommandToolServer(this.config)];
  }
}

export interface CoordinatorToolServerAdapterConfig {
  name?: string;
  description?: string;
  contextFactory?: (context: ToolContext) => CoordinatorToolContext;
}

export class CoordinatorToolServerAdapter implements MCPToolServer {
  readonly name: string;
  readonly description: string;

  private readonly contextFactory?: (context: ToolContext) => CoordinatorToolContext;

  constructor(
    private readonly coordinator: ToolCoordinator,
    config: CoordinatorToolServerAdapterConfig = {}
  ) {
    this.name = config.name ?? "local";
    this.description = config.description ?? "Coordinator-backed tools";
    this.contextFactory = config.contextFactory;
  }

  listTools(): MCPTool[] {
    return this.coordinator.getToolDefinitions().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
      annotations: { policyAction: "connector.action" },
    }));
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    try {
      const localContext = this.contextFactory
        ? this.contextFactory(context)
        : this.buildDefaultContext(context);
      const result = await this.coordinator.execute(call.name, call.arguments, localContext);

      if (isMcpToolResult(result)) {
        return result;
      }

      return {
        success: true,
        content: [{ type: "text", text: formatResult(result) }],
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return errorResult("INVALID_ARGUMENTS", error.message, { errors: error.errors });
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", message);
    }
  }

  private buildDefaultContext(context: ToolContext): CoordinatorToolContext {
    const taskId = context.taskNodeId ?? context.sessionId ?? "workbench";
    return {
      cwd: process.cwd(),
      taskId,
    };
  }
}

export class ExternalAdapterToolSource implements ToolWorkbenchSource {
  readonly name = "external-adapters";

  constructor(private readonly registry: AdapterRegistry) {}

  async load(): Promise<MCPToolServer[]> {
    const adapters = await this.registry.getAvailable();
    return adapters.map((adapter) => new ExternalToolServer(adapter));
  }
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const JSON_SCHEMA_TYPES: JSONSchema["type"][] = ["object", "string", "number", "boolean", "array"];
const JSON_SCHEMA_PROPERTY_TYPES: JSONSchemaProperty["type"][] = [
  "string",
  "number",
  "boolean",
  "array",
  "object",
];

export function validateMcpTool(tool: MCPTool): SchemaValidationResult {
  const errors: string[] = [];

  if (!tool.name || typeof tool.name !== "string") {
    errors.push("Tool name must be a non-empty string");
  }
  if (!tool.description || typeof tool.description !== "string") {
    errors.push("Tool description must be a non-empty string");
  }
  if (!tool.inputSchema) {
    errors.push("Tool inputSchema is required");
  } else {
    validateJsonSchema(tool.inputSchema, "inputSchema", errors);
  }

  const policyAction = tool.annotations?.policyAction;
  if (!policyAction || typeof policyAction !== "string") {
    errors.push("Tool annotations.policyAction is required");
  } else if (!COWORK_POLICY_ACTIONS.includes(policyAction)) {
    errors.push(`Tool annotations.policyAction "${policyAction}" is not supported`);
  }

  return { valid: errors.length === 0, errors };
}

function validateJsonSchema(schema: JSONSchema, path: string, errors: string[]): void {
  validateSchemaType(schema.type, path, errors);

  if (schema.type === "object") {
    validateObjectSchema(schema, path, errors);
    return;
  }

  if (schema.type === "array") {
    validateArraySchema(schema, path, errors);
  }
}

function validateSchemaType(type: JSONSchema["type"], path: string, errors: string[]): void {
  if (!JSON_SCHEMA_TYPES.includes(type)) {
    errors.push(`${path}.type must be one of ${JSON_SCHEMA_TYPES.join(", ")}`);
  }
}

function validateObjectSchema(schema: JSONSchema, path: string, errors: string[]): void {
  if (!schema.properties) {
    return;
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    validateJsonSchemaProperty(property, `${path}.properties.${key}`, errors);
  }

  if (!schema.required) {
    return;
  }
  for (const requiredKey of schema.required) {
    if (!schema.properties?.[requiredKey]) {
      errors.push(`${path}.required includes missing property "${requiredKey}"`);
    }
  }
}

function validateArraySchema(schema: JSONSchema, path: string, errors: string[]): void {
  if (schema.properties) {
    errors.push(`${path}.properties is not allowed for array schemas`);
  }
}

function validateJsonSchemaProperty(
  property: JSONSchemaProperty,
  path: string,
  errors: string[]
): void {
  if (property.type) {
    if (!JSON_SCHEMA_PROPERTY_TYPES.includes(property.type)) {
      errors.push(`${path}.type must be one of ${JSON_SCHEMA_PROPERTY_TYPES.join(", ")}`);
    }
  }

  if (property.type === "object" && property.properties) {
    for (const [key, nested] of Object.entries(property.properties)) {
      validateJsonSchemaProperty(nested, `${path}.properties.${key}`, errors);
    }
  }

  if (property.items) {
    validateJsonSchemaProperty(property.items, `${path}.items`, errors);
  }

  if (property.oneOf) {
    property.oneOf.forEach((entry, index) => {
      validateJsonSchemaProperty(entry, `${path}.oneOf.${index}`, errors);
    });
  }
}

function parseToolList(stdout: string): MCPTool[] | null {
  const parsed = parseJsonResult(stdout);
  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed.filter((entry): entry is MCPTool => {
    return typeof entry === "object" && entry !== null && "name" in entry;
  });
}

function parseJsonResult(stdout: string): unknown | null {
  if (!stdout.trim()) {
    return null;
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function isMcpToolResult(result: unknown): result is MCPToolResult {
  if (!result || typeof result !== "object") {
    return false;
  }
  const record = result as MCPToolResult;
  return typeof record.success === "boolean" && Array.isArray(record.content);
}

function formatResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result === null || result === undefined) {
    return "";
  }
  if (typeof result === "object") {
    return JSON.stringify(result, null, 2);
  }
  return String(result);
}

type ExecCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  timeoutMs: number;
};

type ExecCommandOptions = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

function execCommand(
  command: string,
  input: string | undefined,
  options: ExecCommandOptions
): Promise<ExecCommandResult> {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? 30000;
    const child = spawn(command, {
      shell: true,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let resolved = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (resolved) {
        return;
      }
      resolved = true;
      resolve({
        stdout,
        stderr: `${stderr}${error.message}`,
        exitCode: 1,
        timedOut,
        timeoutMs,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (resolved) {
        return;
      }
      resolved = true;
      resolve({ stdout, stderr, exitCode: code, timedOut, timeoutMs });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function errorResult(code: ToolErrorCode, message: string, details?: unknown): MCPToolResult {
  const error: ToolError = { code, message, details };
  return {
    success: false,
    content: [{ type: "text", text: message }],
    error,
  };
}
