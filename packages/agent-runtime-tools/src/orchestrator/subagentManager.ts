import type {
  AgentResult,
  AgentType,
  IAgentManager,
  SpawnAgentOptions,
} from "@ku0/agent-runtime-core";
import type {
  SubagentConfig,
  SubagentResult,
  SubagentType,
  SubagentWorkItem,
} from "./subagents/types";

type NormalizedTask = SubagentWorkItem & { _index: number };

type DependencyGraph = {
  taskById: Map<string, NormalizedTask>;
  indegree: Map<string, number>;
  adjacency: Map<string, string[]>;
};

const SUBAGENT_TYPE_MAP: Record<SubagentType, AgentType> = {
  "codebase-research": "explore",
  "terminal-executor": "bash",
  "parallel-work": "code",
  custom: "general",
};

export class SubagentManager {
  constructor(
    private readonly manager: IAgentManager,
    private readonly options: { defaultTimeoutMs?: number } = {}
  ) {}

  async executeSubagent<T>(task: SubagentWorkItem): Promise<SubagentResult<T>> {
    const startTime = Date.now();
    const context = this.createIsolatedContext(task);
    const agentType = this.resolveAgentType(task.config);
    const taskPrompt = this.buildTaskPrompt(task.config, task.input);
    const agentId = this.buildAgentId(task);

    const timeoutMs = task.config.timeout ?? this.options.defaultTimeoutMs;
    const abortController = timeoutMs ? new AbortController() : undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        abortController?.abort();
        void this.manager.stop(agentId);
      }, timeoutMs);
    }

    try {
      const result = await this.manager.spawn(
        this.buildSpawnOptions(task, agentType, taskPrompt, agentId, abortController?.signal)
      );
      return this.toSubagentResult<T>(result, context, startTime);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        output: null as T,
        context,
        executionTime: Date.now() - startTime,
        error: err,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async executeParallel<T>(tasks: SubagentWorkItem[]): Promise<SubagentResult<T>[]> {
    if (tasks.length === 0) {
      return [];
    }

    const { tasks: normalized, order } = this.normalizeTasks(tasks);
    const batches = this.createBatches(normalized);
    const resultsById = new Map<string, SubagentResult<T>>();
    const maxConcurrent = this.resolveMaxConcurrency(tasks);

    for (const batch of batches) {
      const batchResults = await this.executeBatch<T>(batch, maxConcurrent);
      batch.forEach((task, index) => {
        resultsById.set(task.id, batchResults[index]);
      });
    }

    return order
      .map((taskId) => resultsById.get(taskId))
      .filter((result): result is SubagentResult<T> => Boolean(result));
  }

  private createIsolatedContext(task: SubagentWorkItem): Record<string, unknown> {
    return {
      taskId: task.id,
      config: {
        name: task.config.name,
        type: task.config.type,
      },
      input: task.input,
    };
  }

  private resolveAgentType(config: SubagentConfig): AgentType {
    return SUBAGENT_TYPE_MAP[config.type];
  }

  private buildTaskPrompt(config: SubagentConfig, input: unknown): string {
    const inputPayload =
      typeof input === "string" ? input : input === undefined ? "" : JSON.stringify(input, null, 2);

    if (!config.prompt || config.prompt.trim().length === 0) {
      return inputPayload;
    }

    if (inputPayload.length === 0) {
      return config.prompt;
    }

    return `${config.prompt}\n\nInput:\n${inputPayload}`;
  }

  private buildAgentId(task: SubagentWorkItem): string {
    return `subagent-${task.id}-${Date.now().toString(36)}`;
  }

  private buildSpawnOptions(
    task: SubagentWorkItem,
    agentType: AgentType,
    taskPrompt: string,
    agentId: string,
    signal?: AbortSignal
  ): SpawnAgentOptions {
    return {
      agentId,
      type: agentType,
      task: taskPrompt,
      allowedTools: task.config.tools,
      parentTraceId: task.parentTraceId,
      parentContextId: task.parentContextId,
      signal,
    };
  }

  private toSubagentResult<T>(
    result: AgentResult,
    context: Record<string, unknown>,
    startTime: number
  ): SubagentResult<T> {
    if (!result.success) {
      return {
        success: false,
        output: null as T,
        context,
        executionTime: Date.now() - startTime,
        error: result.error ? new Error(result.error) : undefined,
      };
    }

    return {
      success: true,
      output: result.output as T,
      context,
      executionTime: Date.now() - startTime,
    };
  }

  private normalizeTasks(tasks: SubagentWorkItem[]): { tasks: NormalizedTask[]; order: string[] } {
    const normalized = tasks.map((task, index) => ({ ...task, _index: index }));
    const seen = new Set<string>();
    for (const task of normalized) {
      if (seen.has(task.id)) {
        throw new Error(`Duplicate subagent task id "${task.id}"`);
      }
      seen.add(task.id);
    }
    return { tasks: normalized, order: normalized.map((task) => task.id) };
  }

  private createBatches(tasks: NormalizedTask[]): NormalizedTask[][] {
    const graph = this.buildDependencyGraph(tasks);
    const batches: NormalizedTask[][] = [];
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

  private buildDependencyGraph(tasks: NormalizedTask[]): DependencyGraph {
    const taskById = new Map<string, NormalizedTask>();
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

  private registerDependencies(task: NormalizedTask, graph: DependencyGraph): void {
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
    tasks: NormalizedTask[],
    indegree: Map<string, number>
  ): NormalizedTask[] {
    return tasks.filter((task) => (indegree.get(task.id) ?? 0) === 0).sort(this.sortByIndex);
  }

  private collectNextBatch(current: NormalizedTask[], graph: DependencyGraph): NormalizedTask[] {
    const next: NormalizedTask[] = [];
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
    return next.sort(this.sortByIndex);
  }

  private assertNoCycles(total: number, processed: number): void {
    if (processed !== total) {
      throw new Error("Subagent dependency cycle detected");
    }
  }

  private async executeBatch<T>(
    tasks: NormalizedTask[],
    maxConcurrent?: number
  ): Promise<SubagentResult<T>[]> {
    if (!maxConcurrent || maxConcurrent <= 0 || tasks.length <= maxConcurrent) {
      return Promise.all(tasks.map((task) => this.executeSubagent<T>(task)));
    }

    const results: SubagentResult<T>[] = [];
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const slice = tasks.slice(i, i + maxConcurrent);
      const sliceResults = await Promise.all(slice.map((task) => this.executeSubagent<T>(task)));
      results.push(...sliceResults);
    }
    return results;
  }

  private resolveMaxConcurrency(tasks: SubagentWorkItem[]): number | undefined {
    const limits = tasks
      .map((task) => task.config.maxConcurrency)
      .filter((value): value is number => typeof value === "number" && value > 0);

    if (limits.length === 0) {
      return undefined;
    }

    return Math.min(...limits);
  }

  private sortByIndex(a: NormalizedTask, b: NormalizedTask): number {
    return a._index - b._index;
  }
}
