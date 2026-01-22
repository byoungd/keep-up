/**
 * Cowork Task Event Mapping
 *
 * Adapts task queue events to Cowork event vocabulary.
 */

import type { ITaskQueue, TaskEvent, TaskEventType } from "../tasks/types";

export type CoworkTaskEventType =
  | "task.queued"
  | "task.planning"
  | "task.plan_ready"
  | "task.running"
  | "task.confirmation_required"
  | "task.confirmation_received"
  | "task.progress"
  | "task.completed"
  | "task.failed"
  | "task.cancelled";

export interface CoworkTaskEvent {
  type: CoworkTaskEventType;
  taskId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export type CoworkTaskEventHandler = (event: CoworkTaskEvent) => void;

export function mapTaskEventToCoworkEvent(event: TaskEvent): CoworkTaskEvent | null {
  const base = {
    taskId: event.taskId,
    timestamp: event.timestamp,
  };

  switch (event.type) {
    case "task:enqueued":
      return { ...base, type: "task.queued", data: event.data as Record<string, unknown> };
    case "task:started":
      return { ...base, type: "task.running", data: event.data as Record<string, unknown> };
    case "task:progress":
      return { ...base, type: "task.progress", data: event.data as Record<string, unknown> };
    case "task:completed":
      return { ...base, type: "task.completed", data: event.data as Record<string, unknown> };
    case "task:failed":
      return { ...base, type: "task.failed", data: event.data as Record<string, unknown> };
    case "task:cancelled":
      return { ...base, type: "task.cancelled", data: event.data as Record<string, unknown> };
    case "task:timeout":
      return {
        ...base,
        type: "task.failed",
        data: { ...(event.data as Record<string, unknown>), reason: "timeout" },
      };
    case "task:retry":
      return {
        ...base,
        type: "task.progress",
        data: { ...(event.data as Record<string, unknown>), retry: true },
      };
    default:
      return null;
  }
}

export function attachCoworkTaskEvents(
  queue: ITaskQueue,
  handler: CoworkTaskEventHandler
): () => void {
  return queue.on((event) => {
    const mapped = mapTaskEventToCoworkEvent(event);
    if (mapped) {
      handler(mapped);
    }
  });
}

export function isTaskEventType(value: string): value is TaskEventType {
  return (
    value === "task:enqueued" ||
    value === "task:started" ||
    value === "task:progress" ||
    value === "task:completed" ||
    value === "task:failed" ||
    value === "task:cancelled" ||
    value === "task:timeout" ||
    value === "task:retry" ||
    value === "queue:drained" ||
    value === "queue:full"
  );
}
