/**
 * Subagent Tool Server
 *
 * Provides MCP tools for spawning focused subagents.
 */

import type { AgentResult, AgentType, IAgentManager } from "../../agents/types";
import {
  SubagentOrchestrator,
  type SubagentScope,
  type SubagentTask,
} from "../../orchestrator/subagentOrchestrator";
import type { MCPToolResult, SecurityPolicy, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

type WorkflowResult = {
  research?: AgentResult;
  plan?: AgentResult;
  implementation?: AgentResult;
  verification?: AgentResult;
};

export class SubagentToolServer extends BaseToolServer {
  readonly name = "subagent";
  readonly description = "Spawn and orchestrate subagents for focused tasks";

  private readonly orchestrator: SubagentOrchestrator;
  private readonly availableTypes: AgentType[];
  private readonly availableTypeSet: Set<AgentType>;

  constructor(manager: IAgentManager) {
    super();
    this.orchestrator = new SubagentOrchestrator(manager);
    this.availableTypes = manager.getAvailableTypes();
    this.availableTypeSet = new Set(this.availableTypes);
    this.registerTools();
  }

  private registerTools(): void {
    this.registerTool(
      {
        name: "spawn",
        description: "Spawn a single subagent with a task",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description: "Agent type to spawn",
              enum: this.availableTypes,
            },
            task: { type: "string", description: "Task for the subagent" },
            maxTurns: { type: "number", description: "Override max turns for the subagent" },
            context: { type: "object", description: "Optional context to pass to the subagent" },
            scope: {
              type: "object",
              description: "Optional scope constraints for the subagent",
              properties: {
                allowedTools: { type: "array", items: { type: "string" } },
                fileAccess: { type: "string", enum: ["none", "read", "write"] },
                network: { type: "string", enum: ["none", "restricted", "full"] },
              },
            },
          },
          required: ["type", "task"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "medium",
        },
      },
      this.handleSpawn.bind(this)
    );

    this.registerTool(
      {
        name: "spawn_parallel",
        description: "Spawn multiple subagents in parallel",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              description: "List of subagent tasks",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description: "Agent type to spawn",
                    enum: this.availableTypes,
                  },
                  task: { type: "string", description: "Task for the subagent" },
                  maxTurns: { type: "number", description: "Override max turns for the subagent" },
                  context: {
                    type: "object",
                    description: "Optional context to pass to the subagent",
                  },
                  scope: {
                    type: "object",
                    description: "Optional scope constraints for the subagent",
                    properties: {
                      allowedTools: { type: "array", items: { type: "string" } },
                      fileAccess: { type: "string", enum: ["none", "read", "write"] },
                      network: { type: "string", enum: ["none", "restricted", "full"] },
                    },
                  },
                },
                required: ["type", "task"],
              },
            },
            maxConcurrent: {
              type: "number",
              description: "Maximum number of subagents to run concurrently",
            },
          },
          required: ["tasks"],
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "slow",
        },
      },
      this.handleSpawnParallel.bind(this)
    );

    this.registerTool(
      {
        name: "workflow",
        description: "Run a research → plan → implement → verify workflow",
        inputSchema: {
          type: "object",
          properties: {
            research: { type: "string", description: "Research task" },
            plan: { type: "string", description: "Planning task" },
            implement: { type: "string", description: "Implementation task" },
            verify: { type: "string", description: "Verification task" },
            maxTurns: { type: "number", description: "Override max turns for each agent" },
            context: { type: "object", description: "Optional context to pass to each step" },
            scope: {
              type: "object",
              description: "Optional scope constraints for workflow subagents",
              properties: {
                allowedTools: { type: "array", items: { type: "string" } },
                fileAccess: { type: "string", enum: ["none", "read", "write"] },
                network: { type: "string", enum: ["none", "restricted", "full"] },
              },
            },
          },
        },
        annotations: {
          category: "core",
          requiresConfirmation: false,
          readOnly: false,
          estimatedDuration: "slow",
        },
      },
      this.handleWorkflow.bind(this)
    );

    this.registerTool(
      {
        name: "types",
        description: "List available subagent types",
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
      },
      this.handleTypes.bind(this)
    );
  }

  private async handleSpawn(
    args: Record<string, unknown>,
    toolContext: ToolContext
  ): Promise<MCPToolResult> {
    const type = this.parseAgentType(args.type);
    const task = this.parseTask(args.task);
    if (!type || !task) {
      return errorResult("INVALID_ARGUMENTS", "Valid 'type' and non-empty 'task' are required.");
    }

    const maxTurns = this.parseMaxTurns(args.maxTurns);
    const context = this.parseContext(args.context);
    const scope = this.parseScope(args.scope);
    const parentId = toolContext.correlationId ?? "subagent";

    try {
      const result = await this.orchestrator.spawnSubagent(
        parentId,
        { type, task, maxTurns, context, scope },
        {
          signal: toolContext.signal,
          baseSecurity: this.cloneSecurity(toolContext.security),
          contextId: toolContext.contextId,
        }
      );
      return textResult(JSON.stringify(result, null, 2));
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async handleSpawnParallel(
    args: Record<string, unknown>,
    toolContext: ToolContext
  ): Promise<MCPToolResult> {
    const tasks = Array.isArray(args.tasks) ? args.tasks : null;
    if (!tasks || tasks.length === 0) {
      return errorResult("INVALID_ARGUMENTS", "Provide a non-empty 'tasks' array.");
    }

    const subagentTasks: SubagentTask[] = [];

    for (const entry of tasks) {
      if (!entry || typeof entry !== "object") {
        return errorResult("INVALID_ARGUMENTS", "Each task must be an object.");
      }

      const entryRecord = entry as Record<string, unknown>;
      const type = this.parseAgentType(entryRecord.type);
      const task = this.parseTask(entryRecord.task);

      if (!type || !task) {
        return errorResult(
          "INVALID_ARGUMENTS",
          "Each task must include a valid 'type' and non-empty 'task'."
        );
      }

      const maxTurns = this.parseMaxTurns(entryRecord.maxTurns);
      const context = this.parseContext(entryRecord.context);
      const scope = this.parseScope(entryRecord.scope);
      subagentTasks.push({ type, task, maxTurns, context, scope });
    }

    try {
      const maxConcurrent = this.parseMaxConcurrent(args.maxConcurrent);
      const parentId = toolContext.correlationId ?? "subagent";
      const results = await this.orchestrator.orchestrateSubagents(parentId, subagentTasks, {
        signal: toolContext.signal,
        maxConcurrent,
        baseSecurity: this.cloneSecurity(toolContext.security),
        contextId: toolContext.contextId,
      });
      return textResult(
        JSON.stringify(
          {
            results: results.results,
            summary: results.summary,
            successful: results.successful,
            failed: results.failed,
            totalDurationMs: results.totalDurationMs,
          },
          null,
          2
        )
      );
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async handleWorkflow(
    args: Record<string, unknown>,
    toolContext: ToolContext
  ): Promise<MCPToolResult> {
    const maxTurns = this.parseMaxTurns(args.maxTurns);
    const context = this.parseContext(args.context);
    const scope = this.parseScope(args.scope);

    const researchTask = this.parseTask(args.research);
    const planTask = this.parseTask(args.plan);
    const implementTask = this.parseTask(args.implement);
    const verifyTask = this.parseTask(args.verify);

    if (!researchTask && !planTask && !implementTask && !verifyTask) {
      return errorResult("INVALID_ARGUMENTS", "Provide at least one workflow task.");
    }

    try {
      const parentId = toolContext.correlationId ?? "subagent";
      const results = await this.orchestrator.executeWorkflow(
        parentId,
        {
          research: researchTask ?? undefined,
          plan: planTask ?? undefined,
          implement: implementTask ?? undefined,
          verify: verifyTask ?? undefined,
          maxTurns,
          context,
          scope,
        },
        {
          signal: toolContext.signal,
          baseSecurity: this.cloneSecurity(toolContext.security),
          contextId: toolContext.contextId,
        }
      );

      return textResult(JSON.stringify(results as WorkflowResult, null, 2));
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async handleTypes(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    return textResult(JSON.stringify({ types: this.availableTypes }, null, 2));
  }

  private parseAgentType(value: unknown): AgentType | null {
    if (typeof value !== "string") {
      return null;
    }
    return this.availableTypeSet.has(value as AgentType) ? (value as AgentType) : null;
  }

  private parseTask(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseMaxTurns(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : undefined;
  }

  private parseMaxConcurrent(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : undefined;
  }

  private parseContext(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private parseScope(value: unknown): SubagentScope | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const scope: SubagentScope = {};
    const allowedTools = record.allowedTools;
    if (Array.isArray(allowedTools) && allowedTools.every((tool) => typeof tool === "string")) {
      scope.allowedTools = allowedTools;
    }

    if (
      record.fileAccess === "none" ||
      record.fileAccess === "read" ||
      record.fileAccess === "write"
    ) {
      scope.fileAccess = record.fileAccess;
    }

    if (record.network === "none" || record.network === "restricted" || record.network === "full") {
      scope.network = record.network;
    }

    return Object.keys(scope).length > 0 ? scope : undefined;
  }

  private cloneSecurity(policy: SecurityPolicy): SecurityPolicy {
    return {
      ...policy,
      sandbox: { ...policy.sandbox },
      permissions: { ...policy.permissions },
      limits: { ...policy.limits },
    };
  }
}

export function createSubagentToolServer(manager: IAgentManager): SubagentToolServer {
  return new SubagentToolServer(manager);
}
