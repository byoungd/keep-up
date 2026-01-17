/**
 * Task Graph Tests
 */

import { describe, expect, it, vi } from "vitest";
import {
  createTaskGraphStore,
  createTaskGraphStoreFromSnapshot,
  InvalidStatusTransitionError,
  NodeNotFoundError,
} from "../tasks/taskGraph";

const createIdFactory = (prefix = "id") => {
  let index = 0;
  return () => `${prefix}-${++index}`;
};

const fixedNow = () => "2026-01-14T00:00:00.000Z";

describe("TaskGraphStore", () => {
  describe("basic operations", () => {
    it("creates nodes and records events", () => {
      const graph = createTaskGraphStore({
        graphId: "graph-1",
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      const node = graph.createNode({
        type: "plan",
        title: "Create plan",
      });

      expect(node).toEqual(
        expect.objectContaining({
          id: "n-1",
          status: "pending",
          title: "Create plan",
        })
      );

      const events = graph.listEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          id: "n-2",
          nodeId: "n-1",
          type: "node_created",
        })
      );
    });

    it("validates status transitions", () => {
      const graph = createTaskGraphStore({
        graphId: "graph-1",
        idFactory: createIdFactory("n"),
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
      }).toThrow(InvalidStatusTransitionError);
    });

    it("records custom node events", () => {
      const graph = createTaskGraphStore({
        graphId: "graph-1",
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      const node = graph.createNode({
        type: "tool_call",
        title: "Execute tool",
      });

      graph.recordNodeEvent(node.id, "policy_decision", { decisionId: "d-1" });

      const events = graph.listEvents();
      expect(events.map((event) => event.type)).toContain("policy_decision");
    });

    it("throws NodeNotFoundError for missing nodes", () => {
      const graph = createTaskGraphStore();
      expect(() => graph.updateNodeStatus("nonexistent", "running")).toThrow(NodeNotFoundError);
    });

    it("restores snapshots deterministically", () => {
      const graph = createTaskGraphStore({
        graphId: "graph-1",
        idFactory: createIdFactory("n"),
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

      expect(restored.getSnapshot().nodes).toEqual(snapshot.nodes);
      expect(restored.getSnapshot().edges).toEqual(snapshot.edges);
    });
  });

  describe("LRU eviction", () => {
    it("evicts least recently accessed completed nodes when maxNodes exceeded", () => {
      const graph = createTaskGraphStore({
        maxNodes: 3,
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      // Create 3 nodes
      const node1 = graph.createNode({ type: "tool_call", title: "Task 1" });
      const node2 = graph.createNode({ type: "tool_call", title: "Task 2" });
      const node3 = graph.createNode({ type: "tool_call", title: "Task 3" });

      // Complete node1 and node2 (making them eligible for eviction)
      graph.updateNodeStatus(node1.id, "running");
      graph.updateNodeStatus(node1.id, "completed");
      graph.updateNodeStatus(node2.id, "running");
      graph.updateNodeStatus(node2.id, "completed");

      // Access node2 to make it more recent
      graph.getNode(node2.id);

      // Create a new node, triggering eviction of node1 (LRU completed)
      graph.createNode({ type: "tool_call", title: "Task 4" });

      const stats = graph.getStats();
      expect(stats.evictedNodeCount).toBe(1);
      expect(graph.getNode(node1.id)).toBeUndefined();
      expect(graph.getNode(node2.id)).toBeDefined();
      expect(graph.getNode(node3.id)).toBeDefined();
    });

    it("does not evict running or pending nodes", () => {
      const graph = createTaskGraphStore({
        maxNodes: 2,
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      const node1 = graph.createNode({ type: "tool_call", title: "Task 1" });
      const node2 = graph.createNode({ type: "tool_call", title: "Task 2" });
      graph.updateNodeStatus(node1.id, "running");

      // Both nodes are non-terminal, no eviction should occur
      graph.createNode({ type: "tool_call", title: "Task 3" });

      expect(graph.getStats().evictedNodeCount).toBe(0);
      expect(graph.getNode(node1.id)).toBeDefined();
      expect(graph.getNode(node2.id)).toBeDefined();
    });

    it("calls eviction handlers", () => {
      const handler = vi.fn();
      const graph = createTaskGraphStore({
        maxNodes: 2,
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      graph.onEviction(handler);

      const node1 = graph.createNode({ type: "tool_call", title: "Task 1" });
      graph.updateNodeStatus(node1.id, "running");
      graph.updateNodeStatus(node1.id, "completed");
      graph.createNode({ type: "tool_call", title: "Task 2" });
      graph.createNode({ type: "tool_call", title: "Task 3" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: node1.id }));
    });

    it("allows unsubscribing from eviction handler", () => {
      const handler = vi.fn();
      const graph = createTaskGraphStore({
        maxNodes: 2,
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      const unsubscribe = graph.onEviction(handler);
      unsubscribe();

      const node1 = graph.createNode({ type: "tool_call", title: "Task 1" });
      graph.updateNodeStatus(node1.id, "running");
      graph.updateNodeStatus(node1.id, "completed");
      graph.createNode({ type: "tool_call", title: "Task 2" });
      graph.createNode({ type: "tool_call", title: "Task 3" });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("event log compaction", () => {
    it("compacts events when threshold is exceeded and events exceed target size", () => {
      // maxEvents=10, targetSize=8, compactionThreshold=5
      // Need 9+ events to actually remove any
      const graph = createTaskGraphStore({
        maxEvents: 10,
        compactionThreshold: 5,
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      // Create 5 nodes with status updates = 15 events, triggering compaction
      for (let i = 0; i < 5; i++) {
        const node = graph.createNode({ type: "tool_call", title: `Task ${i}` });
        graph.updateNodeStatus(node.id, "running");
        graph.updateNodeStatus(node.id, "completed");
      }

      const stats = graph.getStats();
      // Multiple compactions should have occurred
      expect(stats.compactionCount).toBeGreaterThan(0);
      // Final event count should be bounded
      expect(stats.eventCount).toBeLessThanOrEqual(12);
    });

    it("triggers compaction when events exceed maxEvents", () => {
      const graph = createTaskGraphStore({
        maxEvents: 6,
        compactionThreshold: 100, // High threshold so only maxEvents triggers
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      // Create 4 nodes with status updates = 12 events
      for (let i = 0; i < 4; i++) {
        const node = graph.createNode({ type: "tool_call", title: `Task ${i}` });
        graph.updateNodeStatus(node.id, "running");
        graph.updateNodeStatus(node.id, "completed");
      }

      const stats = graph.getStats();
      // Auto-compaction should have occurred (12 > maxEvents 6)
      expect(stats.compactionCount).toBeGreaterThan(0);
      // Events should be bounded (target is 80% of 6 = ~5)
      expect(stats.eventCount).toBeLessThanOrEqual(8);
    });
  });

  describe("event sequencing", () => {
    it("assigns monotonically increasing sequenceIds", () => {
      const graph = createTaskGraphStore({
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });
      const node1 = graph.createNode({ type: "plan", title: "Test 1" });
      graph.createNode({ type: "tool_call", title: "Test 2" });
      graph.updateNodeStatus(node1.id, "running");

      const events = graph.listEvents();
      expect(events.length).toBeGreaterThan(0);

      let lastSeq = 0;
      for (const event of events) {
        expect(event.sequenceId).toBeGreaterThan(lastSeq);
        lastSeq = event.sequenceId;
      }
    });

    it("restores sequence counter from snapshot", () => {
      const graph = createTaskGraphStore({
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });
      graph.createNode({ type: "plan", title: "Test 1" });

      const snapshot = graph.getSnapshot();
      const lastSeq = snapshot.events[snapshot.events.length - 1].sequenceId;

      const restored = createTaskGraphStoreFromSnapshot(snapshot);
      restored.createNode({ type: "plan", title: "Test 2" });

      const newEvents = restored.listEvents();
      const lastNewEvent = newEvents[newEvents.length - 1];

      expect(lastNewEvent.sequenceId).toBe(lastSeq + 1);
    });
  });

  describe("stats", () => {
    it("tracks node, edge, and event counts", () => {
      const graph = createTaskGraphStore({
        idFactory: createIdFactory("n"),
        now: fixedNow,
      });

      const node1 = graph.createNode({ type: "plan", title: "Plan" });
      const node2 = graph.createNode({ type: "subtask", title: "Subtask" });
      graph.addEdge({ from: node2.id, to: node1.id, type: "depends_on" });

      const stats = graph.getStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.eventCount).toBe(3); // 2 node_created + 1 edge
    });
  });
});
