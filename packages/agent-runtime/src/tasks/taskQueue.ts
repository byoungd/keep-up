/**
 * Task Queue Implementation
 *
 * Priority-based task queue with concurrency control.
 */

import { createPriorityHeap, type PriorityHeap } from "./priorityHeap";
import type {
  CancelReason,
  CompleteHandler,
  ITaskExecutor,
  ITaskQueue,
  ProgressHandler,
  Task,
  TaskDefinition,
  TaskEvent,
  TaskEventHandler,
  TaskEventType,
  TaskExecutionContext,
  TaskFilter,
  TaskPriority,
  TaskQueueConfig,
  TaskQueueStats,
  TaskResult,
  TaskStatus,
  TaskType,
} from "./types";
import { DEFAULT_TASK_QUEUE_CONFIG } from "./types";

// ============================================================================
// Task Queue Implementation
// ============================================================================

/**
 * Background task queue with priority scheduling.
 */
export class TaskQueue implements ITaskQueue {
  private readonly config: TaskQueueConfig;
  private readonly tasks = new Map<string, Task>();
  private readonly executors = new Map<TaskType, ITaskExecutor>();
  private readonly progressHandlers = new Map<string, Set<ProgressHandler>>();
  private readonly completeHandlers = new Map<string, Set<CompleteHandler>>();
  private readonly eventHandlers = new Set<TaskEventHandler>();
  private readonly abortControllers = new Map<string, AbortController>();

  private heap: PriorityHeap; // Optimized priority queue
  private runningCount = 0;
  private taskCounter = 0;
  private drainPromise?: Promise<void>;
  private drainResolve?: () => void;

  constructor(config: Partial<TaskQueueConfig> = {}) {
    this.config = { ...DEFAULT_TASK_QUEUE_CONFIG, ...config };
    this.heap = createPriorityHeap();
  }

  /**
   * Register a task executor.
   */
  registerExecutor<TPayload, TResult>(
    type: TaskType,
    executor: ITaskExecutor<TPayload, TResult>
  ): void {
    this.executors.set(type, executor as ITaskExecutor);
  }

  /**
   * Enqueue a task.
   */
  async enqueue<TPayload, TResult>(definition: TaskDefinition<TPayload>): Promise<string> {
    if (this.heap.size >= this.config.maxQueueSize) {
      this.emit("queue:full", "queue", { size: this.heap.size });
      throw new Error("Task queue is full");
    }

    const taskId = this.generateTaskId();
    const priority = definition.priority ?? "normal";

    const task: Task<TPayload, TResult> = {
      id: taskId,
      type: definition.type,
      name: definition.name,
      payload: definition.payload,
      status: "pending",
      priority,
      progress: 0,
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: definition.retries ?? this.config.retry.maxRetries,
      timeout: definition.timeout ?? this.config.defaultTimeout,
      tags: definition.tags ?? [],
      metadata: definition.metadata,
    };

    this.tasks.set(taskId, task as Task);

    // Insert into priority heap (O(log n))
    this.heap.insert(task as Task);
    task.status = "queued";
    task.queuedAt = Date.now();

    this.emit("task:enqueued", taskId, { task });

    // Try to process queue
    this.processQueue();

    return taskId;
  }

