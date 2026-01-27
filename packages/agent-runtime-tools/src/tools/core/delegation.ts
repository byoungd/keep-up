/**
 * Delegation Tool Server
 *
 * Implements the DelegateToAgent tool per spec Section 5.4.
 * Allows agents to delegate tasks to specialized child agents.
 */

import type {
  AgentResult,
  AgentType,
  IAgentManager,
  MCPToolResult,
  ToolContext,
} from "@ku0/agent-runtime-core";
import type { AgentLineageManager, DelegationRole } from "../../agents/lineage";
import { SubagentOrchestrator } from "../../orchestrator/subagentOrchestrator";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for DelegateToAgent tool per spec 5.4.
 */
export interface DelegateToAgentInput {
  /** Role of the child agent */
  role: DelegationRole;
  /** Task description for the child */
  task: string;
  /** Constraints (tool restrictions) for the child */
  constraints?: string[];
  /** Expected output hint */
  expectedOutput?: string;
}

/**
 * Map of delegation roles to agent types.
 */
const ROLE_TO_AGENT_TYPE: Record<DelegationRole, AgentType> = {
  researcher: "research",
  coder: "code",
  reviewer: "code-reviewer",
  analyst: "explore",
};

/**
 * Valid delegation roles.
 */
const VALID_ROLES: DelegationRole[] = ["researcher", "coder", "reviewer", "analyst"];

// ============================================================================
// Delegation Tool Server
// ============================================================================

/**
 * MCP tool server for agent delegation per spec 5.4.
 */
export class DelegationToolServer extends BaseToolServer {
  readonly name = "delegation";
  readonly description = "Delegate tasks to specialized child agents";
  private readonly orchestrator: SubagentOrchestrator;

  constructor(
    manager: IAgentManager,
    private readonly lineageManager?: AgentLineageManager,
    private readonly parentAgentId?: string,
    private readonly parentDepth: number = 0
  ) {
    super();
    this.orchestrator = new SubagentOrchestrator(manager);
    this.registerTools();
  }

  private registerTools(): void {
    this.registerTool(
      {
        name: "delegate",
        description:
          "Delegate a task to a specialized child agent. The child agent will execute the task in an isolated context with constrained tools.",
        inputSchema: {
          type: "object" as const,
          properties: {
            role: {
              type: "string",
              enum: VALID_ROLES,
              description:
                "Role of the child agent: 'researcher' (web research), 'coder' (code generation), 'reviewer' (code review), 'analyst' (data analysis)",
            },
            task: {
              type: "string",
              description: "The task for the child agent to complete",
            },
            constraints: {
              type: "array",
              items: { type: "string" },
              description:
                "Optional list of allowed tools for the child agent (e.g., ['file:read', 'file:list']). If not specified, uses role defaults.",
            },
            expectedOutput: {
              type: "string",
              description: "Optional hint for the expected output format",
            },
          },
          required: ["role", "task"],
        },
        annotations: {
          requiresConfirmation: false,
          readOnly: false,
          policyAction: "connector.action",
        },
      },
      (args: Record<string, unknown>, context: ToolContext) => this.handleDelegate(args, context)
    );

    this.registerTool(
      {
        name: "list_roles",
        description: "List available delegation roles",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
        annotations: {
          requiresConfirmation: false,
          readOnly: true,
          policyAction: "connector.read",
        },
      },
      async (_args: Record<string, unknown>, context: ToolContext) => this.handleListRoles(context)
    );
  }

