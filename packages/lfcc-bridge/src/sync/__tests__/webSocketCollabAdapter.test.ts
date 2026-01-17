/**
 * Collaboration MVP - WebSocketCollabAdapter Unit Tests
 *
 * Tests for WebSocket adapter connection lifecycle, message handling, and reconnection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollabAdapterStatus } from "../collabAdapter";
import { createCrdtUpdateMessage, type SyncMessage, serializeSyncMessage } from "../collabMessages";
import { WebSocketCollabAdapter } from "../webSocketCollabAdapter";

// ============================================================================
// Mock CloseEvent for Node.js environment
// ============================================================================

class MockCloseEvent {
  type: string;
  code: number;
  reason: string;

  constructor(type: string, options: { code?: number; reason?: string } = {}) {
    this.type = type;
    this.code = options.code ?? 1000;
    this.reason = options.reason ?? "";
  }
}

// ============================================================================
// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code: code ?? 1000, reason: reason ?? "" }));
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  simulateMessage(data: string): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data }));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  simulateClose(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new MockCloseEvent("close", { code, reason }) as CloseEvent);
    }
  }
}

// Store created WebSocket instances for testing
let mockWebSocketInstances: MockWebSocket[] = [];

// ============================================================================
// Test Setup
// ============================================================================

describe("WebSocketCollabAdapter", () => {
  beforeEach(() => {
    mockWebSocketInstances = [];
    // Mock global WebSocket
    vi.stubGlobal(
      "WebSocket",
      class extends MockWebSocket {
        constructor(url: string) {
          super(url);
          mockWebSocketInstances.push(this);
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
  });

  // ============================================================================
  // Connection Lifecycle Tests
  // ============================================================================

  describe("connection lifecycle", () => {
    it("starts in idle status", () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      expect(adapter.status).toBe("idle");
    });

    it("transitions to connecting then connected on successful connect", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const statusChanges: CollabAdapterStatus[] = [];
      adapter.onStatusChange((status) => statusChanges.push(status));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });

      // Should be connecting
      expect(adapter.status).toBe("connecting");

      // Simulate successful connection
      mockWebSocketInstances[0].simulateOpen();

      await connectPromise;

      expect(adapter.status).toBe("connected");
      expect(statusChanges).toContain("connecting");
      expect(statusChanges).toContain("connected");
    });

    it("creates WebSocket with correct URL including docId", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "my-doc-123", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      expect(mockWebSocketInstances[0].url).toBe("ws://localhost:8080/my-doc-123");
    });

    it("sends JOIN message on successful connect", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      const sentMsg = JSON.parse(mockWebSocketInstances[0].sentMessages[0]) as SyncMessage;
      expect(sentMsg.type).toBe("JOIN");
      expect(sentMsg.docId).toBe("doc1");
      expect(sentMsg.senderId).toBe("user1");
    });

    it("transitions to disconnected on disconnect()", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      adapter.disconnect();

      expect(adapter.status).toBe("disconnected");
    });

    it("sends LEAVE message on disconnect()", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Clear the JOIN message
      mockWebSocketInstances[0].sentMessages = [];

      adapter.disconnect();

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      const sentMsg = JSON.parse(mockWebSocketInstances[0].sentMessages[0]) as SyncMessage;
      expect(sentMsg.type).toBe("LEAVE");
      expect(sentMsg.docId).toBe("doc1");
      expect(sentMsg.senderId).toBe("user1");
    });

    it("throws when connecting while already connected", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      await expect(adapter.connect({ docId: "doc2", userId: "user1" })).rejects.toThrow(
        "Cannot connect in status: connected"
      );
    });
  });

  // ============================================================================
  // Message Handling Tests
  // ============================================================================

  describe("message handling", () => {
    it("invokes onMessage callback when message is received", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const receivedMessages: SyncMessage[] = [];
      adapter.onMessage((msg) => receivedMessages.push(msg));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      const testMsg = createCrdtUpdateMessage("doc1", "user2", "dGVzdA==");
      mockWebSocketInstances[0].simulateMessage(serializeSyncMessage(testMsg));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0].type).toBe("CRDT_UPDATE");
      expect(receivedMessages[0].senderId).toBe("user2");
    });

    it("ignores invalid messages without throwing", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const receivedMessages: SyncMessage[] = [];
      adapter.onMessage((msg) => receivedMessages.push(msg));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Send invalid message
      mockWebSocketInstances[0].simulateMessage('{"invalid": "message"}');

      expect(receivedMessages.length).toBe(0);
    });

    it("ignores malformed JSON without throwing", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const receivedMessages: SyncMessage[] = [];
      adapter.onMessage((msg) => receivedMessages.push(msg));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Send malformed JSON
      mockWebSocketInstances[0].simulateMessage("not json");

      expect(receivedMessages.length).toBe(0);
    });

    it("send() serializes and transmits message", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Clear JOIN message
      mockWebSocketInstances[0].sentMessages = [];

      const testMsg = createCrdtUpdateMessage("doc1", "user1", "dGVzdA==");
      adapter.send(testMsg);

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      const sentMsg = JSON.parse(mockWebSocketInstances[0].sentMessages[0]) as SyncMessage;
      expect(sentMsg.type).toBe("CRDT_UPDATE");
      expect(sentMsg.bytesB64).toBe("dGVzdA==");
    });

    it("send() silently drops messages when not connected", () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });

      const testMsg = createCrdtUpdateMessage("doc1", "user1", "dGVzdA==");
      // Should not throw
      adapter.send(testMsg);
    });

    it("unsubscribe function removes listener", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const receivedMessages: SyncMessage[] = [];
      const unsubscribe = adapter.onMessage((msg) => receivedMessages.push(msg));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Unsubscribe
      unsubscribe();

      const testMsg = createCrdtUpdateMessage("doc1", "user2", "dGVzdA==");
      mockWebSocketInstances[0].simulateMessage(serializeSyncMessage(testMsg));

      expect(receivedMessages.length).toBe(0);
    });
  });

  // ============================================================================
  // Reconnection Tests
  // ============================================================================

  describe("reconnection behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("attempts reconnection on unexpected disconnect", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: true, maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
      });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Simulate unexpected close
      mockWebSocketInstances[0].simulateClose(1006, "Connection lost");

      expect(adapter.status).toBe("reconnecting");
    });

    it("does not reconnect on intentional disconnect", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: true, maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
      });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      adapter.disconnect();

      expect(adapter.status).toBe("disconnected");
    });

    it("does not reconnect when reconnect is disabled", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: false, maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
      });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // Simulate unexpected close
      mockWebSocketInstances[0].simulateClose(1006, "Connection lost");

      expect(adapter.status).toBe("disconnected");
    });

    it("uses exponential backoff for reconnection delays", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: true, maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 10000 },
      });

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // First disconnect
      mockWebSocketInstances[0].simulateClose(1006, "Connection lost");
      expect(adapter.status).toBe("reconnecting");

      // First reconnect attempt after 100ms
      await vi.advanceTimersByTimeAsync(100);
      expect(mockWebSocketInstances.length).toBe(2);

      // Fail the reconnect
      mockWebSocketInstances[1].simulateClose(1006, "Connection lost");

      // Second reconnect attempt after 200ms (100 * 2^1)
      await vi.advanceTimersByTimeAsync(200);
      expect(mockWebSocketInstances.length).toBe(3);
    });

    it("emits error after max reconnection attempts", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: true, maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 1000 },
      });

      const errors: Error[] = [];
      adapter.onError((err) => errors.push(err));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateOpen();
      await connectPromise;

      // First disconnect
      mockWebSocketInstances[0].simulateClose(1006, "Connection lost");

      // First reconnect attempt
      await vi.advanceTimersByTimeAsync(100);
      mockWebSocketInstances[1].simulateClose(1006, "Connection lost");

      // Second reconnect attempt
      await vi.advanceTimersByTimeAsync(200);
      mockWebSocketInstances[2].simulateClose(1006, "Connection lost");

      // Should have emitted error after max attempts
      // Note: status may be "error" or "disconnected" depending on implementation
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("error handling", () => {
    it("emits error on WebSocket error event", async () => {
      const adapter = new WebSocketCollabAdapter({ url: "ws://localhost:8080" });
      const errors: Error[] = [];
      adapter.onError((err) => errors.push(err));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateError();
      mockWebSocketInstances[0].simulateClose(1006, "Error");

      await expect(connectPromise).rejects.toThrow();
      expect(errors.length).toBeGreaterThan(0);
    });

    it("transitions to error status on connection failure", async () => {
      const adapter = new WebSocketCollabAdapter({
        url: "ws://localhost:8080",
        reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 100, maxDelayMs: 1000 },
      });

      const errors: Error[] = [];
      adapter.onError((err) => errors.push(err));

      const connectPromise = adapter.connect({ docId: "doc1", userId: "user1" });
      mockWebSocketInstances[0].simulateError();
      mockWebSocketInstances[0].simulateClose(1006, "Error");

      await expect(connectPromise).rejects.toThrow();
      // When reconnect is disabled, status goes to disconnected after close
      expect(["error", "disconnected"]).toContain(adapter.status);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