  /**
   * Cancel a task.
   */
  async cancel(taskId: string, reason: CancelReason = "user_cancelled"): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === "running") {
      const controller = this.abortControllers.get(taskId);
      controller?.abort();
    }

    if (
      task.status === "pending" ||
      task.status === "queued" ||
      task.status === "running" ||
      task.status === "paused"
    ) {
      task.status = "cancelled";
      task.cancelReason = reason;
      task.completedAt = Date.now();
      task.error = this.formatCancelMessage(reason);

      // Remove from heap
      this.heap.remove(taskId);

      this.emit("task:cancelled", taskId, { task, reason });
      this.notifyComplete(taskId, {
        taskId,
        success: false,
        error: task.error,
        durationMs: task.completedAt - (task.startedAt ?? task.createdAt),
        retries: task.retryCount,
      });

      return true;
    }

    return false;
  }

  /**
   * Format a human-readable cancellation message.
   */
  private formatCancelMessage(reason: CancelReason): string {
    switch (reason) {
      case "user_cancelled":
        return "Task was cancelled by user";
      case "approval_timeout":
        return "Task cancelled: confirmation request timed out";
      case "approval_rejected":
        return "Task cancelled: user rejected the confirmation";
      case "execution_timeout":
        return "Task cancelled: execution exceeded timeout limit";
      case "signal_aborted":
        return "Task cancelled: abort signal received";
      case "queue_full":
        return "Task cancelled: queue capacity exceeded";
      case "executor_missing":
        return "Task cancelled: no executor registered for this task type";
      case "parent_cancelled":
        return "Task cancelled: parent task was cancelled";
      default:
        return "Task was cancelled";
    }
  }

  /**
   * Pause a task.
   */
  async pause(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "queued") {
      return false;
    }

    task.status = "paused";
    this.heap.remove(taskId);
    return true;
  }

  /**
   * Resume a paused task.
   */
  async resume(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "paused") {
      return false;
    }

    task.status = "queued";
    this.heap.insert(task);
    this.processQueue();
    return true;
  }

  /**
   * Get task by ID.
   */
  getTask<TPayload = unknown, TResult = unknown>(
    taskId: string
  ): Task<TPayload, TResult> | undefined {
    return this.tasks.get(taskId) as Task<TPayload, TResult> | undefined;
  }

  /**
   * Get task status.
   */
  getStatus(taskId: string): TaskStatus | undefined {
    return this.tasks.get(taskId)?.status;
  }

  /**
   * List tasks with optional filter.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filter supports multiple optional criteria and sorting options
  listTasks(filter?: TaskFilter): Task[] {
    let results = Array.from(this.tasks.values());

    if (filter) {
      // Apply filters
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        results = results.filter((t) => statuses.includes(t.status));
      }

      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        results = results.filter((t) => types.includes(t.type));
      }

      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        results = results.filter((t) => priorities.includes(t.priority));
      }

      if (filter.tags && filter.tags.length > 0) {
        results = results.filter((t) => filter.tags?.some((tag) => t.tags.includes(tag)));
      }

      if (filter.parentId) {
        results = results.filter((t) => t.parentId === filter.parentId);
      }

      if (filter.createdAfter !== undefined) {
        const createdAfter = filter.createdAfter;
        results = results.filter((t) => t.createdAt >= createdAfter);
      }

      if (filter.createdBefore !== undefined) {
        const createdBefore = filter.createdBefore;
        results = results.filter((t) => t.createdAt <= createdBefore);
      }

      // Sort
      const sortBy = filter.sortBy ?? "createdAt";
      const sortOrder = filter.sortOrder ?? "desc";

      results.sort((a, b) => {
        let cmp = 0;
        if (sortBy === "createdAt") {
          cmp = a.createdAt - b.createdAt;
        } else if (sortBy === "priority") {
          const priorityOrder: Record<TaskPriority, number> = {
            critical: 4,
            high: 3,
            normal: 2,
            low: 1,
          };
          cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
        } else if (sortBy === "status") {
          cmp = a.status.localeCompare(b.status);
        }
        return sortOrder === "asc" ? cmp : -cmp;
      });

      // Limit
      if (filter.limit) {
        results = results.slice(0, filter.limit);
      }
    }

    return results;
  }

  /**
   * Subscribe to task progress.
   */
  onProgress(taskId: string, handler: ProgressHandler): () => void {
    let handlers = this.progressHandlers.get(taskId);
    if (!handlers) {
      handlers = new Set();
      this.progressHandlers.set(taskId, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * Subscribe to task completion.
   */
  onComplete<TResult = unknown>(taskId: string, handler: CompleteHandler<TResult>): () => void {
    let handlers = this.completeHandlers.get(taskId);
    if (!handlers) {
      handlers = new Set();
      this.completeHandlers.set(taskId, handlers);
    }
    handlers.add(handler as CompleteHandler);

    return () => {
      handlers?.delete(handler as CompleteHandler);
    };
  }

  /**
   * Wait for task completion.
   */
  waitFor<TResult = unknown>(taskId: string): Promise<TaskResult<TResult>> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return Promise.reject(new Error(`Task ${taskId} not found`));
    }

    if (
      task.status === "completed" ||
      task.status === "failed" ||
      task.status === "cancelled" ||
      task.status === "timeout"
    ) {
      return Promise.resolve({
        taskId,
        success: task.status === "completed",
        value: task.result as TResult,
        error: task.error,
        durationMs: (task.completedAt ?? Date.now()) - (task.startedAt ?? task.createdAt),
        retries: task.retryCount,
      });
    }

    return new Promise((resolve) => {
      this.onComplete<TResult>(taskId, resolve);
    });
  }

  /**
   * Subscribe to queue events.
   */
  on(handler: TaskEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Get queue statistics.
   */
  getStats(): TaskQueueStats {
    const stats: TaskQueueStats = {
      total: this.tasks.size,
      byStatus: {
        pending: 0,
        queued: 0,
        running: 0,
        paused: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        timeout: 0,
      },
      byType: {
        agent: 0,
        tool: 0,
        pipeline: 0,
        custom: 0,
      },
      byPriority: {
        low: 0,
        normal: 0,
        high: 0,
        critical: 0,
      },
      running: this.runningCount,
      queued: this.heap.size,
      averageWaitTime: 0,
      averageExecutionTime: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    let totalWaitTime = 0;
    let totalExecTime = 0;
    let waitCount = 0;
    let execCount = 0;

    for (const task of this.tasks.values()) {
      stats.byStatus[task.status]++;
      stats.byType[task.type]++;
      stats.byPriority[task.priority]++;

      if (task.queuedAt && task.startedAt) {
        totalWaitTime += task.startedAt - task.queuedAt;
        waitCount++;
      }

      if (task.startedAt && task.completedAt) {
        totalExecTime += task.completedAt - task.startedAt;
        execCount++;
      }
    }

    stats.completed = stats.byStatus.completed;
    stats.failed = stats.byStatus.failed;
    stats.cancelled = stats.byStatus.cancelled;
    stats.averageWaitTime = waitCount > 0 ? totalWaitTime / waitCount : 0;
    stats.averageExecutionTime = execCount > 0 ? totalExecTime / execCount : 0;

    return stats;
  }

  /**
   * Wait for all tasks to complete.
   */
  async drain(): Promise<void> {
    if (this.heap.isEmpty && this.runningCount === 0) {
      return;
    }

    if (!this.drainPromise) {
      this.drainPromise = new Promise((resolve) => {
        this.drainResolve = resolve;
      });
    }

    return this.drainPromise;
  }

  /**
   * Clear completed tasks.
   */
  clearCompleted(): number {
    let cleared = 0;
    for (const [id, task] of this.tasks) {
      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled" ||
        task.status === "timeout"
      ) {
        this.tasks.delete(id);
        this.progressHandlers.delete(id);
        this.completeHandlers.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateTaskId(): string {
    return `task-${Date.now().toString(36)}-${(++this.taskCounter).toString(36)}`;
  }

  private processQueue(): void {
    while (this.runningCount < this.config.maxConcurrent && !this.heap.isEmpty) {
      const task = this.heap.extract();
      if (task) {
        this.executeTask(task.id);
      }
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: task execution handles retries, timeouts, and callbacks in one flow
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const executor = this.executors.get(task.type);
    if (!executor) {
      task.status = "failed";
      task.error = `No executor registered for task type: ${task.type}`;
      task.completedAt = Date.now();
      this.notifyComplete(taskId, {
        taskId,
        success: false,
        error: task.error,
        durationMs: 0,
        retries: task.retryCount,
      });
      return;
    }

    this.runningCount++;
    task.status = "running";
    task.startedAt = Date.now();

    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    // Set timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      task.status = "timeout";
    }, task.timeout);

    const context: TaskExecutionContext = {
      taskId,
      signal: abortController.signal,
      reportProgress: (progress: number, message?: string) => {
        task.progress = Math.min(100, Math.max(0, progress));
        task.progressMessage = message;
        this.notifyProgress(taskId, progress, message);
        this.emit("task:progress", taskId, { progress, message });
      },
      isCancelled: () => abortController.signal.aborted,
      metadata: task.metadata ?? {},
    };

    this.emit("task:started", taskId, { task });

    try {
      const result = await executor.execute(task.payload, context);

      clearTimeout(timeoutId);

      if (
        (task.status as TaskStatus) !== "cancelled" &&
        (task.status as TaskStatus) !== "timeout"
      ) {
        task.status = "completed";
        task.result = result;
        task.progress = 100;
        task.completedAt = Date.now();

        this.emit("task:completed", taskId, { task, result });
        const durationMs = task.startedAt !== undefined ? task.completedAt - task.startedAt : 0;
        this.notifyComplete(taskId, {
          taskId,
          success: true,
          value: result,
          durationMs,
          retries: task.retryCount,
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);

      if ((task.status as TaskStatus) === "timeout") {
        task.cancelReason = "execution_timeout";
        task.error = this.formatCancelMessage("execution_timeout");
        this.emit("task:timeout", taskId, { task });
        this.notifyComplete(taskId, {
          taskId,
          success: false,
          error: task.error,
          durationMs: task.startedAt !== undefined ? Date.now() - task.startedAt : 0,
          retries: task.retryCount,
        });
      } else if (abortController.signal.aborted && (task.status as TaskStatus) !== "cancelled") {
        task.status = "cancelled";
        task.cancelReason = "signal_aborted";
        task.error = this.formatCancelMessage("signal_aborted");
        task.completedAt = Date.now();
        this.emit("task:cancelled", taskId, { task, reason: "signal_aborted" });
        this.notifyComplete(taskId, {
          taskId,
          success: false,
          error: task.error,
          durationMs: task.startedAt !== undefined ? task.completedAt - task.startedAt : 0,
          retries: task.retryCount,
        });
      } else {
        // Check for retry
        if (this.config.retry.enabled && task.retryCount < task.maxRetries) {
          task.retryCount++;
          task.status = "queued";
          task.progress = 0;

          const backoff =
            this.config.retry.backoffMs *
            this.config.retry.backoffMultiplier ** (task.retryCount - 1);

          this.emit("task:retry", taskId, {
            task,
            retryCount: task.retryCount,
            backoffMs: backoff,
          });

          setTimeout(() => {
            this.heap.insert(task);
            this.processQueue();
          }, backoff);
        } else {
          task.status = "failed";
          task.error = errorMessage;
          task.completedAt = Date.now();

          this.emit("task:failed", taskId, { task, error: errorMessage });
          const durationMs = task.startedAt !== undefined ? task.completedAt - task.startedAt : 0;
          this.notifyComplete(taskId, {
            taskId,
            success: false,
            error: errorMessage,
            durationMs,
            retries: task.retryCount,
          });
        }
      }
    } finally {
      this.runningCount--;
      this.abortControllers.delete(taskId);

      // Check if drained
      if (this.heap.isEmpty && this.runningCount === 0) {
        this.emit("queue:drained", "queue", {});
        this.drainResolve?.();
        this.drainPromise = undefined;
        this.drainResolve = undefined;
      }

      // Process next task
      this.processQueue();
    }
  }

  private notifyProgress(taskId: string, progress: number, message?: string): void {
    const handlers = this.progressHandlers.get(taskId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(progress, message);
        } catch {
          // Don't let handler errors break the queue
        }
      }
    }
  }

  private notifyComplete(taskId: string, result: TaskResult): void {
    const handlers = this.completeHandlers.get(taskId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(result);
        } catch {
          // Don't let handler errors break the queue
        }
      }
    }
  }

  private emit(type: TaskEventType, taskId: string, data: unknown): void {
    const event: TaskEvent = {
      type,
      taskId,
      timestamp: Date.now(),
      data,
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Don't let handler errors break the queue
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a task queue.
 */
export function createTaskQueue(config?: Partial<TaskQueueConfig>): TaskQueue {
  return new TaskQueue(config);
}
