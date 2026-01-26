/**
 * Subagent Orchestrator
 *
 * Manages parent-child agent relationships with context isolation.
 * Enables complex multi-agent workflows where a parent agent spawns
 * specialized subagents for specific tasks.
 */

import type {
  AgentResult,
  AgentType,
  IAgentManager,
  SecurityPolicy,
  SecurityPreset,
  SpawnAgentOptions,
  ToolExecutionContext,
} from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";

// ============================================================================
// Types
// ============================================================================

function createSecurityPolicy(preset: SecurityPreset): SecurityPolicy {
  return { ...SECURITY_PRESETS[preset] };
}

/**
 * Configuration for subagent spawning.
 */
export interface SubagentTask {
  /** Optional unique ID for dependency tracking */
  id?: string;
  /** Optional explicit agent ID override */
  agentId?: string;
  /** Optional recursion depth override (internal use) */
  _depth?: number;
  /** Subagent type */
  type: AgentType;
  /** Task description for this subagent */
  task: string;
  /** Override default max turns */
  maxTurns?: number;
  /** Context to pass to subagent */
  context?: Record<string, unknown>;
  /** Priority (higher = earlier execution) */
  priority?: number;
  /** Dependencies that must complete before running */
  dependencies?: string[];
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

type NormalizedSubagentTask = SubagentTask & { id: string; _index: number };

type DependencyGraph = {
  taskById: Map<string, NormalizedSubagentTask>;
  indegree: Map<string, number>;
  adjacency: Map<string, string[]>;
};

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
    options: {
      signal?: AbortSignal;
      maxConcurrent?: number;
      baseSecurity?: SecurityPolicy;
      baseToolExecution?: ToolExecutionContext;
      contextId?: string;
    } = {}
  ): Promise<AggregatedResults> {
    const startTime = Date.now();

    const { tasks: normalizedTasks, order: taskOrder } = this.normalizeTasks(tasks);
    const batches = this.createDependencyBatches(normalizedTasks);
    const resultsById = new Map<string, AgentResult>();

    for (const batch of batches) {
      // Convert to spawn options
      const spawnOptions: SpawnAgentOptions[] = batch.map((task) =>
        this.buildSpawnOptions(
          task,
          options.signal,
          options.baseSecurity,
          options.baseToolExecution,
          parentId,
          options.contextId
        )
      );

      const results =
        options.maxConcurrent && options.maxConcurrent > 0
          ? await this.spawnWithConcurrency(spawnOptions, options.maxConcurrent)
          : await this.manager.spawnParallel(spawnOptions);

      batch.forEach((task, index) => {
        resultsById.set(task.id, results[index]);
      });

      // Track relationships
      this.relationships.set(parentId, {
        parentId,
        childIds: results.map((r) => r.agentId),
        level: this.getParentLevel(parentId) + 1,
      });
    }

    const orderedResults = taskOrder
      .map((taskId) => resultsById.get(taskId))
      .filter((result): result is AgentResult => Boolean(result));

    // Aggregate results
    return this.aggregateResults(orderedResults, Date.now() - startTime);
  }

  /**
   * Spawn a single subagent and wait for result.
   */
  async spawnSubagent(
    parentId: string,
    task: SubagentTask,
    options: {
      signal?: AbortSignal;
      baseSecurity?: SecurityPolicy;
      baseToolExecution?: ToolExecutionContext;
      contextId?: string;
    } = {}
  ): Promise<AgentResult> {
    const result = await this.manager.spawn(
      this.buildSpawnOptions(
        task,
        options.signal,
        options.baseSecurity,
        options.baseToolExecution,
        parentId,
        options.contextId
      )
    );

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
      maxTurns?: number;
      context?: Record<string, unknown>;
      scope?: SubagentScope;
    },
    options: {
      signal?: AbortSignal;
      baseSecurity?: SecurityPolicy;
      baseToolExecution?: ToolExecutionContext;
      contextId?: string;
    } = {}
  ): Promise<{
    research?: AgentResult;
    plan?: AgentResult;
    implementation?: AgentResult;
    verification?: AgentResult;
  }> {
    const results: Record<string, AgentResult> = {};
    const baseContext = workflowConfig.context;
    const scope = workflowConfig.scope;
    const maxTurns = workflowConfig.maxTurns;

    // Sequential execution with context passing
    if (workflowConfig.research) {
      results.research = await this.spawnSubagent(
        parentId,
        { type: "research", task: workflowConfig.research, context: baseContext, scope, maxTurns },
        options
      );

      // Stop if research failed
      if (!results.research.success) {
        return { research: results.research };
      }
    }

    if (workflowConfig.plan) {
      const planContext = this.buildWorkflowContext(baseContext, {
        research: results.research?.output,
      });
      results.plan = await this.spawnSubagent(
        parentId,
        { type: "plan", task: workflowConfig.plan, context: planContext, scope, maxTurns },
        options
      );

      if (!results.plan.success) {
        return { research: results.research, plan: results.plan };
      }
    }

    if (workflowConfig.implement) {
      const implementContext = this.buildWorkflowContext(baseContext, {
        research: results.research?.output,
        plan: results.plan?.output,
      });
      results.implementation = await this.spawnSubagent(
        parentId,
        {
          type: "code",
          task: workflowConfig.implement,
          context: implementContext,
          scope,
          maxTurns,
        },
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
      const verifyContext = this.buildWorkflowContext(baseContext, {
        research: results.research?.output,
        plan: results.plan?.output,
        implementation: results.implementation?.output,
      });
      results.verification = await this.spawnSubagent(
        parentId,
        { type: "bash", task: workflowConfig.verify, context: verifyContext, scope, maxTurns },
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

  private buildSpawnOptions(
    task: SubagentTask,
    signal?: AbortSignal,
    baseSecurity?: SecurityPolicy,
    baseToolExecution?: ToolExecutionContext,
    parentId?: string,
    contextId?: string
  ): SpawnAgentOptions {
    const scopedContext = task.scope
      ? { ...(task.context ?? {}), scope: task.scope }
      : task.context;
    const scopedAllowedTools =
      task.scope?.allowedTools !== undefined
        ? task.scope.allowedTools
        : baseToolExecution?.allowedTools;
    const security =
      task.scope || baseSecurity ? this.buildScopeSecurity(task, baseSecurity) : undefined;
    return {
      agentId: task.agentId,
      type: task.type,
      task: this.buildTaskWithContext(task.task, scopedContext),
      maxTurns: task.maxTurns,
      parentTraceId: parentId,
      parentContextId: contextId,
      _depth: task._depth,
      signal,
      security,
      allowedTools: scopedAllowedTools,
    };
  }

  private buildScopeSecurity(task: SubagentTask, baseSecurity?: SecurityPolicy): SecurityPolicy {
    const profile = this.manager.getProfile(task.type);
    const basePolicy = baseSecurity
      ? {
          ...baseSecurity,
          sandbox: { ...baseSecurity.sandbox },
          permissions: { ...baseSecurity.permissions },
          limits: { ...baseSecurity.limits },
        }
      : createSecurityPolicy(profile.securityPreset);
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

  private mergeContext(
    base?: Record<string, unknown>,
    extra?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!base && !extra) {
      return undefined;
    }
    return {
      ...(base ?? {}),
      ...(extra ?? {}),
    };
  }

  private buildWorkflowContext(
    base: Record<string, unknown> | undefined,
    updates: {
      research?: AgentResult["output"];
      plan?: AgentResult["output"];
      implementation?: AgentResult["output"];
    }
  ): Record<string, unknown> | undefined {
    const additions: Record<string, unknown> = {};
    if (updates.research) {
      additions.research = updates.research;
    }
    if (updates.plan) {
      additions.plan = updates.plan;
    }
    if (updates.implementation) {
      additions.implementation = updates.implementation;
    }

    return this.mergeContext(base, Object.keys(additions).length > 0 ? additions : undefined);
  }

  private normalizeTasks(tasks: SubagentTask[]): {
    tasks: NormalizedSubagentTask[];
    order: string[];
  } {
    const normalized = tasks.map((task, index) => ({
      ...task,
      id: task.id ?? `task-${index + 1}`,
      _index: index,
    }));

    const seen = new Set<string>();
    for (const task of normalized) {
      if (seen.has(task.id)) {
        throw new Error(`Duplicate subagent task id "${task.id}"`);
      }
      seen.add(task.id);
    }

    return { tasks: normalized, order: normalized.map((task) => task.id) };
  }

  private createDependencyBatches(tasks: NormalizedSubagentTask[]): NormalizedSubagentTask[][] {
    if (tasks.length === 0) {
      return [];
    }

    const graph = this.buildDependencyGraph(tasks);
    const batches: NormalizedSubagentTask[][] = [];
    let ready = this.collectReadyTasks(tasks, graph.indegree);
    let processed = 0;

    while (ready.length > 0) {
      batches.push(ready);
      processed += ready.length;

      ready = this.collectNextBatch(ready, graph);
    }

    this.assertNoCycles(tasks.length, processed);
    return batches;
  }

  private buildDependencyGraph(tasks: NormalizedSubagentTask[]): DependencyGraph {
    const taskById = new Map<string, NormalizedSubagentTask>();
    const indegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of tasks) {
      taskById.set(task.id, task);
      indegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }

    const graph = { taskById, indegree, adjacency };
    for (const task of tasks) {
      this.registerDependencies(task, graph);
    }

    return graph;
  }

  private registerDependencies(task: NormalizedSubagentTask, graph: DependencyGraph): void {
    const dependencies = task.dependencies ?? [];
    for (const dep of dependencies) {
      const parent = graph.taskById.get(dep);
      if (!parent) {
        throw new Error(`Unknown dependency "${dep}" for subagent task "${task.id}"`);
      }
      graph.adjacency.get(parent.id)?.push(task.id);
      graph.indegree.set(task.id, (graph.indegree.get(task.id) ?? 0) + 1);
    }
  }

  private collectReadyTasks(
    tasks: NormalizedSubagentTask[],
    indegree: Map<string, number>
  ): NormalizedSubagentTask[] {
    return tasks.filter((task) => (indegree.get(task.id) ?? 0) === 0).sort(this.sortByPriority);
  }

  private collectNextBatch(
    current: NormalizedSubagentTask[],
    graph: DependencyGraph
  ): NormalizedSubagentTask[] {
    const next: NormalizedSubagentTask[] = [];
    for (const task of current) {
      const children = graph.adjacency.get(task.id) ?? [];
      for (const childId of children) {
        const nextDegree = (graph.indegree.get(childId) ?? 0) - 1;
        graph.indegree.set(childId, nextDegree);
        if (nextDegree === 0) {
          const childTask = graph.taskById.get(childId);
          if (childTask) {
            next.push(childTask);
          }
        }
      }
    }

    return next.sort(this.sortByPriority);
  }

  private assertNoCycles(total: number, processed: number): void {
    if (processed !== total) {
      throw new Error("Subagent dependency cycle detected");
    }
  }

  private sortByPriority(a: NormalizedSubagentTask, b: NormalizedSubagentTask): number {
    return (b.priority ?? 0) - (a.priority ?? 0) || a._index - b._index;
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
