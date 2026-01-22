/**
 * Swarm Runtime Types
 *
 * Defines the architecture for multi-agent orchestration with parallel execution.
 * Implements the "Conductor + Workers" pattern for background task processing.
 */

/**
 * Worker state lifecycle
 */
export type WorkerState = "idle" | "spawning" | "running" | "completed" | "failed" | "cancelled";

/**
 * Worker priority levels
 */
export type WorkerPriority = "high" | "normal" | "low" | "background";

/**
 * Worker task definition
 */
export interface WorkerTask {
  /** Unique task ID */
  id: string;
  /** Task type/name */
  type: string;
  /** Task description for the worker agent */
  prompt: string;
  /** Priority level */
  priority: WorkerPriority;
  /** Parent task ID (if spawned by another worker) */
  parentId?: string;
  /** Context to pass to the worker */
  context?: Record<string, unknown>;
  /** Maximum execution time in ms */
  timeout?: number;
  /** Whether to run in background (invisible to main chat) */
  background?: boolean;
}

/**
 * Worker instance representing a spawned agent
 */
export interface WorkerInstance {
  /** Unique worker ID */
  id: string;
  /** The task this worker is executing */
  task: WorkerTask;
  /** Current state */
  state: WorkerState;
  /** Start timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt?: Date;
  /** Result data (on success) */
  result?: unknown;
  /** Error message (on failure) */
  error?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Current status message */
  statusMessage?: string;
}

/**
 * Swarm event types
 */
export type SwarmEventType =
  | "worker:spawned"
  | "worker:started"
  | "worker:progress"
  | "worker:completed"
  | "worker:failed"
  | "worker:cancelled"
  | "swarm:idle"
  | "swarm:busy";

/**
 * Swarm event payload
 */
export interface SwarmEvent {
  type: SwarmEventType;
  workerId?: string;
  taskId?: string;
  timestamp: Date;
  data?: unknown;
}

/**
 * Event handler for swarm events
 */
export type SwarmEventHandler = (event: SwarmEvent) => void;

/**
 * Swarm orchestrator configuration
 */
export interface SwarmConfig {
  /** Maximum concurrent workers */
  maxConcurrency: number;
  /** Default task timeout in ms */
  defaultTimeout: number;
  /** Whether to enable background workers */
  enableBackground: boolean;
  /** Worker pool size for background tasks */
  backgroundPoolSize: number;
  /**
   * Optional executor callback for running worker tasks.
   * If not provided, workers will be marked complete without execution.
   */
  executor?: WorkerExecutor;
}

/**
 * Worker execution callback.
 * Receives the task and should execute the agent logic.
 * Returns result on success, throws on failure.
 */
export type WorkerExecutor = (task: WorkerTask) => Promise<unknown>;

/**
 * Swarm orchestrator interface
 */
export interface ISwarmOrchestrator {
  /**
   * Spawn a new worker to execute a task
   */
  spawnWorker(task: Omit<WorkerTask, "id">): Promise<string>;

  /**
   * Cancel a running worker
   */
  cancelWorker(workerId: string): Promise<void>;

  /**
   * Get worker instance by ID
   */
  getWorker(workerId: string): WorkerInstance | undefined;

  /**
   * Get all active workers
   */
  getActiveWorkers(): WorkerInstance[];

  /**
   * Get workers by state
   */
  getWorkersByState(state: WorkerState): WorkerInstance[];

  /**
   * Wait for a worker to complete
   */
  waitForWorker(workerId: string): Promise<WorkerInstance>;

  /**
   * Subscribe to swarm events
   */
  onEvent(handler: SwarmEventHandler): () => void;

  /**
   * Get current swarm statistics
   */
  getStats(): SwarmStats;

  /**
   * Shutdown all workers gracefully
   */
  shutdown(): Promise<void>;
}

/**
 * Swarm statistics
 */
export interface SwarmStats {
  /** Total workers spawned (all time) */
  totalSpawned: number;
  /** Currently active workers */
  activeCount: number;
  /** Workers in queue waiting to run */
  queuedCount: number;
  /** Completed workers (current session) */
  completedCount: number;
  /** Failed workers (current session) */
  failedCount: number;
  /** Average execution time in ms */
  avgExecutionTime: number;
}

/**
 * Conductor context for the main agent
 */
export interface ConductorContext {
  /** Spawn a background worker */
  spawnWorker: (task: Omit<WorkerTask, "id" | "background">) => Promise<string>;
  /** Get status of all workers */
  getWorkerStatus: () => WorkerInstance[];
  /** Check if swarm is busy */
  isBusy: () => boolean;
}
