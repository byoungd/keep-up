import type {
  MCPToolResult,
  SkillActivation,
  ToolContext,
  ToolExecutor,
} from "@ku0/agent-runtime-core";
import { BaseToolServer, errorResult, textResult } from "../tools/mcp/baseServer";
import { createSkillExecutionBridge, type SkillExecutionBridge } from "./skillExecutionBridge";
import type { SkillRegistry } from "./skillRegistry";
import { createSkillResolver, type SkillResolver } from "./skillResolver";
import type { SkillSession } from "./skillSession";

export type SkillToolServerOptions = {
  registry: SkillRegistry;
  executor: ToolExecutor;
  resolver?: SkillResolver;
  session?: SkillSession;
};

export class SkillToolServer extends BaseToolServer {
  readonly name = "skills";
  readonly description = "Manage Agent Skills: list, read, and run skill resources";

  private readonly registry: SkillRegistry;
  private readonly resolver: SkillResolver;
  private readonly session?: SkillSession;
  private readonly executionBridge: SkillExecutionBridge;

  constructor(options: SkillToolServerOptions) {
    super();
    this.registry = options.registry;
    this.resolver = options.resolver ?? createSkillResolver({ registry: this.registry });
    this.session = options.session;
    this.executionBridge = createSkillExecutionBridge({
      registry: this.registry,
      resolver: this.resolver,
      executor: options.executor,
    });

    this.registerTools();
  }

  async initialize(): Promise<void> {
    await this.registry.discover();
  }

  private registerTools(): void {
    this.registerTool(
      {
        name: "list",
        description: "List available skills with metadata",
        inputSchema: {
          type: "object",
          properties: {
            includeDisabled: {
              type: "boolean",
              description: "Include disabled skills in the response",
            },
          },
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleList.bind(this)
    );

    this.registerTool(
      {
        name: "read",
        description: "Load a skill SKILL.md file",
        inputSchema: {
          type: "object",
          properties: {
            skillId: {
              type: "string",
              description: "Skill identifier (usually the skill name)",
            },
          },
          required: ["skillId"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleRead.bind(this)
    );

    this.registerTool(
      {
        name: "read_resource",
        description: "Read a resource file within a skill",
        inputSchema: {
          type: "object",
          properties: {
            skillId: {
              type: "string",
              description: "Skill identifier",
            },
            path: {
              type: "string",
              description: "Relative path to the resource",
            },
            encoding: {
              type: "string",
              description: "File encoding (default: utf-8)",
              enum: ["utf-8", "ascii", "base64"],
            },
          },
          required: ["skillId", "path"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: true,
          estimatedDuration: "fast",
          policyAction: "connector.read",
        },
      },
      this.handleReadResource.bind(this)
    );

    this.registerTool(
      {
        name: "run_script",
        description: "Execute a skill script via the runtime code executor",
        inputSchema: {
          type: "object",
          properties: {
            skillId: {
              type: "string",
              description: "Skill identifier",
            },
            path: {
              type: "string",
              description: "Relative path to the script",
            },
            timeoutMs: {
              type: "number",
              description: "Override execution timeout in milliseconds",
            },
          },
          required: ["skillId", "path"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "medium",
          policyAction: "connector.action",
        },
      },
      this.handleRunScript.bind(this)
    );
  }

  private async handleList(args: Record<string, unknown>): Promise<MCPToolResult> {
    const includeDisabled = args.includeDisabled === true;
    const skills = this.registry.list({ includeDisabled });
    return textResult(JSON.stringify(skills, null, 2));
  }

  private async handleRead(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const skillId = args.skillId as string;
    const loaded = await this.resolver.loadSkill(skillId);

    if ("error" in loaded) {
      return errorResult("RESOURCE_NOT_FOUND", loaded.error);
    }

    this.session?.activate(skillId, context);

    return textResult(loaded.content);
  }

  private async handleReadResource(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const skillId = args.skillId as string;
    const resourcePath = args.path as string;
    const encoding = (args.encoding as BufferEncoding | undefined) ?? "utf-8";

    const resource = await this.resolver.readResource(skillId, resourcePath, encoding);
    if ("error" in resource) {
      return errorResult("RESOURCE_NOT_FOUND", resource.error);
    }

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.resource_read",
      action: "result",
      userId: context.userId,
      correlationId: context.correlationId,
      input: { skillId, path: resourcePath },
      output: { resolvedPath: resource.resolvedPath },
      sandboxed: context.security.sandbox.type !== "none",
    });

    return textResult(resource.content);
  }

  private async handleRunScript(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const skillId = args.skillId as string;
    const scriptPath = args.path as string;
    const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;

    const activation = this.session?.activate(skillId, context) ?? null;
    const enrichedContext = this.mergeSkillContext(context, activation);

    const result = await this.executionBridge.runScript({
      skillId,
      scriptPath,
      timeoutMs,
      context: enrichedContext,
    });

    context.audit?.log({
      timestamp: Date.now(),
      toolName: "skill.script_executed",
      action: result.success ? "result" : "error",
      userId: context.userId,
      correlationId: context.correlationId,
      input: { skillId, path: scriptPath },
      output: result.success ? { success: true } : result.error,
      sandboxed: context.security.sandbox.type !== "none",
    });

    return result;
  }

  private mergeSkillContext(context: ToolContext, activation: SkillActivation | null): ToolContext {
    const baseSkills = context.skills?.activeSkills ?? [];
    if (!activation) {
      return { ...context, skills: { activeSkills: baseSkills } };
    }

    const hasActivation = baseSkills.some((skill) => skill.skillId === activation.skillId);
    const merged = hasActivation ? baseSkills : [...baseSkills, activation];
    return { ...context, skills: { activeSkills: merged } };
  }
}

export function createSkillToolServer(options: SkillToolServerOptions): SkillToolServer {
  return new SkillToolServer(options);
}
