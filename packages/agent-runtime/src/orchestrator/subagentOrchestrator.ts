/**
 * Subagent Orchestrator
 *
 * Manages parent-child agent relationships with context isolation.
 * Enables complex multi-agent workflows where a parent agent spawns
 * specialized subagents for specific tasks.
 */

import type { AgentResult, AgentType, IAgentManager, SpawnAgentOptions } from "../agents/types";
import { createSecurityPolicy } from "../security";
import type { SecurityPolicy } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for subagent spawning.
 */
export interface SubagentTask {
  /** Subagent type */
  type: AgentType;
  /** Task description for this subagent */
  task: string;
  /** Context to pass to subagent */
  context?: Record<string, unknown>;
  /** Priority (higher = earlier execution) */
  priority?: number;
  /** Scoped permissions for the subagent */
  scope?: SubagentScope;
}

export interface SubagentScope {
  /** Restrict tools available to the subagent */
  allowedTools?: string[];
  /** File access scope */
  fileAccess?: "none" | "read" | "write";
  /** Network access scope */
  network?: "none" | "restricted" | "full";
}

/**
 * Parent-child relationship.
 */
export interface AgentRelationship {
  /** Parent agent ID */
  parentId: string;
  /** Child agent IDs */
  childIds: string[];
  /** Task hierarchy level */
  level: number;
}

/**
 * Aggregated results from multiple subagents.
 */
export interface AggregatedResults {
  /** All subagent results */
  results: AgentResult[];
  /** Successfully completed */
  successful: AgentResult[];
  /** Failed */
  failed: AgentResult[];
  /** Summary of all outputs */
  summary: string;
  /** Total duration */
  totalDurationMs: number;
}

/**
 * Subagent orchestrator for managing multi-agent workflows.
 */
export class SubagentOrchestrator {
  private readonly manager: IAgentManager;
  private relationships = new Map<string, AgentRelationship>();

  constructor(manager: IAgentManager) {
    this.manager = manager;
  }

  /**
   * Spawn multiple subagents with dependency management.
   */
  async orchestrateSubagents(
    parentId: string,
    tasks: SubagentTask[],
    options: { signal?: AbortSignal; maxConcurrent?: number } = {}
  ): Promise<AggregatedResults> {
    const startTime = Date.now();

    // Sort by priority
    const sortedTasks = [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Convert to spawn options
    const spawnOptions: SpawnAgentOptions[] = sortedTasks.map((task) =>
      this.buildSpawnOptions(task, options.signal)
    );

    const results =
      options.maxConcurrent && options.maxConcurrent > 0
        ? await this.spawnWithConcurrency(spawnOptions, options.maxConcurrent)
        : await this.manager.spawnParallel(spawnOptions);

    // Track relationships
    this.relationships.set(parentId, {
      parentId,
      childIds: results.map((r) => r.agentId),
      level: this.getParentLevel(parentId) + 1,
    });

    // Aggregate results
    return this.aggregateResults(results, Date.now() - startTime);
  }

  /**
   * Spawn a single subagent and wait for result.
   */
  async spawnSubagent(
    parentId: string,
    task: SubagentTask,
    options: { signal?: AbortSignal } = {}
  ): Promise<AgentResult> {
    const result = await this.manager.spawn(this.buildSpawnOptions(task, options.signal));

    // Track relationship
    const existing = this.relationships.get(parentId);
    if (existing) {
      existing.childIds.push(result.agentId);
    } else {
      this.relationships.set(parentId, {
        parentId,
        childIds: [result.agentId],
        level: this.getParentLevel(parentId) + 1,
      });
    }

    return result;
  }

  /**
   * Execute workflow pattern: research → plan → implement → verify.
   */
  async executeWorkflow(
    parentId: string,
    workflowConfig: {
      research?: string;
      plan?: string;
      implement?: string;
      verify?: string;
    },
    options: { signal?: AbortSignal } = {}
  ): Promise<{
    research?: AgentResult;
    plan?: AgentResult;
    implementation?: AgentResult;
    verification?: AgentResult;
  }> {
    const results: Record<string, AgentResult> = {};

    // Sequential execution with context passing
    if (workflowConfig.research) {
      results.research = await this.spawnSubagent(
        parentId,
        { type: "research", task: workflowConfig.research },
        options
      );

      // Stop if research failed
      if (!results.research.success) {
        return { research: results.research };
      }
    }

    if (workflowConfig.plan) {
      const researchContext = results.research ? { research: results.research.output } : undefined;
      results.plan = await this.spawnSubagent(
        parentId,
        { type: "plan", task: workflowConfig.plan, context: researchContext },
        options
      );

      if (!results.plan.success) {
        return { research: results.research, plan: results.plan };
      }
    }

    if (workflowConfig.implement) {
      const planContext = results.plan ? { plan: results.plan.output } : undefined;
      results.implementation = await this.spawnSubagent(
        parentId,
        { type: "code", task: workflowConfig.implement, context: planContext },
        options
      );

      if (!results.implementation.success) {
        return {
          research: results.research,
          plan: results.plan,
          implementation: results.implementation,
        };
      }
    }

    if (workflowConfig.verify) {
      results.verification = await this.spawnSubagent(
        parentId,
        { type: "bash", task: workflowConfig.verify },
        options
      );
    }

    return {
      research: results.research,
      plan: results.plan,
      implementation: results.implementation,
      verification: results.verification,
    };
  }

  /**
   * Get agent hierarchy information.
   */
  getRelationship(agentId: string): AgentRelationship | undefined {
    return this.relationships.get(agentId);
  }

  /**
   * Get all descendants of an agent.
   */
  getDescendants(agentId: string): string[] {
    const descendants: string[] = [];
    const relationship = this.relationships.get(agentId);

    if (relationship) {
      for (const childId of relationship.childIds) {
        descendants.push(childId);
        descendants.push(...this.getDescendants(childId));
      }
    }

    return descendants;
  }

  /**
   * Build task with context injection.
   */
  private buildTaskWithContext(task: string, context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return task;
    }

    const contextStr = Object.entries(context)
      .map(([key, value]) => `${key}: ${JSON.stringify(value, null, 2)}`)
      .join("\n\n");

    return `${task}\n\n---\n\n**Context from parent:**\n${contextStr}`;
  }

