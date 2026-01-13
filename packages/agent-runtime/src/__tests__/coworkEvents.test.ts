/**
 * Cowork Event Mapping Tests
 */

import { describe, expect, it } from "vitest";
import { attachCoworkTaskEvents, mapTaskEventToCoworkEvent } from "../cowork/events";
import type { ITaskQueue, TaskEvent, TaskEventHandler } from "../tasks/types";

function createQueueStub(): { queue: ITaskQueue; emit: (event: TaskEvent) => void } {
  const handlers = new Set<TaskEventHandler>();
  const queue = {
    on: (handler: TaskEventHandler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  } as unknown as ITaskQueue;

  return {
    queue,
    emit: (event) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
}

describe("Cowork event mapping", () => {
  it("maps task events to Cowork task events", () => {
    const mapped = mapTaskEventToCoworkEvent({
      type: "task:started",
      taskId: "task-1",
      timestamp: 1,
      data: { step: 1 },
    });

    expect(mapped?.type).toBe("task.running");
    expect(mapped?.taskId).toBe("task-1");
    expect(mapped?.data).toEqual({ step: 1 });
  });

  it("maps timeouts to failed with reason", () => {
    const mapped = mapTaskEventToCoworkEvent({
      type: "task:timeout",
      taskId: "task-2",
      timestamp: 2,
      data: { timeoutMs: 1000 },
    });

    expect(mapped?.type).toBe("task.failed");
    expect(mapped?.data).toMatchObject({ reason: "timeout", timeoutMs: 1000 });
  });

  it("ignores queue-level events", () => {
    const mapped = mapTaskEventToCoworkEvent({
      type: "queue:drained",
      taskId: "queue",
      timestamp: 3,
      data: {},
    });

    expect(mapped).toBeNull();
  });

  it("attaches to queue events", () => {
    const { queue, emit } = createQueueStub();
    const received: string[] = [];

    const unsubscribe = attachCoworkTaskEvents(queue, (event) => {
      received.push(event.type);
    });

    emit({ type: "task:enqueued", taskId: "t1", timestamp: 1, data: {} });
    emit({ type: "task:completed", taskId: "t1", timestamp: 2, data: {} });

    unsubscribe();
    emit({ type: "task:failed", taskId: "t1", timestamp: 3, data: {} });

    expect(received).toEqual(["task.queued", "task.completed"]);
  });
});
