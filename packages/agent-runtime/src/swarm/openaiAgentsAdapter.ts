/**
 * OpenAI Agents SDK Adapter
 *
 * Wraps @openai/agents to provide multi-agent orchestration
 * while maintaining compatibility with our existing SwarmOrchestrator interface.
 */

import { Agent, run, tool } from "@openai/agents";
import type { z } from "zod";

import type {
  ConductorContext,
  ISwarmOrchestrator,
  SwarmEvent,
  SwarmEventHandler,
  SwarmStats,
  WorkerInstance,
  WorkerState,
  WorkerTask,
} from "./types";

/**
 * Configuration for OpenAI Agents adapter
 */
export interface OpenAIAgentsConfig {
  /** Maximum concurrent workers */
  maxConcurrency?: number;
  /** Default task timeout in ms */
  defaultTimeout?: number;
  /** Whether to enable background workers */
  enableBackground?: boolean;
  /** Worker pool size for background tasks */
  backgroundPoolSize?: number;
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use for agents */
  model?: string;
  /** Max turns per agent run */
  maxTurns?: number;
}

const DEFAULT_CONFIG: OpenAIAgentsConfig = {
  maxConcurrency: 4,
  defaultTimeout: 300000,
  enableBackground: true,
  backgroundPoolSize: 2,
  model: "gpt-5.2-instant",
  maxTurns: 10,
};

/**
 * Agent definition for creating workers
 */
export interface AgentDefinition {
  name: string;
  instructions: string;
  tools?: ReturnType<typeof tool>[];
  handoffs?: Agent[];
  handoffDescription?: string;
}

/**
 * OpenAI Agents Orchestrator
 *
 * Implements ISwarmOrchestrator using the official OpenAI Agents SDK.
 */
export class OpenAIAgentsOrchestrator implements ISwarmOrchestrator {
  private readonly config: OpenAIAgentsConfig;
  private readonly workers = new Map<string, WorkerInstance>();
  private readonly agents = new Map<string, Agent>();
  private readonly eventHandlers = new Set<SwarmEventHandler>();
  private stats: SwarmStats = {
    totalSpawned: 0,
    activeCount: 0,
    queuedCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgExecutionTime: 0,
  };
  private executionTimes: number[] = [];
  private activeRuns = 0;

  constructor(config?: OpenAIAgentsConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register an agent definition for use as workers
   */
  registerAgent(definition: AgentDefinition): Agent {
    const agent = new Agent({
      name: definition.name,
      instructions: definition.instructions,
      tools: definition.tools,
      handoffs: definition.handoffs,
      handoffDescription: definition.handoffDescription,
      model: this.config.model,
    });

    this.agents.set(definition.name, agent);
    return agent;
  }

  /**
   * Get or create an agent for a task type
   */
  private getOrCreateAgent(taskType: string, prompt: string): Agent {
    // Check if we have a registered agent for this type
    const existing = this.agents.get(taskType);
    if (existing) {
      return existing;
    }

    // Create a generic agent for this task
    const agent = new Agent({
      name: taskType,
      instructions: `You are a ${taskType} agent. ${prompt}`,
      model: this.config.model,
    });

    return agent;
  }

  /**
   * Spawn a new worker to execute a task
   */
  async spawnWorker(taskDef: Omit<WorkerTask, "id">): Promise<string> {
    const workerId = this.generateId();
    const task: WorkerTask = {
      ...taskDef,
      id: workerId,
      timeout: taskDef.timeout ?? this.config.defaultTimeout,
    };

    // Check concurrency
    if (this.activeRuns >= (this.config.maxConcurrency ?? 4)) {
      // Queue the task (for now, just wait)
      this.stats.queuedCount++;
      this.emitEvent("worker:spawned", workerId, task.id);
    }

    const worker: WorkerInstance = {
      id: workerId,
      task,
      state: "spawning",
      startedAt: new Date(),
    };

    this.workers.set(workerId, worker);
    this.stats.totalSpawned++;
    this.stats.activeCount++;
    this.activeRuns++;

    this.emitEvent("worker:spawned", workerId, task.id);

    // Execute asynchronously
    this.executeWorker(worker).catch((error) => {
      this.handleWorkerError(worker, error);
    });

    return workerId;
  }

  /**
   * Execute a worker using OpenAI Agents SDK
   */
  private async executeWorker(worker: WorkerInstance): Promise<void> {
    const { task } = worker;

    worker.state = "running";
    this.emitEvent("worker:started", worker.id, task.id);

    try {
      const agent = this.getOrCreateAgent(task.type, task.prompt);

      // Run the agent
      const result = await run(agent, task.prompt, {
        maxTurns: this.config.maxTurns,
      });

      // Mark as completed
      worker.state = "completed";
      worker.completedAt = new Date();
      worker.progress = 100;
      worker.result = {
        finalOutput: result.finalOutput,
        lastAgent: result.lastAgent?.name,
      };

      this.recordExecutionTime(worker);
      this.stats.activeCount--;
      this.stats.completedCount++;
      this.activeRuns--;

      this.emitEvent("worker:completed", worker.id, task.id, worker.result);
    } catch (error) {
      this.handleWorkerError(worker, error);
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(worker: WorkerInstance, error: unknown): void {
    worker.state = "failed";
    worker.completedAt = new Date();
    worker.error = error instanceof Error ? error.message : String(error);

    this.recordExecutionTime(worker);
    this.stats.activeCount--;
    this.stats.failedCount++;
    this.activeRuns--;

    this.emitEvent("worker:failed", worker.id, worker.task.id, { error: worker.error });
  }

  /**
   * Cancel a running worker
   */
  async cancelWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    if (worker.state === "running" || worker.state === "spawning") {
      worker.state = "cancelled";
      worker.completedAt = new Date();
      this.stats.activeCount--;
      this.activeRuns--;

      this.emitEvent("worker:cancelled", workerId, worker.task.id);
    }
  }

  /**
   * Get worker instance by ID
   */
  getWorker(workerId: string): WorkerInstance | undefined {
    return this.workers.get(workerId);
  }

  /**
   * Get all active workers
   */
  getActiveWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.state === "running" || w.state === "spawning"
    );
  }