  /**
   * Handle delegate tool call.
   */
  private async handleDelegate(
    args: Record<string, unknown>,
    toolContext: ToolContext
  ): Promise<MCPToolResult> {
    const validation = this.validateDelegateArgs(args);
    if ("error" in validation) {
      return validation.error;
    }

    const { role, task, constraints } = validation;
    const expectedOutput = this.parseExpectedOutput(args.expectedOutput);
    const a2aTarget = this.resolveA2ATarget(role, toolContext);
    if (a2aTarget) {
      return this.delegateViaA2A(toolContext, a2aTarget, {
        role,
        task,
        constraints,
        expectedOutput,
      });
    }

    const agentType = ROLE_TO_AGENT_TYPE[role];
    const childDepth = this.parentDepth + 1;
    const agentId = this.lineageManager ? this.createChildAgentId(agentType) : undefined;

    if (agentId) {
      this.trackLineageStart(agentId, role, childDepth);
    }

    const scope = constraints ? { allowedTools: constraints } : undefined;
    const parentId = toolContext.correlationId ?? this.parentAgentId ?? "delegation";

    try {
      const result = await this.orchestrator.spawnSubagent(
        parentId,
        {
          type: agentType,
          task: this.buildTaskPrompt(task, expectedOutput),
          scope,
          agentId,
          _depth: childDepth,
        },
        {
          signal: toolContext.signal,
          baseSecurity: toolContext.security,
          baseToolExecution: toolContext.toolExecution,
          contextId: toolContext.contextId,
        }
      );

      this.updateLineageStatus(agentId ?? result.agentId, result.success);
      return this.formatResult(result, role, toolContext);
    } catch (error) {
      if (agentId) {
        this.updateLineageStatus(agentId, false);
      }
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", `Delegation failed: ${message}`);
    }
  }

  /**
   * Validate delegation arguments.
   */
  private validateDelegateArgs(
    args: Record<string, unknown>
  ): { role: DelegationRole; task: string; constraints?: string[] } | { error: MCPToolResult } {
    const role = this.parseRole(args.role);
    if (!role) {
      return {
        error: errorResult(
          "INVALID_ARGUMENTS",
          `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`
        ),
      };
    }

    const task = this.parseTask(args.task);
    if (!task) {
      return {
        error: errorResult("INVALID_ARGUMENTS", "Task is required"),
      };
    }

    const constraintsResult = this.parseConstraints(args.constraints);
    if (!constraintsResult.valid) {
      return {
        error: errorResult("INVALID_ARGUMENTS", "Constraints must be an array of tool identifiers"),
      };
    }

    return {
      role,
      task,
      constraints: constraintsResult.constraints,
    };
  }

  /**
   * Track lineage for a delegated agent.
   */
  private trackLineageStart(agentId: string, role: DelegationRole, depth: number): void {
    if (!this.lineageManager) {
      return;
    }

    if (!this.lineageManager.get(agentId)) {
      this.lineageManager.track(agentId, this.parentAgentId ?? null, role, depth);
    }
  }

  /**
   * Update lineage status after completion.
   */
  private updateLineageStatus(agentId: string, success: boolean): void {
    if (!this.lineageManager) {
      return;
    }

    this.lineageManager.updateStatus(agentId, success ? "completed" : "failed");

    if (this.parentAgentId) {
      this.lineageManager.rollupToParent(agentId);
    }
  }

  private resolveA2ATarget(role: DelegationRole, context: ToolContext): string | undefined {
    const a2a = context.a2a;
    if (!a2a) {
      return undefined;
    }

    const mapped = a2a.routing?.roleToAgentId?.[role];
    if (mapped) {
      return mapped;
    }

    const prefix = a2a.routing?.capabilityPrefix ?? "";
    return (
      a2a.adapter.resolveAgentForCapability(`${prefix}${role}`) ??
      a2a.adapter.resolveAgentForCapability(role)
    );
  }

