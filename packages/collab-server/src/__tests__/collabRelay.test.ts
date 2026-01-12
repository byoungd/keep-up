/**
 * Collaboration MVP - CollabRelay Property Tests
 *
 * Property-based tests for relay pass-through integrity.
 */

import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type CollabMessage, CollabRelay } from "../collabRelay";

// ============================================================================
// Mock WebSocket
// ============================================================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
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

/** Default role for tests */
const DEFAULT_ROLE = "editor" as const;

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 });

const base64String = fc.uint8Array({ minLength: 0, maxLength: 500 }).map((arr) => {
  return Buffer.from(arr).toString("base64");
});

const crdtUpdateMessageArb = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
    bytesB64: base64String,
  })
  .map(({ docId, senderId, bytesB64 }) => ({
    type: "CRDT_UPDATE" as const,
    docId,
    senderId,
    ts: Date.now(),
    bytesB64,
  }));

const joinMessageArb = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
  })
  .map(({ docId, senderId }) => ({
    type: "JOIN" as const,
    docId,
    senderId,
    ts: Date.now(),
  }));

const leaveMessageArb = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
  })
  .map(({ docId, senderId }) => ({
    type: "LEAVE" as const,
    docId,
    senderId,
    ts: Date.now(),
  }));

const presenceMessageArb = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
    payload: fc.record({
      displayName: fc.option(fc.string(), { nil: undefined }),
      status: fc.option(fc.constantFrom("active", "idle", "away"), { nil: undefined }),
    }),
  })
  .map(({ docId, senderId, payload }) => ({
    type: "PRESENCE" as const,
    docId,
    senderId,
    ts: Date.now(),
    payload,
  }));

const collabMessageArb: fc.Arbitrary<CollabMessage> = fc.oneof(
  crdtUpdateMessageArb,
  joinMessageArb,
  leaveMessageArb,
  presenceMessageArb
);

// ============================================================================
// Property Tests
// ============================================================================

