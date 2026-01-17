/**
 * Collaboration MVP - SyncMessage Property Tests
 *
 * Property-based tests for SyncMessage types and validation.
 * Uses fast-check for generating random test inputs.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type CrdtUpdateMessage,
  createCrdtUpdateMessage,
  createErrorMessage,
  createJoinMessage,
  createLeaveMessage,
  createPresenceMessage,
  deserializeSyncMessage,
  type ErrorMessage,
  isCrdtUpdateMessage,
  isErrorMessage,
  isJoinMessage,
  isLeaveMessage,
  isPresenceMessage,
  isSyncMessageBase,
  isValidErrorCode,
  isValidRole,
  isValidSyncMessage,
  type JoinMessage,
  type LeaveMessage,
  type PresenceMessage,
  type PresencePayload,
  type Role,
  type SyncMessage,
  serializeSyncMessage,
} from "../collabMessages";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generate a non-empty string for docId/senderId */
const nonEmptyString = fc.string({ minLength: 1, maxLength: 100 });

/** Generate a valid base64 string */
const base64String = fc.uint8Array({ minLength: 0, maxLength: 1000 }).map((arr) => {
  // Use btoa for browser-compatible base64 encoding
  return btoa(String.fromCharCode(...arr));
});

/** Generate a valid Role */
const roleArb: fc.Arbitrary<Role> = fc.constantFrom("editor" as const, "viewer" as const);

/** Generate a valid PresencePayload */
const presencePayloadArb: fc.Arbitrary<PresencePayload> = fc.record(
  {
    displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    cursor: fc.option(
      fc.record({
        blockId: nonEmptyString,
        offset: fc.nat({ max: 10000 }),
      }),
      { nil: undefined }
    ),
    status: fc.option(fc.constantFrom("active" as const, "idle" as const, "away" as const), {
      nil: undefined,
    }),
    stateHash: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: undefined }),
  },
  { requiredKeys: [] }
);

/** Generate a valid CrdtUpdateMessage */
const crdtUpdateMessageArb: fc.Arbitrary<CrdtUpdateMessage> = fc
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

/** Generate a valid JoinMessage */
const joinMessageArb: fc.Arbitrary<JoinMessage> = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
    role: fc.option(roleArb, { nil: undefined }),
  })
  .map(({ docId, senderId, role }) => {
    const msg: JoinMessage = {
      type: "JOIN" as const,
      docId,
      senderId,
      ts: Date.now(),
    };
    if (role !== undefined) {
      msg.role = role;
    }
    return msg;
  });

/** Generate a valid LeaveMessage */
const leaveMessageArb: fc.Arbitrary<LeaveMessage> = fc
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

/** Generate a valid PresenceMessage */
const presenceMessageArb: fc.Arbitrary<PresenceMessage> = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
    payload: presencePayloadArb,
  })
  .map(({ docId, senderId, payload }) => ({
    type: "PRESENCE" as const,
    docId,
    senderId,
    ts: Date.now(),
    payload,
  }));

/** Generate a valid ErrorMessage */
const errorMessageArb: fc.Arbitrary<ErrorMessage> = fc
  .record({
    docId: nonEmptyString,
    senderId: nonEmptyString,
    code: fc.constantFrom(
      "PERMISSION_DENIED" as const,
      "INVALID_TOKEN" as const,
      "UNKNOWN" as const
    ),
  })
  .map(({ docId, senderId, code }) => ({
    type: "ERROR" as const,
    docId,
    senderId,
    ts: Date.now(),
    code,
  }));

/** Generate any valid SyncMessage */
const syncMessageArb: fc.Arbitrary<SyncMessage> = fc.oneof(
  crdtUpdateMessageArb,
  joinMessageArb,
  leaveMessageArb,
  presenceMessageArb,
  errorMessageArb
);

// ============================================================================
// Property Tests
// ============================================================================

