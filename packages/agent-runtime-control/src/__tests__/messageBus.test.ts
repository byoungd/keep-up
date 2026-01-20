/**
 * Runtime Message Bus Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMessageBus, type RuntimeMessageBus } from "../index";

describe("RuntimeMessageBus", () => {
  let bus: RuntimeMessageBus;

  beforeEach(() => {
    bus = createMessageBus();
  });

  afterEach(() => {
    bus.dispose();
  });

  describe("send", () => {
    it("should create a message envelope", () => {
      const envelope = bus.send("agent-1", "agent-2", { data: "test" });

      expect(envelope.id).toBeDefined();
      expect(envelope.from).toBe("agent-1");
      expect(envelope.to).toBe("agent-2");
      expect(envelope.type).toBe("request");
      expect(envelope.payload).toEqual({ data: "test" });
      expect(envelope.timestamp).toBeGreaterThan(0);
    });

    it("should generate unique message IDs", () => {
      const e1 = bus.send("a", "b", {});
      const e2 = bus.send("a", "b", {});

      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe("publish", () => {
    it("should create a broadcast envelope with topic", () => {
      const envelope = bus.publish("agent-1", "updates", { status: "done" });

      expect(envelope.from).toBe("agent-1");
      expect(envelope.to).toBeNull();
      expect(envelope.type).toBe("event");
      expect(envelope.topic).toBe("updates");
    });
  });

  describe("subscribe", () => {
    it("should deliver messages to topic subscribers", async () => {
      const received: unknown[] = [];

      bus.subscribe("updates", (envelope) => {
        received.push(envelope.payload);
      });

      bus.publish("agent-1", "updates", { status: "done" });

      // Allow async delivery
      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ status: "done" });
    });

    it("should allow unsubscribe", async () => {
      const received: unknown[] = [];

      const sub = bus.subscribe("updates", (envelope) => {
        received.push(envelope.payload);
      });

      sub.unsubscribe();

      bus.publish("agent-1", "updates", { status: "done" });

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(0);
    });

    it("should support multiple subscribers", async () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];

      bus.subscribe("updates", (envelope) => {
        received1.push(envelope.payload);
      });

      bus.subscribe("updates", (envelope) => {
        received2.push(envelope.payload);
      });

      bus.publish("agent-1", "updates", { data: 1 });

      await new Promise((r) => setTimeout(r, 10));

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe("registerAgent", () => {
    it("should deliver direct messages to registered agents", async () => {
      const received: unknown[] = [];

      bus.registerAgent("agent-2", (envelope) => {
        received.push(envelope.payload);
      });

      bus.send("agent-1", "agent-2", { message: "hello" });

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ message: "hello" });
    });

    it("should allow unregistering", async () => {
      const received: unknown[] = [];

      const unregister = bus.registerAgent("agent-2", (envelope) => {
        received.push(envelope.payload);
      });

      unregister();

      bus.send("agent-1", "agent-2", { message: "hello" });

      await new Promise((r) => setTimeout(r, 10));

      expect(received).toHaveLength(0);
    });
  });

  describe("respond", () => {
    it("should create a response envelope with correlation ID", () => {
      const envelope = bus.respond("agent-2", "corr-123", { result: "done" });

      expect(envelope.type).toBe("response");
      expect(envelope.correlationId).toBe("corr-123");
      expect(envelope.payload).toEqual({ result: "done" });
    });
  });

  describe("request/response flow", () => {
    it("should resolve request when response received", async () => {
      // Simulate an agent that responds
      bus.registerAgent("responder", async (envelope) => {
        if (envelope.correlationId) {
          await new Promise((r) => setTimeout(r, 5));
          bus.respond("responder", envelope.correlationId, { answer: 42 });
        }
      });

      const response = await bus.request("requester", "responder", { question: "what?" }, 1000);

      expect(response.type).toBe("response");
      expect(response.payload).toEqual({ answer: 42 });
    });

    it("waitFor should reuse pending request promise", async () => {
      let correlationId: string | undefined;

      bus.registerAgent("responder", (envelope) => {
        correlationId = envelope.correlationId;
      });

      const requestPromise = bus.request("requester", "responder", { ping: true }, 1000);

      await new Promise((r) => setTimeout(r, 10));

      if (!correlationId) {
        throw new Error("Missing correlation ID");
      }

      const waitPromise = bus.waitFor(correlationId, 1000);

      expect(waitPromise).toBe(requestPromise);

      bus.respond("responder", correlationId, { answer: "ok" });

      const [responseFromRequest, responseFromWait] = await Promise.all([
        requestPromise,
        waitPromise,
      ]);

      expect(responseFromRequest.payload).toEqual({ answer: "ok" });
      expect(responseFromWait.payload).toEqual({ answer: "ok" });
    });

    it("should timeout if no response", async () => {
      await expect(bus.request("requester", "nonexistent", { question: "?" }, 50)).rejects.toThrow(
        "timed out"
      );
    });
  });

  describe("getStats", () => {
    it("should return current stats", () => {
      bus.subscribe("topic1", () => {
        /* noop */
      });
      bus.subscribe("topic1", () => {
        /* noop */
      });
      bus.subscribe("topic2", () => {
        /* noop */
      });
      bus.registerAgent("agent-1", () => {
        /* noop */
      });

      const stats = bus.getStats();

      expect(stats.activeSubscriptions).toBe(3);
      expect(stats.registeredAgents).toBe(1);
      expect(stats.pendingRequests).toBe(0);
    });
  });

  describe("dispose", () => {
    it("should clean up all state", () => {
      bus.subscribe("topic", () => {
        /* noop */
      });
      bus.registerAgent("agent", () => {
        /* noop */
      });

      bus.dispose();

      const stats = bus.getStats();
      expect(stats.activeSubscriptions).toBe(0);
      expect(stats.registeredAgents).toBe(0);
    });

    it("should reject pending requests", async () => {
      const promise = bus.request("a", "b", {}, 10000);

      bus.dispose();

      await expect(promise).rejects.toThrow("disposed");
    });
  });
});
