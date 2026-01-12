/**
 * Permissions Integration Tests
 *
 * Tests for role-based permission enforcement in the CollabRelay.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../audit/auditLogger";
import { MemoryAuditStore } from "../audit/memoryAuditStore";
import { type CollabMessage, CollabRelay } from "../collabRelay";
import { MetricsCollector } from "../metrics/metricsCollector";

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];
  OPEN = MockWebSocket.OPEN;
  CLOSED = MockWebSocket.CLOSED;

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }
}

describe("Permissions Integration Tests", () => {
  let relay: CollabRelay;
  let auditStore: MemoryAuditStore;
  let auditLogger: AuditLogger;
  let metricsCollector: MetricsCollector;

  beforeEach(async () => {
    auditStore = new MemoryAuditStore();
    // Use larger batch size to avoid auto-flush during tests
    auditLogger = new AuditLogger({ store: auditStore, batchSize: 100, flushIntervalMs: 60000 });
    metricsCollector = new MetricsCollector();

    relay = new CollabRelay({
      auditLogger,
      metricsCollector,
      defaultRole: "editor",
    });
  });

  describe("Editor permissions", () => {
    it("editor can send CRDT_UPDATE", () => {
      const editor = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiverMock = receiver as unknown as MockWebSocket;

      relay.addToRoom(editor, "doc1", "editor-user", "editor");
      relay.addToRoom(receiver, "doc1", "receiver-user", "viewer");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "editor-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      const result = relay.handleMessage(editor, JSON.stringify(updateMsg));
      expect(result).toBe(true);

      // Receiver should get the update
      expect(receiverMock.sentMessages.length).toBe(1);
      const received = JSON.parse(receiverMock.sentMessages[0]) as CollabMessage;
      expect(received.type).toBe("CRDT_UPDATE");
      expect(received.bytesB64).toBe("dGVzdA==");
    });

    it("editor can send PRESENCE", () => {
      const editor = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiverMock = receiver as unknown as MockWebSocket;

      relay.addToRoom(editor, "doc1", "editor-user", "editor");
      relay.addToRoom(receiver, "doc1", "receiver-user", "viewer");

      const presenceMsg: CollabMessage = {
        type: "PRESENCE",
        docId: "doc1",
        senderId: "editor-user",
        ts: Date.now(),
        payload: { status: "active" },
      };

      const result = relay.handleMessage(editor, JSON.stringify(presenceMsg));
      expect(result).toBe(true);

      expect(receiverMock.sentMessages.length).toBe(1);
      const received = JSON.parse(receiverMock.sentMessages[0]) as CollabMessage;
      expect(received.type).toBe("PRESENCE");
    });
  });

  describe("Viewer permissions", () => {
    it("viewer receives PERMISSION_DENIED on CRDT_UPDATE", () => {
      const viewer = new MockWebSocket() as unknown as import("ws").WebSocket;
      const viewerMock = viewer as unknown as MockWebSocket;

      relay.addToRoom(viewer, "doc1", "viewer-user", "viewer");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "viewer-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      const result = relay.handleMessage(viewer, JSON.stringify(updateMsg));
      expect(result).toBe(false);

      // Should receive ERROR message
      expect(viewerMock.sentMessages.length).toBe(1);
      const errorMsg = JSON.parse(viewerMock.sentMessages[0]) as CollabMessage;
      expect(errorMsg.type).toBe("ERROR");
      expect(errorMsg.code).toBe("PERMISSION_DENIED");
    });

    it("viewer can send PRESENCE", () => {
      const viewer = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const receiverMock = receiver as unknown as MockWebSocket;

      relay.addToRoom(viewer, "doc1", "viewer-user", "viewer");
      relay.addToRoom(receiver, "doc1", "receiver-user", "editor");

      const presenceMsg: CollabMessage = {
        type: "PRESENCE",
        docId: "doc1",
        senderId: "viewer-user",
        ts: Date.now(),
        payload: { status: "active" },
      };

      const result = relay.handleMessage(viewer, JSON.stringify(presenceMsg));
      expect(result).toBe(true);

      expect(receiverMock.sentMessages.length).toBe(1);
    });

    it("rejected updates are not broadcast to other clients", () => {
      const viewer = new MockWebSocket() as unknown as import("ws").WebSocket;
      const editor = new MockWebSocket() as unknown as import("ws").WebSocket;
      const editorMock = editor as unknown as MockWebSocket;

      relay.addToRoom(viewer, "doc1", "viewer-user", "viewer");
      relay.addToRoom(editor, "doc1", "editor-user", "editor");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "viewer-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      relay.handleMessage(viewer, JSON.stringify(updateMsg));

      // Editor should NOT receive the rejected update
      expect(editorMock.sentMessages.length).toBe(0);
    });
  });

  describe("Metrics recording", () => {
    it("records permission denied metrics", () => {
      const viewer = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(viewer, "doc1", "viewer-user", "viewer");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "viewer-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      relay.handleMessage(viewer, JSON.stringify(updateMsg));

      const metrics = metricsCollector.getMetrics();
      expect(metrics.permissionDeniedCount).toBe(1);
    });

    it("records JOIN/LEAVE metrics", () => {
      const client = new MockWebSocket() as unknown as import("ws").WebSocket;

      relay.addToRoom(client, "doc1", "user1", "editor");
      let metrics = metricsCollector.getMetrics();
      expect(metrics.joinCount).toBe(1);

      relay.removeFromRoom(client);
      metrics = metricsCollector.getMetrics();
      expect(metrics.leaveCount).toBe(1);
    });

    it("records UPDATE metrics", () => {
      const editor = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(editor, "doc1", "editor-user", "editor");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "editor-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      relay.handleMessage(editor, JSON.stringify(updateMsg));

      const metrics = metricsCollector.getMetrics();
      expect(metrics.updateCountByDoc.doc1).toBe(1);
    });
  });

  describe("Audit logging", () => {
    it("logs JOIN events", async () => {
      const client = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(client, "doc1", "user1", "editor");

      await auditLogger.flush();
      const events = await auditStore.query({ docId: "doc1", eventType: "JOIN" });

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("JOIN");
      expect(events[0].actorId).toBe("user1");
      expect(events[0].role).toBe("editor");
    });

    it("logs LEAVE events", async () => {
      const client = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(client, "doc1", "user1", "editor");
      relay.removeFromRoom(client);

      await auditLogger.flush();
      const events = await auditStore.query({ docId: "doc1", eventType: "LEAVE" });

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("LEAVE");
      expect(events[0].actorId).toBe("user1");
    });

    it("logs UPDATE events with byte length (no content)", async () => {
      const editor = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(editor, "doc1", "editor-user", "editor");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "editor-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==", // "test" in base64 = 4 bytes
      };

      relay.handleMessage(editor, JSON.stringify(updateMsg));

      await auditLogger.flush();
      const events = await auditStore.query({ docId: "doc1", eventType: "UPDATE" });

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("UPDATE");
      expect(events[0].updateBytesLen).toBe(6); // base64 decodes to ~6 bytes
      // Verify no content is stored
      expect(events[0]).not.toHaveProperty("content");
      expect(events[0]).not.toHaveProperty("bytesB64");
    });

    it("logs ERROR events on permission violations", async () => {
      const viewer = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(viewer, "doc1", "viewer-user", "viewer");

      const updateMsg: CollabMessage = {
        type: "CRDT_UPDATE",
        docId: "doc1",
        senderId: "viewer-user",
        ts: Date.now(),
        bytesB64: "dGVzdA==",
      };

      relay.handleMessage(viewer, JSON.stringify(updateMsg));

      await auditLogger.flush();
      const events = await auditStore.query({ docId: "doc1", eventType: "ERROR" });

      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe("ERROR");
      expect(events[0].errorCode).toBe("PERMISSION_DENIED");
    });
  });
});
