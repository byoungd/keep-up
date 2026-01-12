/**
 * Collaboration MVP - CollabManager Property Tests
 *
 * Property-based tests for echo loop prevention and participant list consistency.
 */

import * as fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import type { CollabAdapter, CollabAdapterStatus, CollabSession } from "../collabAdapter";
import { CollabManager } from "../collabManager";
import {
  type SyncMessage,
  createCrdtUpdateMessage,
  createJoinMessage,
  createLeaveMessage,
  createPresenceMessage,
} from "../collabMessages";

// ============================================================================
// Mock LoroRuntime
// ============================================================================

class MockLoroRuntime {
  importedBytes: Uint8Array[] = [];
  localUpdateCallbacks: Array<(bytes: Uint8Array) => void> = [];

  importBytes(bytes: Uint8Array): void {
    this.importedBytes.push(bytes);
  }

  onLocalUpdate(callback: (bytes: Uint8Array) => void): () => void {
    this.localUpdateCallbacks.push(callback);
    return () => {
      const index = this.localUpdateCallbacks.indexOf(callback);
      if (index >= 0) {
        this.localUpdateCallbacks.splice(index, 1);
      }
    };
  }

  // Test helper: simulate a local update
  simulateLocalUpdate(bytes: Uint8Array): void {
    for (const cb of this.localUpdateCallbacks) {
      cb(bytes);
    }
  }
}

// ============================================================================
// Mock CollabAdapter
// ============================================================================

class MockCollabAdapter implements CollabAdapter {
  status: CollabAdapterStatus = "idle";
  sentMessages: SyncMessage[] = [];
  messageCallbacks: Array<(msg: SyncMessage) => void> = [];
  statusCallbacks: Array<(status: CollabAdapterStatus) => void> = [];
  errorCallbacks: Array<(error: Error) => void> = [];
  session: CollabSession | null = null;

  async connect(session: CollabSession): Promise<void> {
    this.session = session;
    this.status = "connected";
    for (const cb of this.statusCallbacks) {
      cb("connected");
    }
  }

  send(msg: SyncMessage): void {
    this.sentMessages.push(msg);
  }

  onMessage(cb: (msg: SyncMessage) => void): () => void {
    this.messageCallbacks.push(cb);
    return () => {
      const index = this.messageCallbacks.indexOf(cb);
      if (index >= 0) {
        this.messageCallbacks.splice(index, 1);
      }
    };
  }

  onStatusChange(cb: (status: CollabAdapterStatus) => void): () => void {
    this.statusCallbacks.push(cb);
    return () => {
      const index = this.statusCallbacks.indexOf(cb);
      if (index >= 0) {
        this.statusCallbacks.splice(index, 1);
      }
    };
  }

  onError(cb: (error: Error) => void): () => void {
    this.errorCallbacks.push(cb);
    return () => {
      const index = this.errorCallbacks.indexOf(cb);
      if (index >= 0) {
        this.errorCallbacks.splice(index, 1);
      }
    };
  }

  disconnect(): void {
    this.status = "disconnected";
  }

  // Test helper: simulate receiving a message
  simulateMessage(msg: SyncMessage): void {
    for (const cb of this.messageCallbacks) {
      cb(msg);
    }
  }
}

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

const nonEmptyString = fc.string({ minLength: 1, maxLength: 50 });

const base64String = fc.uint8Array({ minLength: 1, maxLength: 100 }).map((arr) => {
  return btoa(String.fromCharCode(...arr));
});

// ============================================================================
// Property Tests
// ============================================================================

