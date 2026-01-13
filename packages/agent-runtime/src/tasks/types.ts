/**
 * Background Tasks Types
 *
 * Type definitions for async task execution with progress tracking.
 */

// ============================================================================
// Task Configuration
// ============================================================================

/**
 * Task priority levels.
 */
export type TaskPriority = "low" | "normal" | "high" | "critical";

/**
 * Task status.
 */
export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

/**
 * Task type.
 */
export type TaskType = "agent" | "tool" | "pipeline" | "custom";

/**
 * Configuration for the task queue.
 */
export interface TaskQueueConfig {
  /** Maximum concurrent tasks */
  maxConcurrent: number;

  /** Default timeout for tasks (ms) */
  defaultTimeout: number;

  /** Maximum queue size */
  maxQueueSize: number;

  /** Enable task persistence */
  persistTasks: boolean;

  /** Retry configuration */
  retry: {
    enabled: boolean;
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };
}

/**
 * Default task queue configuration.
 */
export const DEFAULT_TASK_QUEUE_CONFIG: TaskQueueConfig = {
  maxConcurrent: 3,
  defaultTimeout: 300000, // 5 minutes
  maxQueueSize: 100,
  persistTasks: false,
  retry: {
    enabled: true,
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
  },
};

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task definition for enqueuing.
 */
export interface TaskDefinition<TPayload = unknown> {
  /** Task type */
  type: TaskType;

  /** Task name for display */
  name: string;

  /** Task payload */
  payload: TPayload;

  /** Priority */
  priority?: TaskPriority;

  /** Timeout override (ms) */
  timeout?: number;

  /** Retry count override */
  retries?: number;

  /** Tags for filtering */
  tags?: string[];

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A queued/running task.
 */
export interface Task<TPayload = unknown, TResult = unknown> {
  /** Unique task ID */
  id: string;

  /** Task type */
  type: TaskType;

  /** Task name */
  name: string;

  /** Task payload */
  payload: TPayload;

  /** Current status */
  status: TaskStatus;

  /** Priority */
  priority: TaskPriority;

  /** Progress (0-100) */
  progress: number;

  /** Progress message */
  progressMessage?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Queue timestamp */
  queuedAt?: number;

  /** Start timestamp */
  startedAt?: number;

  /** Completion timestamp */
  completedAt?: number;

  /** Result (if completed) */
  result?: TResult;

  /** Error (if failed) */
  error?: string;

  /** Retry count */
  retryCount: number;

  /** Maximum retries */
  maxRetries: number;

  /** Timeout (ms) */
  timeout: number;

  /** Tags */
  tags: string[];

  /** Parent task ID (for subtasks) */
  parentId?: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task result.
 */
export interface TaskResult<T = unknown> {
  /** Task ID */
  taskId: string;

  /** Success status */
  success: boolean;

  /** Result value */
  value?: T;

  /** Error if failed */
  error?: string;

  /** Duration in ms */
  durationMs: number;

  /** Retry count */
  retries: number;
}

// ============================================================================
// Task Queue Interface
// ============================================================================

/**
 * Interface for task queue operations.
 */
export interface ITaskQueue {
  /** Register a task executor */
  registerExecutor<TPayload, TResult>(
    type: TaskType,
    executor: ITaskExecutor<TPayload, TResult>
  ): void;

  /** Enqueue a task */
  enqueue<TPayload, _TResult>(definition: TaskDefinition<TPayload>): Promise<string>;

  /** Cancel a task */
  cancel(taskId: string): Promise<boolean>;

  /** Pause a task */
  pause(taskId: string): Promise<boolean>;

  /** Resume a paused task */
  resume(taskId: string): Promise<boolean>;

  /** Get task by ID */
  getTask<TPayload = unknown, TResult = unknown>(
    taskId: string
  ): Task<TPayload, TResult> | undefined;

  /** Get task status */
  getStatus(taskId: string): TaskStatus | undefined;

  /** List tasks */
  listTasks(filter?: TaskFilter): Task[];

  /** Subscribe to task progress */
  onProgress(taskId: string, handler: ProgressHandler): () => void;

  /** Subscribe to task completion */
  onComplete<TResult = unknown>(taskId: string, handler: CompleteHandler<TResult>): () => void;

  /** Subscribe to task events */
  on(handler: TaskEventHandler): () => void;

  /** Wait for task completion */
  waitFor<TResult = unknown>(taskId: string): Promise<TaskResult<TResult>>;

  /** Get queue statistics */
  getStats(): TaskQueueStats;

  /** Drain the queue (wait for all tasks to complete) */
  drain(): Promise<void>;

  /** Clear completed tasks */
  clearCompleted(): number;
}

// ============================================================================
// Task Executor Interface
// ============================================================================

/**
 * Interface for task executors.
 */
export interface ITaskExecutor<TPayload = unknown, TResult = unknown> {
  /** Execute the task */
  execute(payload: TPayload, context: TaskExecutionContext): Promise<TResult>;

  /** Check if can handle task type */
  canHandle(type: TaskType): boolean;
}

/**
 * Context provided to task executors.
 */
export interface TaskExecutionContext {
  /** Task ID */
  taskId: string;

  /** Abort signal */
  signal: AbortSignal;

  /** Report progress */
  reportProgress(progress: number, message?: string): void;

  /** Check if cancelled */
  isCancelled(): boolean;

  /** Get metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Progress update handler.
 */
export type ProgressHandler = (progress: number, message?: string) => void;

/**
 * Completion handler.
 */
export type CompleteHandler<TResult = unknown> = (result: TaskResult<TResult>) => void;

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Task filter for listing.
 */
export interface TaskFilter {
  /** Filter by status */
  status?: TaskStatus | TaskStatus[];

  /** Filter by type */
  type?: TaskType | TaskType[];

  /** Filter by priority */
  priority?: TaskPriority | TaskPriority[];

  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by parent ID */
  parentId?: string;

  /** Created after timestamp */
  createdAfter?: number;

  /** Created before timestamp */
  createdBefore?: number;

  /** Limit results */
  limit?: number;

  /** Sort by field */
  sortBy?: "createdAt" | "priority" | "status";

  /** Sort order */
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Task queue statistics.
 */
export interface TaskQueueStats {
  /** Total tasks */
  total: number;

  /** Tasks by status */
  byStatus: Record<TaskStatus, number>;

  /** Tasks by type */
  byType: Record<TaskType, number>;

  /** Tasks by priority */
  byPriority: Record<TaskPriority, number>;

  /** Currently running */
  running: number;

  /** Waiting in queue */
  queued: number;

  /** Average wait time (ms) */
  averageWaitTime: number;

  /** Average execution time (ms) */
  averageExecutionTime: number;

  /** Total completed */
  completed: number;

  /** Total failed */
  failed: number;

  /** Total cancelled */
  cancelled: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Task queue events.
 */
export type TaskEventType =
  | "task:enqueued"
  | "task:started"
  | "task:progress"
  | "task:completed"
  | "task:failed"
  | "task:cancelled"
  | "task:timeout"
  | "task:retry"
  | "queue:drained"
  | "queue:full";

/**
 * Task event payload.
 */
export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  timestamp: number;
  data: unknown;
}

/**
 * Task event handler.
 */
export type TaskEventHandler = (event: TaskEvent) => void;