  /**
   * Get workers by state
   */
  getWorkersByState(state: WorkerState): WorkerInstance[] {
    return Array.from(this.workers.values()).filter((w) => w.state === state);
  }

  /**
   * Wait for a worker to complete
   */
  async waitForWorker(workerId: string): Promise<WorkerInstance> {
    return new Promise((resolve, reject) => {
      const worker = this.workers.get(workerId);
      if (!worker) {
        reject(new Error(`Worker ${workerId} not found`));
        return;
      }

      if (
        worker.state === "completed" ||
        worker.state === "failed" ||
        worker.state === "cancelled"
      ) {
        resolve(worker);
        return;
      }

      // Poll for completion
      const checkInterval = setInterval(() => {
        const current = this.workers.get(workerId);
        if (
          current &&
          (current.state === "completed" ||
            current.state === "failed" ||
            current.state === "cancelled")
        ) {
          clearInterval(checkInterval);
          resolve(current);
        }
      }, 100);
    });
  }

  /**
   * Subscribe to swarm events
   */
  onEvent(handler: SwarmEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get current swarm statistics
   */
  getStats(): SwarmStats {
    return { ...this.stats };
  }

  /**
   * Shutdown all workers gracefully
   */
  async shutdown(): Promise<void> {
    const activeWorkers = this.getActiveWorkers();
    await Promise.all(activeWorkers.map((w) => this.cancelWorker(w.id)));
  }

  // --- Helpers ---

  private generateId(): string {
    return `oai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private emitEvent(
    type: SwarmEvent["type"],
    workerId?: string,
    taskId?: string,
    data?: unknown
  ): void {
    const event: SwarmEvent = {
      type,
      workerId,
      taskId,
      timestamp: new Date(),
      data,
    };
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private recordExecutionTime(worker: WorkerInstance): void {
    if (worker.completedAt && worker.startedAt) {
      const duration = worker.completedAt.getTime() - worker.startedAt.getTime();
      this.executionTimes.push(duration);

      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }

      this.stats.avgExecutionTime =
        this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
    }
  }
}

/**
 * Create an OpenAI Agents-based orchestrator
 */
export function createOpenAIAgentsOrchestrator(
  config?: OpenAIAgentsConfig
): OpenAIAgentsOrchestrator {
  return new OpenAIAgentsOrchestrator(config);
}

/**
 * Create a Conductor context using OpenAI Agents
 */
export function createOpenAIConductorContext(
  orchestrator: OpenAIAgentsOrchestrator
): ConductorContext {
  return {
    spawnWorker: async (task: Omit<WorkerTask, "id" | "background">) => {
      return orchestrator.spawnWorker({
        ...task,
        background: true,
      });
    },
    getWorkerStatus: () => orchestrator.getActiveWorkers(),
    isBusy: () => orchestrator.getStats().activeCount > 0,
  };
}

/**
 * Create an OpenAI Agents tool from a simple function
 */
export function createAgentTool<T extends z.ZodType>(options: {
  name: string;
  description: string;
  parameters: T;
  execute: (input: z.infer<T>) => Promise<string>;
}) {
  return tool({
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    execute: options.execute,
  });
}

export type { RunResult } from "@openai/agents";
// Re-export OpenAI Agents SDK types and functions
export { Agent, run, tool } from "@openai/agents";
