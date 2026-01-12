/**
 * Scaled Collab Relay Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../rateLimiter";
import { ScaledCollabRelay } from "../scaledCollabRelay";

// Mock WebSocket
class MockWebSocket {
  readyState = 1; // OPEN
  OPEN = 1;
  sentMessages: string[] = [];
  closeCode?: number;
  closeReason?: string;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3; // CLOSED
    this.closeCode = code;
    this.closeReason = reason;
  }
}

describe("ScaledCollabRelay", () => {
  let relay: ScaledCollabRelay;

  beforeEach(() => {
    vi.useFakeTimers();
    relay = new ScaledCollabRelay({
      enableBatching: true,
      enableRateLimiting: true,
      enableBackpressure: true,
      batcher: { batchWindowMs: 10, maxBatchSize: 5 },
      rateLimiter: { maxMessagesPerSecond: 10, burstMultiplier: 2 },
      backpressure: { queueDepthThreshold: 5, maxQueueDepth: 10 },
    });
  });

  afterEach(() => {
    relay.clear();
    vi.useRealTimers();
  });

  describe("basic operations", () => {
    it("should add connection to room", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      relay.addToRoom(ws, "doc-1", "user-1", "editor");

      expect(relay.getRoomSize("doc-1")).toBe(1);
      expect(relay.getTotalConnections()).toBe(1);
    });

    it("should remove connection from room", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      relay.addToRoom(ws, "doc-1", "user-1", "editor");
      relay.removeFromRoom(ws);

      expect(relay.getRoomSize("doc-1")).toBe(0);
      expect(relay.getTotalConnections()).toBe(0);
    });

    it("should handle JOIN message", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      const msg = JSON.stringify({
        type: "JOIN",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
      });

      const result = relay.handleMessage(ws, msg);

      expect(result).toBe(true);
      expect(relay.getRoomSize("doc-1")).toBe(1);
    });
  });

  describe("rate limiting", () => {
    it("should allow messages under rate limit", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      relay.addToRoom(ws, "doc-1", "user-1", "editor");

      const msg = JSON.stringify({
        type: "CRDT_UPDATE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      });

      const result = relay.handleMessage(ws, msg);
      expect(result).toBe(true);
    });

    it("should reject messages when rate limited", () => {
      // Test rate limiter directly to verify it works
      // With burstMultiplier=1 and maxMessagesPerSecond=2, initial burst tokens = 2
      // So we need to exhaust both the window limit AND burst tokens
      const rateLimiter = new RateLimiter({
        maxMessagesPerSecond: 2,
        burstMultiplier: 1,
        windowMs: 1000,
      });

      // First 2 messages use window allowance
      expect(rateLimiter.check("client-1", 10).allowed).toBe(true);
      expect(rateLimiter.check("client-1", 10).allowed).toBe(true);

      // Next 2 messages use burst tokens
      expect(rateLimiter.check("client-1", 10).allowed).toBe(true);
      expect(rateLimiter.check("client-1", 10).allowed).toBe(true);

      // Fifth should be denied (window + burst exhausted)
      const result = rateLimiter.check("client-1", 10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("RATE_LIMITED");
    });
  });

  describe("permission check", () => {
    it("should reject updates from viewers", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      const mockWs = ws as unknown as MockWebSocket;
      relay.addToRoom(ws, "doc-1", "user-1", "viewer");

      const msg = JSON.stringify({
        type: "CRDT_UPDATE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      });

      const result = relay.handleMessage(ws, msg);

      expect(result).toBe(false);
      expect(mockWs.sentMessages).toHaveLength(1);
      const error = JSON.parse(mockWs.sentMessages[0]);
      expect(error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("batching", () => {
    it("should batch messages", () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;
      const mockWs2 = ws2 as unknown as MockWebSocket;

      relay.addToRoom(ws1, "doc-1", "user-1", "editor");
      relay.addToRoom(ws2, "doc-1", "user-2", "editor");

      // Send message from user-1
      const msg = JSON.stringify({
        type: "CRDT_UPDATE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      });

      relay.handleMessage(ws1, msg);

      // Message should not be delivered yet (batching)
      expect(mockWs2.sentMessages).toHaveLength(0);

      // Advance timer to trigger batch delivery
      vi.advanceTimersByTime(15);

      // Now message should be delivered
      expect(mockWs2.sentMessages.length).toBeGreaterThan(0);
    });

    it("should flush batches on demand", () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;
      const mockWs2 = ws2 as unknown as MockWebSocket;

      relay.addToRoom(ws1, "doc-1", "user-1", "editor");
      relay.addToRoom(ws2, "doc-1", "user-2", "editor");

      const msg = JSON.stringify({
        type: "CRDT_UPDATE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      });

      relay.handleMessage(ws1, msg);
      relay.flush();

      expect(mockWs2.sentMessages.length).toBeGreaterThan(0);
    });
  });

  describe("scale metrics", () => {
    it("should return scale metrics", () => {
      const metrics = relay.getScaleMetrics();

      expect(metrics.batcher).toBeDefined();
      expect(metrics.rateLimiter).toBeDefined();
      expect(metrics.backpressure).toBeDefined();
      expect(metrics.snapshotPolicy).toBeDefined();
    });
  });

  describe("presence handling", () => {
    it("should handle presence messages", () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;
      const mockWs2 = ws2 as unknown as MockWebSocket;

      relay.addToRoom(ws1, "doc-1", "user-1", "editor");
      relay.addToRoom(ws2, "doc-1", "user-2", "editor");

      const msg = JSON.stringify({
        type: "PRESENCE",
        docId: "doc-1",
        senderId: "user-1",
        ts: Date.now(),
        payload: { status: "active", stateHash: "abc123" },
      });

      const result = relay.handleMessage(ws1, msg);

      expect(result).toBe(true);
      expect(mockWs2.sentMessages).toHaveLength(1);
    });
  });

  describe("clear", () => {
    it("should clear all state", () => {
      const ws = new MockWebSocket() as unknown as WebSocket;
      relay.addToRoom(ws, "doc-1", "user-1", "editor");

      relay.clear();

      expect(relay.getTotalConnections()).toBe(0);
      expect(relay.getRoomIds()).toHaveLength(0);
    });
  });
});
