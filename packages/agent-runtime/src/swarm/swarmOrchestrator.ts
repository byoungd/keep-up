/**
 * Swarm Orchestrator
 *
 * Manages parallel worker execution for the "Conductor + Workers" pattern.
 * Workers run in isolated contexts for background task processing.
 */

import { EventEmitter } from "node:events";
import type {
  ISwarmOrchestrator,
  SwarmConfig,
  SwarmEvent,
  SwarmEventHandler,
  SwarmStats,
  WorkerInstance,
  WorkerState,
  WorkerTask,
} from "./types";

const DEFAULT_CONFIG: SwarmConfig = {
  maxConcurrency: 4,
  defaultTimeout: 300000, // 5 minutes
  enableBackground: true,
  backgroundPoolSize: 2,
};

interface QueuedTask {
  task: WorkerTask;
  resolve: (workerId: string) => void;
  reject: (error: Error) => void;
}

/**
 * Swarm Orchestrator implementation
 */
export class SwarmOrchestrator extends EventEmitter implements ISwarmOrchestrator {
  private readonly config: SwarmConfig;
  private readonly workers = new Map<string, WorkerInstance>();
  private readonly taskQueue: QueuedTask[] = [];
  private stats: SwarmStats = {
    totalSpawned: 0,
    activeCount: 0,
    queuedCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgExecutionTime: 0,
  };
  private executionTimes: number[] = [];
  private isShuttingDown = false;

  constructor(config?: Partial<SwarmConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Spawn a new worker to execute a task
   */
  async spawnWorker(taskDef: Omit<WorkerTask, "id">): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error("Swarm is shutting down");
    }

    const task: WorkerTask = {
      ...taskDef,
      id: this.generateId(),
      timeout: taskDef.timeout ?? this.config.defaultTimeout,
    };

    // Check if we can run immediately or need to queue
    if (this.stats.activeCount < this.config.maxConcurrency) {
      return this.startWorker(task);
    }

    // Queue the task
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.stats.queuedCount = this.taskQueue.length;
      this.emitEvent("worker:spawned", task.id, task.id);
    });
  }

  /**
   * Start a worker immediately
   */
  private async startWorker(task: WorkerTask): Promise<string> {
    const worker: WorkerInstance = {
      id: this.generateId(),
      task,
      state: "spawning",
      startedAt: new Date(),
    };

    this.workers.set(worker.id, worker);
    this.stats.totalSpawned++;
    this.stats.activeCount++;

    this.emitEvent("worker:spawned", worker.id, task.id);

    // Transition to running
    worker.state = "running";
    this.emitEvent("worker:started", worker.id, task.id);

    // Execute the task asynchronously
    this.executeWorker(worker).catch((error) => {
      this.handleWorkerError(worker, error);
    });

    return worker.id;
  }

  /**
   * Execute a worker's task
   */
  private async executeWorker(worker: WorkerInstance): Promise<void> {
    const { task } = worker;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (worker.state === "running") {
        this.handleWorkerError(worker, new Error("Task timeout"));
      }
    }, task.timeout ?? this.config.defaultTimeout);

    try {
      // TODO: In a real implementation, this would spawn a Worker thread
      // or use a separate agent instance to execute the task.
      // For now, we simulate with a placeholder.

      // Simulate work (placeholder for actual agent execution)
      worker.progress = 0;
      worker.statusMessage = "Starting task...";
      this.emitEvent("worker:progress", worker.id, task.id, { progress: 0 });

      // Placeholder: In production, this would invoke the agent
      // await this.agentPool.execute(task);

      // Mark as completed
      worker.state = "completed";
      worker.completedAt = new Date();
      worker.progress = 100;
      worker.result = { status: "completed", taskId: task.id };

      this.recordExecutionTime(worker);
      this.stats.activeCount--;
      this.stats.completedCount++;

      this.emitEvent("worker:completed", worker.id, task.id, worker.result);
    } catch (error) {
      this.handleWorkerError(worker, error);
    } finally {
      clearTimeout(timeoutId);
      this.processQueue();
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

    this.emitEvent("worker:failed", worker.id, worker.task.id, { error: worker.error });
    this.processQueue();
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) {
      if (this.stats.activeCount === 0) {
        this.emitEvent("swarm:idle");
      }
      return;
    }

    if (this.stats.activeCount >= this.config.maxConcurrency) {
      return;
    }

    const queued = this.taskQueue.shift();
    if (queued) {
      this.stats.queuedCount = this.taskQueue.length;
      this.startWorker(queued.task).then(queued.resolve).catch(queued.reject);
    }
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

      this.emitEvent("worker:cancelled", workerId, worker.task.id);
      this.processQueue();
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
  waitForWorker(workerId: string): Promise<WorkerInstance> {
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

      const handler = (event: SwarmEvent) => {
        if (event.workerId === workerId) {
          if (
            event.type === "worker:completed" ||
            event.type === "worker:failed" ||
            event.type === "worker:cancelled"
          ) {
            this.off("swarmEvent", handler);
            const foundWorker = this.workers.get(workerId);
            if (foundWorker) {
              resolve(foundWorker);
            }
          }
        }
      };

      this.on("swarmEvent", handler);
    });
  }

  /**
   * Subscribe to swarm events
   */
  onEvent(handler: SwarmEventHandler): () => void {
    const wrappedHandler = (event: SwarmEvent) => handler(event);
    this.on("swarmEvent", wrappedHandler);
    return () => this.off("swarmEvent", wrappedHandler);
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
    this.isShuttingDown = true;

    // Cancel all queued tasks
    for (const queued of this.taskQueue) {
      queued.reject(new Error("Swarm shutdown"));
    }
    this.taskQueue.length = 0;

    // Cancel all active workers
    const activeWorkers = this.getActiveWorkers();
    await Promise.all(activeWorkers.map((w) => this.cancelWorker(w.id)));

    this.isShuttingDown = false;
  }

  // --- Helpers ---

  private generateId(): string {
    return `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    this.emit("swarmEvent", event);
  }

  private recordExecutionTime(worker: WorkerInstance): void {
    if (worker.completedAt && worker.startedAt) {
      const duration = worker.completedAt.getTime() - worker.startedAt.getTime();
      this.executionTimes.push(duration);

      // Keep only last 100 for average calculation
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }

      this.stats.avgExecutionTime =
        this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;
    }
  }
}

/**
 * Create a Swarm Orchestrator instance
 */
export function createSwarmOrchestrator(config?: Partial<SwarmConfig>): SwarmOrchestrator {
  return new SwarmOrchestrator(config);
}