describe("CollabRelay Property Tests", () => {
  let relay: CollabRelay;

  beforeEach(() => {
    relay = new CollabRelay();
  });

  /**
   * **Feature: collaboration-mvp, Property 3: Relay Pass-Through Integrity**
   *
   * For any CRDT_UPDATE message sent through the relay server, the `bytesB64` field
   * received by other clients SHALL be byte-for-byte identical to the original.
   *
   * **Validates: Requirements 3.3**
   */
  describe("Property 3: Relay Pass-Through Integrity", () => {
    it("CRDT_UPDATE bytesB64 is preserved exactly through relay", () => {
      fc.assert(
        fc.property(crdtUpdateMessageArb, (msg) => {
          // Create two clients in the same room
          const sender = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiverMock = receiver as unknown as MockWebSocket;

          // Add both to the room
          relay.addToRoom(sender, msg.docId, msg.senderId, DEFAULT_ROLE);
          relay.addToRoom(receiver, msg.docId, "receiver-id", DEFAULT_ROLE);

          // Send CRDT_UPDATE message
          const serialized = JSON.stringify(msg);
          relay.handleMessage(sender, serialized);

          // Verify receiver got the message
          expect(receiverMock.sentMessages.length).toBe(1);

          // Parse received message
          const received = JSON.parse(receiverMock.sentMessages[0]) as CollabMessage;

          // Verify bytesB64 is identical
          expect(received.type).toBe("CRDT_UPDATE");
          expect((received as { bytesB64: string }).bytesB64).toBe(msg.bytesB64);
        }),
        { numRuns: 100 }
      );
    });

    it("all message fields are preserved through relay", () => {
      fc.assert(
        fc.property(collabMessageArb, (msg) => {
          // Skip JOIN messages as they have special handling
          if (msg.type === "JOIN") {
            return true;
          }

          const sender = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiverMock = receiver as unknown as MockWebSocket;

          // Add sender to room first (simulating they already joined)
          relay.addToRoom(sender, msg.docId, msg.senderId, DEFAULT_ROLE);
          relay.addToRoom(receiver, msg.docId, "receiver-id", DEFAULT_ROLE);

          // Send message
          const serialized = JSON.stringify(msg);
          relay.handleMessage(sender, serialized);

          // Verify receiver got the message
          expect(receiverMock.sentMessages.length).toBe(1);

          // Parse and compare
          const received = JSON.parse(receiverMock.sentMessages[0]) as CollabMessage;
          expect(received.type).toBe(msg.type);
          expect(received.docId).toBe(msg.docId);
          expect(received.senderId).toBe(msg.senderId);
          expect(received.ts).toBe(msg.ts);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Room Management", () => {
    it("clients in same room receive broadcasts", () => {
      fc.assert(
        fc.property(nonEmptyString, crdtUpdateMessageArb, (docId, msg) => {
          const msgWithDocId = { ...msg, docId };

          const sender = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiver1 = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiver2 = new MockWebSocket() as unknown as import("ws").WebSocket;

          relay.addToRoom(sender, docId, "sender", DEFAULT_ROLE);
          relay.addToRoom(receiver1, docId, "receiver1", DEFAULT_ROLE);
          relay.addToRoom(receiver2, docId, "receiver2", DEFAULT_ROLE);

          relay.handleMessage(sender, JSON.stringify(msgWithDocId));

          // Both receivers should get the message
          expect((receiver1 as unknown as MockWebSocket).sentMessages.length).toBe(1);
          expect((receiver2 as unknown as MockWebSocket).sentMessages.length).toBe(1);

          // Sender should not receive their own message
          expect((sender as unknown as MockWebSocket).sentMessages.length).toBe(0);
        }),
        { numRuns: 50 }
      );
    });

    it("clients in different rooms do not receive broadcasts", () => {
      fc.assert(
        fc.property(nonEmptyString, nonEmptyString, crdtUpdateMessageArb, (docId1, docId2, msg) => {
          // Ensure different docIds
          const actualDocId2 = docId1 === docId2 ? `${docId2}-different` : docId2;
          const msgWithDocId = { ...msg, docId: docId1 };

          const sender = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiverSameRoom = new MockWebSocket() as unknown as import("ws").WebSocket;
          const receiverDifferentRoom = new MockWebSocket() as unknown as import("ws").WebSocket;

          relay.addToRoom(sender, docId1, "sender", DEFAULT_ROLE);
          relay.addToRoom(receiverSameRoom, docId1, "receiver-same", DEFAULT_ROLE);
          relay.addToRoom(receiverDifferentRoom, actualDocId2, "receiver-different", DEFAULT_ROLE);

          relay.handleMessage(sender, JSON.stringify(msgWithDocId));

          // Same room receiver should get the message
          expect((receiverSameRoom as unknown as MockWebSocket).sentMessages.length).toBe(1);

          // Different room receiver should not get the message
          expect((receiverDifferentRoom as unknown as MockWebSocket).sentMessages.length).toBe(0);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe("JOIN/LEAVE Handling", () => {
    it("JOIN message adds client to room and broadcasts", () => {
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const joiner = new MockWebSocket() as unknown as import("ws").WebSocket;

      // Receiver is already in the room
      relay.addToRoom(receiver, "doc1", "receiver", DEFAULT_ROLE);

      // Joiner sends JOIN message
      const joinMsg: CollabMessage = {
        type: "JOIN",
        docId: "doc1",
        senderId: "joiner",
        ts: Date.now(),
      };
      relay.handleMessage(joiner, JSON.stringify(joinMsg));

      // Receiver should get the JOIN message
      expect((receiver as unknown as MockWebSocket).sentMessages.length).toBe(1);
      const received = JSON.parse(
        (receiver as unknown as MockWebSocket).sentMessages[0]
      ) as CollabMessage;
      expect(received.type).toBe("JOIN");
      expect(received.senderId).toBe("joiner");

      // Room should now have 2 participants
      expect(relay.getRoomSize("doc1")).toBe(2);
    });

    it("LEAVE message removes client from room and broadcasts", () => {
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const leaver = new MockWebSocket() as unknown as import("ws").WebSocket;

      relay.addToRoom(receiver, "doc1", "receiver", DEFAULT_ROLE);
      relay.addToRoom(leaver, "doc1", "leaver", DEFAULT_ROLE);

      expect(relay.getRoomSize("doc1")).toBe(2);

      // Leaver sends LEAVE message
      const leaveMsg: CollabMessage = {
        type: "LEAVE",
        docId: "doc1",
        senderId: "leaver",
        ts: Date.now(),
      };
      relay.handleMessage(leaver, JSON.stringify(leaveMsg));

      // Receiver should get the LEAVE message
      expect((receiver as unknown as MockWebSocket).sentMessages.length).toBe(1);
      const received = JSON.parse(
        (receiver as unknown as MockWebSocket).sentMessages[0]
      ) as CollabMessage;
      expect(received.type).toBe("LEAVE");

      // Room should now have 1 participant
      expect(relay.getRoomSize("doc1")).toBe(1);
    });

    it("removeFromRoom broadcasts LEAVE message", () => {
      const receiver = new MockWebSocket() as unknown as import("ws").WebSocket;
      const disconnector = new MockWebSocket() as unknown as import("ws").WebSocket;

      relay.addToRoom(receiver, "doc1", "receiver", DEFAULT_ROLE);
      relay.addToRoom(disconnector, "doc1", "disconnector", DEFAULT_ROLE);

      // Simulate disconnect
      relay.removeFromRoom(disconnector, true);

      // Receiver should get a LEAVE message
      expect((receiver as unknown as MockWebSocket).sentMessages.length).toBe(1);
      const received = JSON.parse(
        (receiver as unknown as MockWebSocket).sentMessages[0]
      ) as CollabMessage;
      expect(received.type).toBe("LEAVE");
      expect(received.senderId).toBe("disconnector");
    });
  });

  describe("Invalid Message Handling", () => {
    it("rejects invalid JSON", () => {
      const ws = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(ws, "doc1", "user1", DEFAULT_ROLE);

      const result = relay.handleMessage(ws, "not json");
      expect(result).toBe(false);
    });

    it("rejects messages with missing fields", () => {
      const ws = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(ws, "doc1", "user1", DEFAULT_ROLE);

      const result = relay.handleMessage(ws, JSON.stringify({ type: "CRDT_UPDATE" }));
      expect(result).toBe(false);
    });

    it("rejects messages with invalid type", () => {
      const ws = new MockWebSocket() as unknown as import("ws").WebSocket;
      relay.addToRoom(ws, "doc1", "user1", DEFAULT_ROLE);

      const result = relay.handleMessage(
        ws,
        JSON.stringify({
          type: "INVALID",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
        })
      );
      expect(result).toBe(false);
    });
  });

  describe("Permission Enforcement", () => {
    it("viewers cannot send CRDT_UPDATE", () => {
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

    it("editors can send CRDT_UPDATE", () => {
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
    });
  });

  describe("Divergence Detection", () => {
    it("logs divergence when state hashes differ (non-blocking)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        // swallow divergence warning in test
      });

      const client1 = new MockWebSocket() as unknown as import("ws").WebSocket;
      const client2 = new MockWebSocket() as unknown as import("ws").WebSocket;

      relay.addToRoom(client1, "doc1", "client1", DEFAULT_ROLE);
      relay.addToRoom(client2, "doc1", "client2", DEFAULT_ROLE);

      // Client 1 sends presence with hash
      const presence1: CollabMessage = {
        type: "PRESENCE",
        docId: "doc1",
        senderId: "client1",
        ts: Date.now(),
        payload: { stateHash: "hash-a" },
      };
      relay.handleMessage(client1, JSON.stringify(presence1));

      // Client 2 sends presence with different hash
      const presence2: CollabMessage = {
        type: "PRESENCE",
        docId: "doc1",
        senderId: "client2",
        ts: Date.now(),
        payload: { stateHash: "hash-b" },
      };
      const result = relay.handleMessage(client2, JSON.stringify(presence2));

      // Should still succeed (non-blocking)
      expect(result).toBe(true);

      // Should have logged a warning
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Divergence detected"));

      warnSpy.mockRestore();
    });
  });
});
