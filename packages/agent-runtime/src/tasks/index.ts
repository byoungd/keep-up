/**
 * Background Tasks Module
 *
 * Async task execution with progress tracking and cancellation.
 */

// Types
export type {
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

export { DEFAULT_TASK_QUEUE_CONFIG } from "./types";

// Task Queue
export { TaskQueue, createTaskQueue } from "./taskQueue";

// Priority Heap (Optimized)
export {
  PriorityHeap,
  createPriorityHeap,
} from "./priorityHeap";
