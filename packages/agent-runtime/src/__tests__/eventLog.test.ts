/**
 * Event Log Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createCompletionEvent,
  createErrorEvent,
  createEventLogManager,
  createToolCallEndEvent,
  createToolCallStartEvent,
  createTurnEndEvent,
  createTurnStartEvent,
  type EventLogManager,
} from "../checkpoint/eventLog";

describe("EventLogManager", () => {
  let eventLog: EventLogManager;

  beforeEach(() => {
    eventLog = createEventLogManager({ dbPath: ":memory:" });
  });

  describe("append", () => {
    it("should append an event and return with ID and timestamp", async () => {
      const event = await eventLog.append({
        runId: "run-123",
        agentId: "agent-456",
        type: "turn_start",
        turn: 1,
        payload: { message: "Starting turn" },
      });

      expect(event.id).toBeDefined();
      expect(event.id).toBeGreaterThan(0);
      expect(event.timestamp).toBeDefined();
      expect(event.runId).toBe("run-123");
      expect(event.type).toBe("turn_start");
    });

    it("should preserve append order via auto-increment ID", async () => {
      const event1 = await eventLog.append(createTurnStartEvent("run-1", "agent-1", 1));
      const event2 = await eventLog.append(createTurnEndEvent("run-1", "agent-1", 1));
      const event3 = await eventLog.append(createTurnStartEvent("run-1", "agent-1", 2));

      // All events should have IDs since they were appended
      expect(event1.id).toBeDefined();
      expect(event2.id).toBeDefined();
      expect(event3.id).toBeDefined();
      expect(event1.id ?? 0).toBeLessThan(event2.id ?? 0);
      expect(event2.id ?? 0).toBeLessThan(event3.id ?? 0);
    });
  });

  describe("query", () => {
    it("should query events by runId", async () => {
      await eventLog.append(createTurnStartEvent("run-1", "agent-1", 1));
      await eventLog.append(createTurnEndEvent("run-1", "agent-1", 1));
      await eventLog.append(createTurnStartEvent("run-2", "agent-2", 1));

      const events = await eventLog.query({ runId: "run-1" });
      expect(events).toHaveLength(2);
      expect(events.every((e) => e.runId === "run-1")).toBe(true);
    });

    it("should query events by type", async () => {
      await eventLog.append(createTurnStartEvent("run-1", "agent-1", 1));
      await eventLog.append(
        createToolCallStartEvent("run-1", "agent-1", 1, "tc-1", "bash", { cmd: "ls" })
      );
      await eventLog.append(
        createToolCallEndEvent("run-1", "agent-1", 1, "tc-1", "bash", true, 100)
      );
      await eventLog.append(createTurnEndEvent("run-1", "agent-1", 1));

      const toolEvents = await eventLog.query({ type: ["tool_call_start", "tool_call_end"] });
      expect(toolEvents).toHaveLength(2);
    });

    it("should query events by turn", async () => {
      await eventLog.append(createTurnStartEvent("run-1", "agent-1", 1));
      await eventLog.append(createTurnEndEvent("run-1", "agent-1", 1));
      await eventLog.append(createTurnStartEvent("run-1", "agent-1", 2));
      await eventLog.append(createTurnEndEvent("run-1", "agent-1", 2));

      const turn2Events = await eventLog.query({ turn: 2 });
      expect(turn2Events).toHaveLength(2);
    });

    it("should support pagination with limit and offset", async () => {
      for (let i = 1; i <= 10; i++) {
        await eventLog.append(createTurnStartEvent("run-1", "agent-1", i));
      }

      const page1 = await eventLog.query({ limit: 3, offset: 0 });
      const page2 = await eventLog.query({ limit: 3, offset: 3 });

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it("should preserve order by ID (append order)", async () => {
      await eventLog.append(createTurnStartEvent("run-1", "agent-1", 1));
      await eventLog.append(createToolCallStartEvent("run-1", "agent-1", 1, "tc-1", "bash", {}));
      await eventLog.append(
        createToolCallEndEvent("run-1", "agent-1", 1, "tc-1", "bash", true, 50)
      );
      await eventLog.append(createTurnEndEvent("run-1", "agent-1", 1));

      const events = await eventLog.query({ runId: "run-1" });

      expect(events[0].type).toBe("turn_start");
      expect(events[1].type).toBe("tool_call_start");
      expect(events[2].type).toBe("tool_call_end");
      expect(events[3].type).toBe("turn_end");
    });
  });

  describe("getByRunId", () => {
    it("should get all events for a run", async () => {
      await eventLog.append(createTurnStartEvent("run-abc", "agent-1", 1));
      await eventLog.append(createTurnEndEvent("run-abc", "agent-1", 1));

      const events = await eventLog.getByRunId("run-abc");
      expect(events).toHaveLength(2);
    });
  });

  describe("countByRun", () => {
    it("should count events for a run", async () => {
      await eventLog.append(createTurnStartEvent("run-count", "agent-1", 1));
      await eventLog.append(createTurnEndEvent("run-count", "agent-1", 1));
      await eventLog.append(createTurnStartEvent("run-count", "agent-1", 2));

      const count = await eventLog.countByRun("run-count");
      expect(count).toBe(3);
    });
  });

  describe("event helpers", () => {
    it("should create turn_start event correctly", () => {
      const event = createTurnStartEvent("run-1", "agent-1", 5, { extra: "data" });
      expect(event.type).toBe("turn_start");
      expect(event.turn).toBe(5);
      expect(event.payload.extra).toBe("data");
    });

    it("should create tool_call_start event with toolCallId", () => {
      const event = createToolCallStartEvent("run-1", "agent-1", 3, "tc-123", "read_file", {
        path: "/test",
      });
      expect(event.type).toBe("tool_call_start");
      expect(event.toolCallId).toBe("tc-123");
      expect(event.payload.toolName).toBe("read_file");
    });

    it("should create tool_call_end event with result", () => {
      const event = createToolCallEndEvent(
        "run-1",
        "agent-1",
        3,
        "tc-123",
        "read_file",
        true,
        150,
        "file content"
      );
      expect(event.type).toBe("tool_call_end");
      expect(event.payload.success).toBe(true);
      expect(event.payload.durationMs).toBe(150);
      expect(event.payload.result).toBe("file content");
    });

    it("should create completion event", () => {
      const event = createCompletionEvent("run-1", "agent-1", 10, "Task completed", [
        "file1.txt",
        "file2.txt",
      ]);
      expect(event.type).toBe("completion");
      expect(event.payload.summary).toBe("Task completed");
      expect(event.payload.artifacts).toEqual(["file1.txt", "file2.txt"]);
    });

    it("should create error event", () => {
      const event = createErrorEvent(
        "run-1",
        "agent-1",
        5,
        "Rate limit exceeded",
        "RATE_LIMIT",
        true
      );
      expect(event.type).toBe("error");
      expect(event.payload.error).toBe("Rate limit exceeded");
      expect(event.payload.code).toBe("RATE_LIMIT");
      expect(event.payload.recoverable).toBe(true);
    });
  });
});