describe("SyncMessage Property Tests", () => {
  /**
   * **Feature: collaboration-mvp, Property 1: SyncMessage Structure Validity**
   *
   * For any SyncMessage created by the system, the message SHALL contain valid
   * `docId` (non-empty string), `senderId` (non-empty string), and `ts` (positive number) fields.
   * For CRDT_UPDATE messages, the `bytesB64` field SHALL be valid base64-encoded data.
   * For ERROR messages, the `code` field SHALL be a valid ErrorCode.
   *
   * **Validates: Requirements 1.3, 1.4, 5.1, 5.2, 5.3**
   */
  describe("Property 1: SyncMessage Structure Validity", () => {
    it("all generated SyncMessages have valid base fields", () => {
      fc.assert(
        fc.property(syncMessageArb, (msg) => {
          // docId must be non-empty string
          expect(typeof msg.docId).toBe("string");
          expect(msg.docId.length).toBeGreaterThan(0);

          // senderId must be non-empty string
          expect(typeof msg.senderId).toBe("string");
          expect(msg.senderId.length).toBeGreaterThan(0);

          // ts must be positive number
          expect(typeof msg.ts).toBe("number");
          expect(msg.ts).toBeGreaterThan(0);

          // type must be valid
          expect(["CRDT_UPDATE", "JOIN", "LEAVE", "PRESENCE", "ERROR"]).toContain(msg.type);
        }),
        { numRuns: 100 }
      );
    });

    it("CRDT_UPDATE messages have valid bytesB64 field", () => {
      fc.assert(
        fc.property(crdtUpdateMessageArb, (msg) => {
          expect(typeof msg.bytesB64).toBe("string");
          // Verify it's valid base64 by attempting to decode
          expect(() => atob(msg.bytesB64)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it("ERROR messages have valid code field", () => {
      fc.assert(
        fc.property(errorMessageArb, (msg) => {
          expect(typeof msg.code).toBe("string");
          expect(["PERMISSION_DENIED", "INVALID_TOKEN", "UNKNOWN"]).toContain(msg.code);
          expect(isValidErrorCode(msg.code)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("JOIN messages with role have valid role field", () => {
      fc.assert(
        fc.property(joinMessageArb, (msg) => {
          if (msg.role !== undefined) {
            expect(["editor", "viewer"]).toContain(msg.role);
            expect(isValidRole(msg.role)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("factory functions create valid messages", () => {
      fc.assert(
        fc.property(
          nonEmptyString,
          nonEmptyString,
          base64String,
          fc.option(roleArb, { nil: undefined }),
          (docId, senderId, bytesB64, role) => {
            const crdtMsg = createCrdtUpdateMessage(docId, senderId, bytesB64);
            expect(isCrdtUpdateMessage(crdtMsg)).toBe(true);

            const joinMsg = createJoinMessage(docId, senderId, role);
            expect(isJoinMessage(joinMsg)).toBe(true);
            if (role !== undefined) {
              expect(joinMsg.role).toBe(role);
            }

            const leaveMsg = createLeaveMessage(docId, senderId);
            expect(isLeaveMessage(leaveMsg)).toBe(true);

            const presenceMsg = createPresenceMessage(docId, senderId, { status: "active" });
            expect(isPresenceMessage(presenceMsg)).toBe(true);

            const errorMsg = createErrorMessage(docId, senderId, "PERMISSION_DENIED");
            expect(isErrorMessage(errorMsg)).toBe(true);
            expect(errorMsg.code).toBe("PERMISSION_DENIED");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("type guards correctly identify message types", () => {
      fc.assert(
        fc.property(syncMessageArb, (msg) => {
          // isSyncMessageBase should pass for all valid messages
          expect(isSyncMessageBase(msg)).toBe(true);

          // isValidSyncMessage should pass for all valid messages
          expect(isValidSyncMessage(msg)).toBe(true);

          // Exactly one type-specific guard should pass
          const guards = [
            isCrdtUpdateMessage(msg),
            isJoinMessage(msg),
            isLeaveMessage(msg),
            isPresenceMessage(msg),
            isErrorMessage(msg),
          ];
          expect(guards.filter(Boolean).length).toBe(1);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: collaboration-mvp, Property 2: Message Serialization Round-Trip**
   *
   * For any SyncMessage, serializing to JSON and deserializing back SHALL produce
   * an equivalent message with identical field values.
   *
   * **Validates: Requirements 2.3, 2.4**
   */
  describe("Property 2: Message Serialization Round-Trip", () => {
    it("serialize then deserialize produces equivalent message", () => {
      fc.assert(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: property-based test covers many message shapes
        fc.property(syncMessageArb, (msg) => {
          const serialized = serializeSyncMessage(msg);
          const deserialized = deserializeSyncMessage(serialized);

          // All fields should be identical
          expect(deserialized.type).toBe(msg.type);
          expect(deserialized.docId).toBe(msg.docId);
          expect(deserialized.senderId).toBe(msg.senderId);
          expect(deserialized.ts).toBe(msg.ts);

          // Type-specific fields
          if (msg.type === "CRDT_UPDATE") {
            expect((deserialized as CrdtUpdateMessage).bytesB64).toBe(msg.bytesB64);
          }
          if (msg.type === "PRESENCE") {
            expect((deserialized as PresenceMessage).payload).toEqual(msg.payload);
          }
          if (msg.type === "ERROR") {
            expect((deserialized as ErrorMessage).code).toBe((msg as ErrorMessage).code);
          }
          if (msg.type === "JOIN" && (msg as JoinMessage).role !== undefined) {
            expect((deserialized as JoinMessage).role).toBe((msg as JoinMessage).role);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("serialized message is valid JSON", () => {
      fc.assert(
        fc.property(syncMessageArb, (msg) => {
          const serialized = serializeSyncMessage(msg);
          expect(() => JSON.parse(serialized)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it("deserialized message passes validation", () => {
      fc.assert(
        fc.property(syncMessageArb, (msg) => {
          const serialized = serializeSyncMessage(msg);
          const deserialized = deserializeSyncMessage(serialized);
          expect(isValidSyncMessage(deserialized)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// Unit Tests for Edge Cases
// ============================================================================

describe("SyncMessage Unit Tests", () => {
  describe("validation rejects invalid messages", () => {
    it("rejects null", () => {
      expect(isValidSyncMessage(null)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isValidSyncMessage(undefined)).toBe(false);
    });

    it("rejects empty object", () => {
      expect(isValidSyncMessage({})).toBe(false);
    });

    it("rejects message with empty docId", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "",
          senderId: "user1",
          ts: Date.now(),
        })
      ).toBe(false);
    });

    it("rejects message with empty senderId", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "",
          ts: Date.now(),
        })
      ).toBe(false);
    });

    it("rejects message with invalid ts", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "user1",
          ts: -1,
        })
      ).toBe(false);
    });

    it("rejects CRDT_UPDATE without bytesB64", () => {
      expect(
        isValidSyncMessage({
          type: "CRDT_UPDATE",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
        })
      ).toBe(false);
    });

    it("rejects PRESENCE without payload", () => {
      expect(
        isValidSyncMessage({
          type: "PRESENCE",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
        })
      ).toBe(false);
    });

    it("rejects ERROR without code", () => {
      expect(
        isValidSyncMessage({
          type: "ERROR",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
        })
      ).toBe(false);
    });

    it("rejects ERROR with invalid code", () => {
      expect(
        isValidSyncMessage({
          type: "ERROR",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
          code: "INVALID_CODE",
        })
      ).toBe(false);
    });

    it("rejects JOIN with invalid role", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
          role: "admin",
        })
      ).toBe(false);
    });

    it("accepts JOIN without role", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
        })
      ).toBe(true);
    });

    it("accepts JOIN with valid role", () => {
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
          role: "editor",
        })
      ).toBe(true);
      expect(
        isValidSyncMessage({
          type: "JOIN",
          docId: "doc1",
          senderId: "user1",
          ts: Date.now(),
          role: "viewer",
        })
      ).toBe(true);
    });
  });

  describe("deserializeSyncMessage error handling", () => {
    it("throws on invalid JSON", () => {
      expect(() => deserializeSyncMessage("not json")).toThrow();
    });

    it("throws on invalid message structure", () => {
      expect(() => deserializeSyncMessage('{"foo": "bar"}')).toThrow("Invalid SyncMessage format");
    });
  });
});
