/**
 * Background Tasks Module
 *
 * Async task execution with progress tracking and cancellation.
 */

// Types
export type {
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

export { DEFAULT_TASK_QUEUE_CONFIG } from "./types";

// Task Graph
export type {
  TaskGraphConfig,
  TaskGraphEdge,
  TaskGraphEvent,
  TaskGraphEventContext,
  TaskGraphEventMeta,
  TaskGraphEventType,
  TaskGraphNode,
  TaskGraphNodeInput,
  TaskGraphNodeUpdate,
  TaskGraphSnapshot,
  TaskGraphStats,
  TaskNodeStatus,
  TaskNodeType,
  EvictionHandler,
} from "./taskGraph";
export {
  TaskGraphStore,
  NodeNotFoundError,
  InvalidStatusTransitionError,
  createTaskGraphStore,
  createTaskGraphStoreFromSnapshot,
} from "./taskGraph";

// Task Queue
export { TaskQueue, createTaskQueue } from "./taskQueue";

// Priority Heap (Optimized)
export {
  PriorityHeap,
  createPriorityHeap,
} from "./priorityHeap";