  private buildSpawnOptions(task: SubagentTask, signal?: AbortSignal): SpawnAgentOptions {
    const scopedContext = task.scope
      ? { ...(task.context ?? {}), scope: task.scope }
      : task.context;
    return {
      type: task.type,
      task: this.buildTaskWithContext(task.task, scopedContext),
      signal,
      security: task.scope ? this.buildScopeSecurity(task) : undefined,
      allowedTools: task.scope?.allowedTools,
    };
  }

  private buildScopeSecurity(task: SubagentTask): SecurityPolicy {
    const profile = this.manager.getProfile(task.type);
    const basePolicy = createSecurityPolicy(profile.securityPreset);
    const scope = task.scope;

    if (!scope) {
      return basePolicy;
    }

    const permissions = { ...basePolicy.permissions };

    if (scope.network) {
      permissions.network =
        scope.network === "none" ? "none" : scope.network === "restricted" ? "allowlist" : "full";
    }

    if (scope.fileAccess) {
      permissions.file =
        scope.fileAccess === "none" ? "none" : scope.fileAccess === "read" ? "read" : "workspace";
    }

    return {
      ...basePolicy,
      permissions,
    };
  }

  private async spawnWithConcurrency(
    options: SpawnAgentOptions[],
    maxConcurrent: number
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];

    for (let i = 0; i < options.length; i += maxConcurrent) {
      const batch = options.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(batch.map((opts) => this.manager.spawn(opts)));
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get parent's hierarchy level.
   */
  private getParentLevel(parentId: string): number {
    const relationship = this.relationships.get(parentId);
    return relationship?.level ?? 0;
  }

  /**
   * Aggregate results from multiple subagents.
   */
  private aggregateResults(results: AgentResult[], totalDurationMs: number): AggregatedResults {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Create summary
    const summary = this.createSummary(results);

    return {
      results,
      successful,
      failed,
      summary,
      totalDurationMs,
    };
  }

  /**
   * Create a summary from multiple agent outputs.
   */
  private createSummary(results: AgentResult[]): string {
    if (results.length === 0) {
      return "No subagents executed";
    }

    const sections: string[] = [];

    sections.push(`Executed ${results.length} subagent${results.length > 1 ? "s" : ""}`);

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length > 0) {
      sections.push(`✓ ${successful.length} succeeded`);
    }
    if (failed.length > 0) {
      sections.push(`✗ ${failed.length} failed`);
    }

    // Add outputs from successful agents
    for (const result of successful) {
      if (result.output) {
        sections.push(`\n**${result.type} agent:**\n${result.output}`);
      }
    }

    // Add errors from failed agents
    for (const result of failed) {
      if (result.error) {
        sections.push(`\n**${result.type} agent (FAILED):**\n${result.error}`);
      }
    }

    return sections.join("\n");
  }
}

/**
 * Create a subagent orchestrator.
 */
export function createSubagentOrchestrator(manager: IAgentManager): SubagentOrchestrator {
  return new SubagentOrchestrator(manager);
}
