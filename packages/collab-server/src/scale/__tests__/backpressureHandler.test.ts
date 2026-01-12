/**
 * Backpressure Handler Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackpressureHandler } from "../backpressureHandler";

describe("BackpressureHandler", () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    handler = new BackpressureHandler({
      queueDepthThreshold: 10,
      timeThresholdMs: 1000,
      maxQueueDepth: 50,
      enableSnapshotResync: true,
    });
  });

  afterEach(() => {
    handler.clear();
    vi.useRealTimers();
  });

  describe("queue tracking", () => {
    it("should track queue depth", () => {
      handler.recordQueued("client-1");
      handler.recordQueued("client-1");
      handler.recordQueued("client-1");

      expect(handler.getQueueDepth("client-1")).toBe(3);
    });

    it("should decrease queue on delivery", () => {
      handler.recordQueued("client-1");
      handler.recordQueued("client-1");
      handler.recordDelivered("client-1");

      expect(handler.getQueueDepth("client-1")).toBe(1);
    });

    it("should not go below zero", () => {
      handler.recordQueued("client-1");
      handler.recordDelivered("client-1");
      handler.recordDelivered("client-1");

      expect(handler.getQueueDepth("client-1")).toBe(0);
    });
  });

  describe("slow client detection", () => {
    it("should not mark as slow below threshold", () => {
      for (let i = 0; i < 9; i++) {
        handler.recordQueued("client-1");
      }

      vi.advanceTimersByTime(2000);

      expect(handler.isSlowClient("client-1")).toBe(false);
    });

    it("should mark as slow after threshold and time", () => {
      // Queue up to threshold
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }

      // Advance past time threshold
      vi.advanceTimersByTime(1100);

      // Queue one more to trigger check
      const action = handler.recordQueued("client-1");

      expect(handler.isSlowClient("client-1")).toBe(true);
      expect(action.type).toBe("degrade");
    });

    it("should clear slow status when queue empties", () => {
      // Mark as slow
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }
      vi.advanceTimersByTime(1100);
      handler.recordQueued("client-1");

      expect(handler.isSlowClient("client-1")).toBe(true);

      // Drain queue
      for (let i = 0; i < 11; i++) {
        handler.recordDelivered("client-1");
      }

      expect(handler.isSlowClient("client-1")).toBe(false);
    });
  });

  describe("disconnect action", () => {
    it("should trigger disconnect at max queue depth", () => {
      for (let i = 0; i < 49; i++) {
        handler.recordQueued("client-1");
      }

      const action = handler.recordQueued("client-1");

      expect(action.type).toBe("disconnect");
      if (action.type === "disconnect") {
        expect(action.reason).toBe("unrecoverable");
      }
    });
  });

  describe("degrade action", () => {
    it("should trigger degrade for slow client", () => {
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }

      vi.advanceTimersByTime(1100);

      const action = handler.recordQueued("client-1");

      expect(action.type).toBe("degrade");
      if (action.type === "degrade") {
        expect(action.reason).toBe("slow_client");
      }
    });

    it("should not degrade when disabled", () => {
      const noResyncHandler = new BackpressureHandler({
        queueDepthThreshold: 10,
        timeThresholdMs: 1000,
        maxQueueDepth: 50,
        enableSnapshotResync: false,
      });

      for (let i = 0; i < 10; i++) {
        noResyncHandler.recordQueued("client-1");
      }

      vi.advanceTimersByTime(1100);

      const action = noResyncHandler.recordQueued("client-1");

      expect(action.type).toBe("none");
      expect(noResyncHandler.isSlowClient("client-1")).toBe(true);
    });
  });

  describe("client management", () => {
    it("should track client count", () => {
      handler.recordQueued("client-1");
      handler.recordQueued("client-2");
      handler.recordQueued("client-3");

      expect(handler.getClientCount()).toBe(3);
    });

    it("should remove client", () => {
      handler.recordQueued("client-1");
      handler.recordQueued("client-2");

      handler.removeClient("client-1");

      expect(handler.getClientCount()).toBe(1);
      expect(handler.getQueueDepth("client-1")).toBe(0);
    });
  });

  describe("metrics", () => {
    it("should track slow client detections", () => {
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }
      vi.advanceTimersByTime(1100);
      handler.recordQueued("client-1");

      const metrics = handler.getMetrics();
      expect(metrics.slowClientDetections).toBe(1);
      expect(metrics.currentSlowClients).toBe(1);
    });

    it("should track degradations", () => {
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }
      vi.advanceTimersByTime(1100);
      handler.recordQueued("client-1");

      const metrics = handler.getMetrics();
      expect(metrics.degradationsTriggered).toBe(1);
    });

    it("should track disconnects", () => {
      for (let i = 0; i < 50; i++) {
        handler.recordQueued("client-1");
      }

      const metrics = handler.getMetrics();
      expect(metrics.disconnectsTriggered).toBe(1);
    });

    it("should update current slow clients on removal", () => {
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }
      vi.advanceTimersByTime(1100);
      handler.recordQueued("client-1");

      expect(handler.getMetrics().currentSlowClients).toBe(1);

      handler.removeClient("client-1");

      expect(handler.getMetrics().currentSlowClients).toBe(0);
    });

    it("should reset metrics", () => {
      for (let i = 0; i < 10; i++) {
        handler.recordQueued("client-1");
      }
      vi.advanceTimersByTime(1100);
      handler.recordQueued("client-1");

      handler.resetMetrics();

      const metrics = handler.getMetrics();
      expect(metrics.slowClientDetections).toBe(0);
      expect(metrics.degradationsTriggered).toBe(0);
    });
  });
});
