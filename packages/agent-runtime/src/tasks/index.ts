/**
 * Background Tasks Module
 *
 * Async task execution with progress tracking and cancellation.
 */

// Priority Heap (Optimized)
export {
  createPriorityHeap,
  PriorityHeap,
} from "./priorityHeap";
// Task Graph
export type {
  EvictionHandler,
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
} from "./taskGraph";
export {
  createTaskGraphStore,
  createTaskGraphStoreFromSnapshot,
  InvalidStatusTransitionError,
  NodeNotFoundError,
  TaskGraphStore,
} from "./taskGraph";
// Task Queue
export { createTaskQueue, TaskQueue } from "./taskQueue";
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
