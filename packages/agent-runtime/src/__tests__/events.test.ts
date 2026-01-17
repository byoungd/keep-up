/**
 * Event Bus Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventBus, type EventBus, getGlobalEventBus, resetGlobalEventBus } from "../events";

describe("EventBus", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = createEventBus();
  });

  afterEach(() => {
    eventBus.dispose();
    resetGlobalEventBus();
  });

  describe("emit and subscribe", () => {
    it("should emit and receive events", () => {
      const handler = vi.fn();
      eventBus.subscribe("agent:spawned", handler);

      eventBus.emit("agent:spawned", {
        agentId: "agent-1",
        type: "researcher",
        task: "Find information",
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "agent:spawned",
          payload: {
            agentId: "agent-1",
            type: "researcher",
            task: "Find information",
          },
        })
      );
    });

    it("should include event metadata", () => {
      const handler = vi.fn();
      eventBus.subscribe("tool:called", handler);

      eventBus.emit(
        "tool:called",
        { toolName: "bash", args: {}, callId: "call-1" },
        { source: "agent-1", correlationId: "trace-123" }
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            id: expect.stringMatching(/^evt_/),
            timestamp: expect.any(Number),
            source: "agent-1",
            correlationId: "trace-123",
            priority: "normal",
          }),
        })
      );
    });

    it("should support multiple subscribers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe("system:ready", handler1);
      eventBus.subscribe("system:ready", handler2);

      eventBus.emit("system:ready", { startupTimeMs: 100 });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("should unsubscribe correctly", () => {
      const handler = vi.fn();
      const subscription = eventBus.subscribe("agent:completed", handler);

      eventBus.emit("agent:completed", { agentId: "a1", result: {} });
      expect(handler).toHaveBeenCalledTimes(1);

      subscription.unsubscribe();

      eventBus.emit("agent:completed", { agentId: "a2", result: {} });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe("wildcard subscriptions", () => {
    it("should match prefix wildcards", () => {
      const handler = vi.fn();
      eventBus.subscribe("agent:*", handler);

      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      eventBus.emit("agent:completed", { agentId: "a1", result: {} });
      eventBus.emit("tool:called", { toolName: "x", args: {}, callId: "c" });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should match full wildcard", () => {
      const handler = vi.fn();
      eventBus.subscribe("*", handler);

      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      eventBus.emit("tool:called", { toolName: "x", args: {}, callId: "c" });
      eventBus.emit("system:ready", { startupTimeMs: 50 });

      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe("once subscription", () => {
    it("should only trigger once", () => {
      const handler = vi.fn();
      eventBus.once("plugin:loaded", handler);

      eventBus.emit("plugin:loaded", { pluginId: "p1", version: "1.0" });
      eventBus.emit("plugin:loaded", { pluginId: "p2", version: "2.0" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { pluginId: "p1", version: "1.0" },
        })
      );
    });
  });

  describe("priority handling", () => {
    it("should execute handlers in priority order", () => {
      const order: string[] = [];

      eventBus.subscribe("test:priority", () => order.push("low"), { priority: "low" });
      eventBus.subscribe("test:priority", () => order.push("critical"), { priority: "critical" });
      eventBus.subscribe("test:priority", () => order.push("normal"), { priority: "normal" });
      eventBus.subscribe("test:priority", () => order.push("high"), { priority: "high" });

      eventBus.emitRaw("test:priority", {});

      expect(order).toEqual(["critical", "high", "normal", "low"]);
    });
  });

  describe("event filtering", () => {
    it("should filter events based on filter function", () => {
      const handler = vi.fn();

      eventBus.subscribe("agent:completed", handler, {
        filter: (event) => {
          const payload = event.payload as { agentId: string };
          return payload.agentId.startsWith("important-");
        },
      });

      eventBus.emit("agent:completed", { agentId: "normal-1", result: {} });
      eventBus.emit("agent:completed", { agentId: "important-1", result: {} });
      eventBus.emit("agent:completed", { agentId: "normal-2", result: {} });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { agentId: "important-1", result: {} },
        })
      );
    });
  });

  describe("event history and replay", () => {
    it("should store events in history", () => {
      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      eventBus.emit("agent:completed", { agentId: "a1", result: {} });

      const history = eventBus.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe("agent:spawned");
      expect(history[1].type).toBe("agent:completed");
    });

    it("should filter history by pattern", () => {
      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      eventBus.emit("tool:called", { toolName: "x", args: {}, callId: "c" });
      eventBus.emit("agent:completed", { agentId: "a1", result: {} });

      const agentHistory = eventBus.getHistory("agent:*");
      expect(agentHistory).toHaveLength(2);
    });

    it("should replay events on subscribe", () => {
      eventBus.emit("plugin:loaded", { pluginId: "p1", version: "1.0" });
      eventBus.emit("plugin:loaded", { pluginId: "p2", version: "2.0" });

      const handler = vi.fn();
      eventBus.subscribe("plugin:loaded", handler, { replay: true });

      // Should have received replayed events + no new events
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should limit replayed events", () => {
      for (let i = 0; i < 10; i++) {
        eventBus.emit("plugin:loaded", { pluginId: `p${i}`, version: "1.0" });
      }

      const handler = vi.fn();
      eventBus.subscribe("plugin:loaded", handler, {
        replay: true,
        replayLimit: 3,
      });

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should clear history", () => {
      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      expect(eventBus.getHistory()).toHaveLength(1);

      eventBus.clearHistory();
      expect(eventBus.getHistory()).toHaveLength(0);
    });
  });

  describe("waitFor", () => {
    it("should resolve when event is emitted", async () => {
      const promise = eventBus.waitFor("agent:completed");

      // Emit after a short delay
      setTimeout(() => {
        eventBus.emit("agent:completed", { agentId: "a1", result: { done: true } });
      }, 10);

      const event = await promise;
      expect(event.type).toBe("agent:completed");
      expect(event.payload).toEqual({ agentId: "a1", result: { done: true } });
    });

    it("should timeout if event not received", async () => {
      const promise = eventBus.waitFor("agent:completed", { timeoutMs: 50 });

      await expect(promise).rejects.toThrow("Timeout waiting for event");
    });

    it("should filter events in waitFor", async () => {
      const promise = eventBus.waitFor("agent:completed", {
        filter: (event) => {
          const payload = event.payload as { agentId: string };
          return payload.agentId === "target";
        },
      });

      setTimeout(() => {
        eventBus.emit("agent:completed", { agentId: "other", result: {} });
        eventBus.emit("agent:completed", { agentId: "target", result: { found: true } });
      }, 10);

      const event = await promise;
      expect(event.payload).toEqual({ agentId: "target", result: { found: true } });
    });
  });

  describe("async handlers", () => {
    it("should handle async handlers", async () => {
      const results: number[] = [];

      eventBus.subscribe("test:async", async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(1);
      });

      eventBus.emitRaw("test:async", {});

      // Handler is async, so wait for it
      await new Promise((r) => setTimeout(r, 50));
      expect(results).toEqual([1]);
    });

    it("should catch async handler errors", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
        // Swallow expected error in test
      });

      eventBus.subscribe("test:error", async () => {
        throw new Error("Async error");
      });

      eventBus.emitRaw("test:error", {});

      await new Promise((r) => setTimeout(r, 20));
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("statistics", () => {
    it("should track event statistics", () => {
      eventBus.subscribe("agent:*", () => {
        // track agent events
      });
      eventBus.subscribe("tool:*", () => {
        // track tool events
      });

      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });
      eventBus.emit("agent:completed", { agentId: "a1", result: {} });
      eventBus.emit("tool:called", { toolName: "x", args: {}, callId: "c" });

      const stats = eventBus.getStats();
      expect(stats.totalEmitted).toBe(3);
      expect(stats.totalHandled).toBe(3);
      expect(stats.activeSubscriptions).toBe(2);
      expect(stats.historySize).toBe(3);
    });
  });

  describe("removeAllListeners", () => {
    it("should remove all listeners for a pattern", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe("agent:spawned", handler1);
      eventBus.subscribe("agent:spawned", handler2);

      eventBus.removeAllListeners("agent:spawned");

      eventBus.emit("agent:spawned", { agentId: "a1", type: "t", task: "t" });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it("should remove all listeners when no pattern specified", () => {
      eventBus.subscribe("agent:spawned", vi.fn());
      eventBus.subscribe("tool:called", vi.fn());

      eventBus.removeAllListeners();

      expect(eventBus.getStats().activeSubscriptions).toBe(0);
    });
  });

  describe("global event bus", () => {
    it("should return same instance", () => {
      const bus1 = getGlobalEventBus();
      const bus2 = getGlobalEventBus();

      expect(bus1).toBe(bus2);
    });

    it("should reset global event bus", () => {
      const bus1 = getGlobalEventBus();
      resetGlobalEventBus();
      const bus2 = getGlobalEventBus();

      expect(bus1).not.toBe(bus2);
    });
  });

  describe("raw events", () => {
    it("should emit custom event types", () => {
      const handler = vi.fn();
      eventBus.subscribe("custom:my-event", handler);

      eventBus.emitRaw("custom:my-event", { foo: "bar" });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "custom:my-event",
          payload: { foo: "bar" },
        })
      );
    });
  });
});
