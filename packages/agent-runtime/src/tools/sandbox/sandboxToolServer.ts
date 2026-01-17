/**
 * Sandbox Tool Server
 *
 * MCP tools for managing Docker sandboxes.
 */

import type { SandboxManager, SandboxPolicy } from "../../sandbox";
import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

export interface SandboxToolServerOptions {
  manager: SandboxManager;
}

export class SandboxToolServer extends BaseToolServer {
  readonly name = "sandbox";
  readonly description = "Manage sandbox containers for agent execution";

  private readonly manager: SandboxManager;

  constructor(options: SandboxToolServerOptions) {
    super();
    this.manager = options.manager;

    this.registerTool(this.createCreateToolDef(), this.handleCreate.bind(this));
    this.registerTool(this.createExecToolDef(), this.handleExec.bind(this));
    this.registerTool(this.createInfoToolDef(), this.handleInfo.bind(this));
    this.registerTool(this.createDestroyToolDef(), this.handleDestroy.bind(this));
    this.registerTool(this.createListToolDef(), this.handleList.bind(this));
  }

  private createCreateToolDef(): MCPTool {
    return {
      name: "create",
      description: "Create a sandbox container for the current session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
          workspacePath: { type: "string", description: "Workspace path to mount" },
          image: { type: "string", description: "Docker image to use" },
          policy: {
            type: "object",
            description: "Sandbox policy overrides",
            properties: {
              network: { type: "string", enum: ["none", "allowlist", "full"] },
              allowedHosts: {
                type: "array",
                items: { type: "string" },
                description: "Allowed hostnames when network policy is allowlist",
              },
              filesystem: { type: "string", enum: ["read-only", "workspace-only", "full"] },
              maxMemoryMB: { type: "number" },
              maxCpuPercent: { type: "number" },
              timeoutMs: { type: "number" },
            },
          },
        },
      },
      annotations: {
        category: "core",
        requiresConfirmation: true,
        readOnly: false,
        estimatedDuration: "medium",
      },
    };
  }

  private createExecToolDef(): MCPTool {
    return {
      name: "exec",
      description: "Execute a command inside the sandbox container.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
          command: { type: "string", description: "Command to execute" },
          cwd: { type: "string", description: "Working directory inside the container" },
          timeoutMs: { type: "number", description: "Timeout in milliseconds" },
        },
        required: ["command"],
      },
      annotations: {
        category: "core",
        requiresConfirmation: true,
        readOnly: false,
        estimatedDuration: "medium",
      },
    };
  }

  private createInfoToolDef(): MCPTool {
    return {
      name: "info",
      description: "Get sandbox info for the current session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
        },
      },
      annotations: {
        category: "core",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private createDestroyToolDef(): MCPTool {
    return {
      name: "destroy",
      description: "Stop and remove the sandbox container.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session override" },
        },
      },
      annotations: {
        category: "core",
        requiresConfirmation: true,
        readOnly: false,
        estimatedDuration: "fast",
      },
    };
  }

  private createListToolDef(): MCPTool {
    return {
      name: "list",
      description: "List active sandbox containers.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      annotations: {
        category: "core",
        requiresConfirmation: false,
        readOnly: true,
        estimatedDuration: "fast",
      },
    };
  }

  private async handleCreate(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    const policy = parsePolicy(args.policy);

    try {
      const sandbox = await this.manager.createSandbox(sessionId, {
        policy,
        workspacePath: typeof args.workspacePath === "string" ? args.workspacePath : undefined,
        image: typeof args.image === "string" ? args.image : undefined,
      });
      return textResult(JSON.stringify(sandbox.info(), null, 2));
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Sandbox create failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleExec(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const command = typeof args.command === "string" ? args.command : "";
    if (!command) {
      return errorResult("INVALID_ARGUMENTS", "command is required");
    }
    const sessionId = resolveSessionId(args, context);
    const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
    const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;

    try {
      const sandbox = await this.manager.getSandbox(sessionId);
      const result = await sandbox.exec(command, { cwd, timeoutMs });
      const output = [result.stdout, result.stderr ? `[stderr]\n${result.stderr}` : ""]
        .filter((part) => part.length > 0)
        .join("\n");
      return textResult(output || `Command completed with exit code ${result.exitCode}`);
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Sandbox exec failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleInfo(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    const info = this.manager.getSandboxInfo(sessionId);
    if (!info) {
      return errorResult("RESOURCE_NOT_FOUND", "Sandbox not found");
    }
    return textResult(JSON.stringify(info, null, 2));
  }

  private async handleDestroy(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const sessionId = resolveSessionId(args, context);
    try {
      await this.manager.closeSandbox(sessionId);
      return textResult("Sandbox destroyed");
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        `Sandbox destroy failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleList(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const sandboxes = this.manager.listSandboxes();
    return textResult(JSON.stringify(sandboxes, null, 2));
  }
}

export function createSandboxToolServer(options: SandboxToolServerOptions): SandboxToolServer {
  return new SandboxToolServer(options);
}

function resolveSessionId(args: Record<string, unknown>, context: ToolContext): string {
  if (typeof args.sessionId === "string" && args.sessionId.length > 0) {
    return args.sessionId;
  }
  if (context.sessionId) {
    return context.sessionId;
  }
  return "default";
}

function parsePolicy(value: unknown): SandboxPolicy | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const network = parseEnum(record.network, ["none", "allowlist", "full"] as const);
  const filesystem = parseEnum(record.filesystem, ["read-only", "workspace-only", "full"] as const);
  const allowedHosts = parseStringArray(record.allowedHosts);
  const maxMemoryMB = parseNumber(record.maxMemoryMB);
  const maxCpuPercent = parseNumber(record.maxCpuPercent);
  const timeoutMs = parseNumber(record.timeoutMs);

  if (!network && !filesystem && !maxMemoryMB && !maxCpuPercent && !timeoutMs && !allowedHosts) {
    return undefined;
  }

  return {
    network: network ?? "none",
    allowedHosts,
    filesystem: filesystem ?? "workspace-only",
    maxMemoryMB: maxMemoryMB ?? 512,
    maxCpuPercent: maxCpuPercent ?? 50,
    timeoutMs: timeoutMs ?? 30_000,
  };
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const filtered = value.filter((host) => typeof host === "string");
  return filtered.length > 0 ? filtered : undefined;
}
