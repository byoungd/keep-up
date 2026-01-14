/**
 * Task Graph Tests
 */

import { describe, expect, it } from "vitest";
import { createTaskGraphStore, createTaskGraphStoreFromSnapshot } from "../tasks/taskGraph";

const createIdFactory = (ids: string[]) => {
  let index = 0;
  return () => {
    const next = ids[index];
    if (!next) {
      throw new Error("No more ids available");
    }
    index += 1;
    return next;
  };
};

const fixedNow = () => "2026-01-14T00:00:00.000Z";

describe("TaskGraphStore", () => {
  it("creates nodes and records events", () => {
    const graph = createTaskGraphStore({
      graphId: "graph-1",
      idFactory: createIdFactory(["node-1", "event-1"]),
      now: fixedNow,
    });

    const node = graph.createNode({
      type: "plan",
      title: "Create plan",
    });

    expect(node).toEqual(
      expect.objectContaining({
        id: "node-1",
        status: "pending",
        title: "Create plan",
      })
    );

    const events = graph.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        id: "event-1",
        nodeId: "node-1",
        type: "node_created",
      })
    );
  });

  it("validates status transitions", () => {
    const graph = createTaskGraphStore({
      graphId: "graph-1",
      idFactory: createIdFactory(["node-1", "event-1", "event-2", "event-3"]),
      now: fixedNow,
    });

    const node = graph.createNode({
      type: "subtask",
      title: "Run subtask",
    });

    graph.updateNodeStatus(node.id, "running");
    graph.updateNodeStatus(node.id, "completed");

    const eventTypes = graph.listEvents().map((event) => event.type);
    expect(eventTypes).toEqual(["node_created", "node_started", "node_completed"]);

    expect(() => {
      graph.updateNodeStatus(node.id, "running");
    }).toThrowError("Invalid status transition from completed to running");
  });

  it("restores snapshots deterministically", () => {
    const graph = createTaskGraphStore({
      graphId: "graph-1",
      idFactory: createIdFactory(["node-1", "event-1", "node-2", "event-2", "event-3", "event-4"]),
      now: fixedNow,
    });

    const planNode = graph.createNode({
      type: "plan",
      title: "Plan work",
    });
    const taskNode = graph.createNode({
      type: "subtask",
      title: "Execute work",
    });

    graph.addEdge({ from: taskNode.id, to: planNode.id, type: "depends_on" });
    graph.updateNodeStatus(taskNode.id, "running");

    const snapshot = graph.getSnapshot();
    const restored = createTaskGraphStoreFromSnapshot(snapshot, { now: fixedNow });

    expect(restored.getSnapshot()).toEqual(snapshot);
  });
});
