/**
 * Subagent Tool Server
 *
 * Provides MCP tools for spawning focused subagents.
 */

import type { AgentResult, AgentType, IAgentManager, SpawnAgentOptions } from "../../agents/types";
import type { MCPToolResult, SecurityPolicy, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

type SpawnRequest = {
  type: AgentType;
  task: string;
  maxTurns?: number;
};

type WorkflowResult = {
  research?: AgentResult;
  plan?: AgentResult;
  implementation?: AgentResult;
  verification?: AgentResult;
};

export class SubagentToolServer extends BaseToolServer {
  readonly name = "subagent";
  readonly description = "Spawn and orchestrate subagents for focused tasks";

  private readonly manager: IAgentManager;
  private readonly availableTypes: AgentType[];
  private readonly availableTypeSet: Set<AgentType>;

  constructor(manager: IAgentManager) {
    super();
    this.manager = manager;
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
                },
                required: ["type", "task"],
              },
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
    context: ToolContext
  ): Promise<MCPToolResult> {
    const type = this.parseAgentType(args.type);
    const task = this.parseTask(args.task);
    if (!type || !task) {
      return errorResult("INVALID_ARGUMENTS", "Valid 'type' and non-empty 'task' are required.");
    }

    const maxTurns = this.parseMaxTurns(args.maxTurns);

    try {
      const result = await this.manager.spawn(
        this.buildSpawnOptions({ type, task, maxTurns }, context)
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
    context: ToolContext
  ): Promise<MCPToolResult> {
    const tasks = Array.isArray(args.tasks) ? args.tasks : null;
    if (!tasks || tasks.length === 0) {
      return errorResult("INVALID_ARGUMENTS", "Provide a non-empty 'tasks' array.");
    }

    const spawnOptions: SpawnAgentOptions[] = [];

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
      spawnOptions.push(this.buildSpawnOptions({ type, task, maxTurns }, context));
    }

    try {
      const results = await this.manager.spawnParallel(spawnOptions);
      return textResult(JSON.stringify({ results }, null, 2));
    } catch (error) {
      return errorResult(
        "EXECUTION_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async handleWorkflow(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    const maxTurns = this.parseMaxTurns(args.maxTurns);

    const researchTask = this.parseTask(args.research);
    const planTask = this.parseTask(args.plan);
    const implementTask = this.parseTask(args.implement);
    const verifyTask = this.parseTask(args.verify);

    if (!researchTask && !planTask && !implementTask && !verifyTask) {
      return errorResult("INVALID_ARGUMENTS", "Provide at least one workflow task.");
    }

    try {
      const results: WorkflowResult = {};

      if (researchTask) {
        results.research = await this.manager.spawn(
          this.buildSpawnOptions({ type: "research", task: researchTask, maxTurns }, context)
        );
        if (!results.research.success) {
          return textResult(JSON.stringify(results, null, 2));
        }
      }

      if (planTask) {
        results.plan = await this.manager.spawn(
          this.buildSpawnOptions({ type: "plan", task: planTask, maxTurns }, context)
        );
        if (!results.plan.success) {
          return textResult(JSON.stringify(results, null, 2));
        }
      }

      if (implementTask) {
        results.implementation = await this.manager.spawn(
          this.buildSpawnOptions({ type: "code", task: implementTask, maxTurns }, context)
        );
        if (!results.implementation.success) {
          return textResult(JSON.stringify(results, null, 2));
        }
      }

      if (verifyTask) {
        results.verification = await this.manager.spawn(
          this.buildSpawnOptions({ type: "bash", task: verifyTask, maxTurns }, context)
        );
      }

      return textResult(JSON.stringify(results, null, 2));
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

  private buildSpawnOptions(request: SpawnRequest, context: ToolContext): SpawnAgentOptions {
    return {
      type: request.type,
      task: request.task,
      maxTurns: request.maxTurns,
      parentTraceId: context.correlationId,
      security: this.cloneSecurity(context.security),
      signal: context.signal,
    };
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