  private async delegateViaA2A(
    context: ToolContext,
    targetAgentId: string,
    payload: {
      role: DelegationRole;
      task: string;
      constraints?: string[];
      expectedOutput?: string;
    }
  ): Promise<MCPToolResult> {
    const a2a = context.a2a;
    if (!a2a) {
      return errorResult("EXECUTION_FAILED", "A2A context is not configured.");
    }

    try {
      const response = await a2a.adapter.request(
        a2a.agentId,
        targetAgentId,
        {
          kind: "delegate",
          ...payload,
        },
        {
          timeoutMs: a2a.timeoutMs,
          capabilities: [payload.role],
        }
      );

      const result = response.payload as { success?: boolean; output?: string; error?: string };
      if (result.success) {
        return this.formatOutput(result.output ?? "", context);
      }

      const message = result.error ?? "Delegation failed";
      return errorResult("EXECUTION_FAILED", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult("EXECUTION_FAILED", message);
    }
  }

  /**
   * Handle list_roles tool call.
   */
  private handleListRoles(context: ToolContext): MCPToolResult {
    const roleDescriptions = [
      {
        role: "researcher",
        agentType: "research",
        description: "Web research, information gathering, and synthesis",
        defaultTools: ["web:search", "web:fetch", "file:read"],
      },
      {
        role: "coder",
        agentType: "code",
        description: "Code generation, editing, and implementation",
        defaultTools: ["file:read", "file:write", "file:list", "bash:execute"],
      },
      {
        role: "reviewer",
        agentType: "code-reviewer",
        description: "Code review, bug identification, and improvement suggestions",
        defaultTools: ["file:read", "file:list", "bash:execute"],
      },
      {
        role: "analyst",
        agentType: "explore",
        description: "Data analysis, exploration, and pattern identification",
        defaultTools: ["file:read", "file:list"],
      },
    ];

    return this.formatOutput(
      `Available delegation roles:\n${JSON.stringify(roleDescriptions, null, 2)}`,
      context
    );
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private parseRole(value: unknown): DelegationRole | null {
    if (typeof value === "string" && VALID_ROLES.includes(value as DelegationRole)) {
      return value as DelegationRole;
    }
    return null;
  }

  private parseTask(value: unknown): string | null {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  private parseConstraints(
    value: unknown
  ): { valid: true; constraints?: string[] } | { valid: false } {
    if (value === undefined) {
      return { valid: true };
    }
    if (!Array.isArray(value)) {
      return { valid: false };
    }
    if (!value.every((item) => typeof item === "string")) {
      return { valid: false };
    }
    const constraints = value.map((item) => item.trim()).filter((item) => item.length > 0);
    if (constraints.length === 0) {
      return { valid: true };
    }
    return { valid: true, constraints };
  }

  private parseExpectedOutput(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private buildTaskPrompt(task: string, expectedOutput?: string): string {
    let prompt = task;
    if (expectedOutput) {
      prompt += `\n\nExpected output format: ${expectedOutput}`;
    }
    return prompt;
  }

  private formatResult(
    result: AgentResult,
    role: DelegationRole,
    context: ToolContext
  ): MCPToolResult {
    if (result.success) {
      return this.formatOutput(
        `## Delegation Result (${role})\n\n` +
          `**Agent ID**: ${result.agentId}\n` +
          `**Turns**: ${result.turns}\n` +
          `**Duration**: ${result.durationMs}ms\n\n` +
          `### Output\n\n${result.output}`,
        context
      );
    }
    return errorResult(
      "EXECUTION_FAILED",
      `Delegation failed after ${result.turns} turns (${result.durationMs}ms): ${result.error ?? "Unknown error"}`
    );
  }

  private formatOutput(output: string, context: ToolContext): MCPToolResult {
    const maxOutputBytes = context.security.limits.maxOutputBytes;
    if (Buffer.byteLength(output) > maxOutputBytes) {
      const truncated = Buffer.from(output).subarray(0, maxOutputBytes).toString();
      return textResult(`${truncated}\n\n[Output truncated at ${maxOutputBytes} bytes]`);
    }

    return textResult(output);
  }

  private createChildAgentId(agentType: AgentType): string {
    const nonce = Math.random().toString(36).slice(2, 8);
    return `${agentType}-${Date.now().toString(36)}-${nonce}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a delegation tool server.
 */
export function createDelegationToolServer(
  manager: IAgentManager,
  options?: {
    lineageManager?: AgentLineageManager;
    parentAgentId?: string;
    parentDepth?: number;
  }
): DelegationToolServer {
  return new DelegationToolServer(
    manager,
    options?.lineageManager,
    options?.parentAgentId,
    options?.parentDepth ?? 0
  );
}