describe("CollabManager Property Tests", () => {
  let runtime: MockLoroRuntime;
  let adapter: MockCollabAdapter;
  let manager: CollabManager;

  beforeEach(() => {
    runtime = new MockLoroRuntime();
    adapter = new MockCollabAdapter();
  });

  /**
   * **Feature: collaboration-mvp, Property 5: Echo Loop Prevention**
   *
   * For any CollabManager instance, when it receives a SyncMessage with `senderId`
   * equal to its own `userId`, the message SHALL be ignored and NOT applied to
   * the local Loro document.
   *
   * **Validates: Requirements 4.3**
   */
  describe("Property 5: Echo Loop Prevention", () => {
    it("ignores CRDT_UPDATE messages from self", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonEmptyString,
          nonEmptyString,
          base64String,
          async (docId, userId, bytesB64) => {
            runtime = new MockLoroRuntime();
            adapter = new MockCollabAdapter();
            manager = new CollabManager({
              runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
              adapter,
              userId,
              docId,
            });

            await manager.start();

            // Simulate receiving own message
            const ownMsg = createCrdtUpdateMessage(docId, userId, bytesB64);
            adapter.simulateMessage(ownMsg);

            // Should NOT have imported the bytes
            expect(runtime.importedBytes.length).toBe(0);

            manager.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("applies CRDT_UPDATE messages from others", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonEmptyString,
          nonEmptyString,
          nonEmptyString,
          base64String,
          async (docId, userId, otherUserId, bytesB64) => {
            // Ensure different user IDs
            const actualOtherUserId = userId === otherUserId ? `${otherUserId}-other` : otherUserId;

            runtime = new MockLoroRuntime();
            adapter = new MockCollabAdapter();
            manager = new CollabManager({
              runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
              adapter,
              userId,
              docId,
            });

            await manager.start();

            // Simulate receiving message from another user
            const otherMsg = createCrdtUpdateMessage(docId, actualOtherUserId, bytesB64);
            adapter.simulateMessage(otherMsg);

            // Should have imported the bytes
            expect(runtime.importedBytes.length).toBe(1);

            manager.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("ignores JOIN messages from self", async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyString, nonEmptyString, async (docId, userId) => {
          runtime = new MockLoroRuntime();
          adapter = new MockCollabAdapter();
          manager = new CollabManager({
            runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
            adapter,
            userId,
            docId,
          });

          await manager.start();

          const participantsBefore = manager.getParticipants().length;

          // Simulate receiving own JOIN message
          const ownJoin = createJoinMessage(docId, userId);
          adapter.simulateMessage(ownJoin);

          // Participant count should not change (self is already in list)
          expect(manager.getParticipants().length).toBe(participantsBefore);

          manager.stop();
        }),
        { numRuns: 50 }
      );
    });

    it("ignores LEAVE messages from self", async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyString, nonEmptyString, async (docId, userId) => {
          runtime = new MockLoroRuntime();
          adapter = new MockCollabAdapter();
          manager = new CollabManager({
            runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
            adapter,
            userId,
            docId,
          });

          await manager.start();

          // Simulate receiving own LEAVE message
          const ownLeave = createLeaveMessage(docId, userId);
          adapter.simulateMessage(ownLeave);

          // Self should still be in participants
          const participants = manager.getParticipants();
          expect(participants.some((p) => p.userId === userId)).toBe(true);

          manager.stop();
        }),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: collaboration-mvp, Property 7: Participant List Consistency**
   *
   * For any sequence of JOIN and LEAVE messages, the participant list maintained
   * by CollabManager SHALL accurately reflect the set of currently connected users
   * (users who have sent JOIN but not LEAVE).
   *
   * **Validates: Requirements 6.3, 6.4**
   */
  describe("Property 7: Participant List Consistency", () => {
    it("participant list reflects JOIN/LEAVE sequence", async () => {
      // Generate a sequence of JOIN/LEAVE events
      const eventArb = fc.record({
        userId: nonEmptyString,
        action: fc.constantFrom("JOIN" as const, "LEAVE" as const),
      });

      await fc.assert(
        fc.asyncProperty(
          nonEmptyString,
          nonEmptyString,
          fc.array(eventArb, { minLength: 1, maxLength: 20 }),
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: property-based test enumerates many event sequences
          async (docId, selfUserId, events) => {
            runtime = new MockLoroRuntime();
            adapter = new MockCollabAdapter();
            manager = new CollabManager({
              runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
              adapter,
              userId: selfUserId,
              docId,
            });

            await manager.start();

            // Track expected participants (excluding self)
            const expectedParticipants = new Set<string>();

            for (const event of events) {
              // Skip events from self (they are ignored)
              if (event.userId === selfUserId) {
                continue;
              }

              if (event.action === "JOIN") {
                const msg = createJoinMessage(docId, event.userId);
                adapter.simulateMessage(msg);
                expectedParticipants.add(event.userId);
              } else {
                const msg = createLeaveMessage(docId, event.userId);
                adapter.simulateMessage(msg);
                expectedParticipants.delete(event.userId);
              }
            }

            // Verify participant list matches expected
            const actualParticipants = manager.getParticipants();
            const actualUserIds = new Set(actualParticipants.map((p) => p.userId));

            // Self should always be in the list
            expect(actualUserIds.has(selfUserId)).toBe(true);

            // All expected participants should be in the list
            for (const userId of expectedParticipants) {
              expect(actualUserIds.has(userId)).toBe(true);
            }

            // No unexpected participants (except self)
            for (const userId of actualUserIds) {
              if (userId !== selfUserId) {
                expect(expectedParticipants.has(userId)).toBe(true);
              }
            }

            manager.stop();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("JOIN adds participant to list", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonEmptyString,
          nonEmptyString,
          nonEmptyString,
          async (docId, selfUserId, otherUserId) => {
            const actualOtherUserId =
              selfUserId === otherUserId ? `${otherUserId}-other` : otherUserId;

            runtime = new MockLoroRuntime();
            adapter = new MockCollabAdapter();
            manager = new CollabManager({
              runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
              adapter,
              userId: selfUserId,
              docId,
            });

            await manager.start();

            const participantsBefore = manager.getParticipants();
            expect(participantsBefore.some((p) => p.userId === actualOtherUserId)).toBe(false);

            // Simulate JOIN from other user
            const joinMsg = createJoinMessage(docId, actualOtherUserId);
            adapter.simulateMessage(joinMsg);

            const participantsAfter = manager.getParticipants();
            expect(participantsAfter.some((p) => p.userId === actualOtherUserId)).toBe(true);

            manager.stop();
          }
        ),
        { numRuns: 50 }
      );
    });

    it("LEAVE removes participant from list", async () => {
      await fc.assert(
        fc.asyncProperty(
          nonEmptyString,
          nonEmptyString,
          nonEmptyString,
          async (docId, selfUserId, otherUserId) => {
            const actualOtherUserId =
              selfUserId === otherUserId ? `${otherUserId}-other` : otherUserId;

            runtime = new MockLoroRuntime();
            adapter = new MockCollabAdapter();
            manager = new CollabManager({
              runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
              adapter,
              userId: selfUserId,
              docId,
            });

            await manager.start();

            // First, add the other user
            const joinMsg = createJoinMessage(docId, actualOtherUserId);
            adapter.simulateMessage(joinMsg);
            expect(manager.getParticipants().some((p) => p.userId === actualOtherUserId)).toBe(
              true
            );

            // Then, remove them
            const leaveMsg = createLeaveMessage(docId, actualOtherUserId);
            adapter.simulateMessage(leaveMsg);
            expect(manager.getParticipants().some((p) => p.userId === actualOtherUserId)).toBe(
              false
            );

            manager.stop();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Local Update Handling", () => {
    it("sends CRDT_UPDATE on local changes", async () => {
      manager = new CollabManager({
        runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
        adapter,
        userId: "user1",
        docId: "doc1",
      });

      await manager.start();

      // Simulate local update
      const testBytes = new Uint8Array([1, 2, 3, 4]);
      runtime.simulateLocalUpdate(testBytes);

      // Should have sent a CRDT_UPDATE message
      const crdtMessages = adapter.sentMessages.filter((m) => m.type === "CRDT_UPDATE");
      expect(crdtMessages.length).toBe(1);
      expect(crdtMessages[0].senderId).toBe("user1");

      manager.stop();
    });
  });

  describe("Presence Handling", () => {
    it("updates participant presence on PRESENCE message", async () => {
      manager = new CollabManager({
        runtime: runtime as unknown as import("../../runtime/loroRuntime").LoroRuntime,
        adapter,
        userId: "user1",
        docId: "doc1",
      });

      await manager.start();

      // Add another user
      const joinMsg = createJoinMessage("doc1", "user2");
      adapter.simulateMessage(joinMsg);

      // Send presence update
      const presenceMsg = createPresenceMessage("doc1", "user2", {
        displayName: "User Two",
        status: "active",
      });
      adapter.simulateMessage(presenceMsg);

      // Check presence was updated
      const participants = manager.getParticipants();
      const user2 = participants.find((p) => p.userId === "user2");
      expect(user2?.presence?.displayName).toBe("User Two");
      expect(user2?.presence?.status).toBe("active");

      manager.stop();
    });
  });
});
