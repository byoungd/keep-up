/**
 * Collaboration Permissions - PermissionEnforcer Property Tests
 *
 * Property-based tests for role-based permission enforcement.
 * Uses fast-check for generating random test inputs.
 *
 * **Feature: collab-permissions-audit, Property 1: Role-Based Permission Enforcement**
 * **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**
 */

import * as fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import { type ClientSession, PermissionEnforcer } from "../permissions/permissionEnforcer";
import type { Role } from "../permissions/types";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generate a valid connection ID */
const connectionIdArb = fc.uuid();

/** Generate a valid user ID */
const userIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid document ID */
const docIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid role */
const roleArb: fc.Arbitrary<Role> = fc.constantFrom("editor" as const, "viewer" as const);

/** Generate a valid message type */
const messageTypeArb = fc.constantFrom("CRDT_UPDATE", "JOIN", "LEAVE", "PRESENCE", "ERROR");

/** Generate a valid client session */
const clientSessionArb: fc.Arbitrary<ClientSession> = fc.record({
  connectionId: connectionIdArb,
  userId: userIdArb,
  role: roleArb,
  docId: docIdArb,
  joinedAt: fc.nat(),
});

// ============================================================================
// Property Tests
// ============================================================================

describe("PermissionEnforcer Property Tests", () => {
  let enforcer: PermissionEnforcer;

  beforeEach(() => {
    enforcer = new PermissionEnforcer();
  });

  /**
   * **Feature: collab-permissions-audit, Property 1: Role-Based Permission Enforcement**
   *
   * For any client with role `viewer` sending a CRDT_UPDATE message, the server SHALL
   * reject the message with `PERMISSION_DENIED` and NOT broadcast it to other clients.
   * For any client with role `editor` sending a CRDT_UPDATE message, the server SHALL
   * allow the message to pass through and broadcast it.
   *
   * **Validates: Requirements 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**
   */
  describe("Property 1: Role-Based Permission Enforcement", () => {
    it("viewers cannot send CRDT_UPDATE", () => {
      fc.assert(
        fc.property(
          connectionIdArb,
          userIdArb,
          docIdArb,
          fc.nat(),
          (connectionId, userId, docId, joinedAt) => {
            const session: ClientSession = {
              connectionId,
              userId,
              role: "viewer",
              docId,
              joinedAt,
            };

            enforcer.registerSession(session);
            const result = enforcer.checkPermission(connectionId, "CRDT_UPDATE");

            expect(result.allowed).toBe(false);
            if (!result.allowed) {
              expect(result.error).toBe("PERMISSION_DENIED");
            }

            // Cleanup
            enforcer.unregisterSession(connectionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("editors can send CRDT_UPDATE", () => {
      fc.assert(
        fc.property(
          connectionIdArb,
          userIdArb,
          docIdArb,
          fc.nat(),
          (connectionId, userId, docId, joinedAt) => {
            const session: ClientSession = {
              connectionId,
              userId,
              role: "editor",
              docId,
              joinedAt,
            };

            enforcer.registerSession(session);
            const result = enforcer.checkPermission(connectionId, "CRDT_UPDATE");

            expect(result.allowed).toBe(true);

            // Cleanup
            enforcer.unregisterSession(connectionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("all roles can send non-CRDT_UPDATE messages", () => {
      fc.assert(
        fc.property(
          clientSessionArb,
          fc.constantFrom("JOIN", "LEAVE", "PRESENCE"),
          (session, messageType) => {
            enforcer.registerSession(session);
            const result = enforcer.checkPermission(session.connectionId, messageType);

            expect(result.allowed).toBe(true);

            // Cleanup
            enforcer.unregisterSession(session.connectionId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("unknown connections are rejected", () => {
      fc.assert(
        fc.property(connectionIdArb, messageTypeArb, (connectionId, messageType) => {
          // Don't register any session
          const result = enforcer.checkPermission(connectionId, messageType);

          expect(result.allowed).toBe(false);
          if (!result.allowed) {
            expect(result.error).toBe("UNKNOWN");
          }
        }),
        { numRuns: 100 }
      );
    });

    it("static canRolePerform matches instance behavior", () => {
      fc.assert(
        fc.property(clientSessionArb, messageTypeArb, (session, messageType) => {
          enforcer.registerSession(session);

          const instanceResult = enforcer.checkPermission(session.connectionId, messageType);
          const staticResult = PermissionEnforcer.canRolePerform(session.role, messageType);

          // Static method should match instance method for registered sessions
          expect(instanceResult.allowed).toBe(staticResult);

          // Cleanup
          enforcer.unregisterSession(session.connectionId);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Session Management", () => {
    it("registered sessions can be retrieved", () => {
      fc.assert(
        fc.property(clientSessionArb, (session) => {
          enforcer.registerSession(session);

          const retrieved = enforcer.getSession(session.connectionId);
          expect(retrieved).toEqual(session);

          // Cleanup
          enforcer.unregisterSession(session.connectionId);
        }),
        { numRuns: 100 }
      );
    });

    it("unregistered sessions return undefined", () => {
      fc.assert(
        fc.property(clientSessionArb, (session) => {
          enforcer.registerSession(session);
          const removed = enforcer.unregisterSession(session.connectionId);

          expect(removed).toEqual(session);
          expect(enforcer.getSession(session.connectionId)).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("session count is accurate", () => {
      fc.assert(
        fc.property(fc.array(clientSessionArb, { minLength: 0, maxLength: 10 }), (sessions) => {
          // Use unique connection IDs
          const uniqueSessions = sessions.filter(
            (s, i, arr) => arr.findIndex((x) => x.connectionId === s.connectionId) === i
          );

          for (const session of uniqueSessions) {
            enforcer.registerSession(session);
          }

          expect(enforcer.getSessionCount()).toBe(uniqueSessions.length);

          // Cleanup
          enforcer.clear();
        }),
        { numRuns: 100 }
      );
    });

    it("getSessionsByDoc returns correct sessions", () => {
      fc.assert(
        fc.property(
          fc.array(clientSessionArb, { minLength: 1, maxLength: 10 }),
          docIdArb,
          (sessions, targetDocId) => {
            // Ensure unique connection IDs and set some to target doc
            const uniqueSessions = sessions
              .filter((s, i, arr) => arr.findIndex((x) => x.connectionId === s.connectionId) === i)
              .map((s, i) => ({
                ...s,
                docId: i % 2 === 0 ? targetDocId : s.docId,
              }));

            for (const session of uniqueSessions) {
              enforcer.registerSession(session);
            }

            const docSessions = enforcer.getSessionsByDoc(targetDocId);
            const expectedCount = uniqueSessions.filter((s) => s.docId === targetDocId).length;

            expect(docSessions.length).toBe(expectedCount);
            for (const session of docSessions) {
              expect(session.docId).toBe(targetDocId);
            }

            // Cleanup
            enforcer.clear();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// Unit Tests for Edge Cases
// ============================================================================

describe("PermissionEnforcer Unit Tests", () => {
  let enforcer: PermissionEnforcer;

  beforeEach(() => {
    enforcer = new PermissionEnforcer();
  });

  describe("permission checks", () => {
    it("viewer CRDT_UPDATE is denied", () => {
      enforcer.registerSession({
        connectionId: "conn1",
        userId: "user1",
        role: "viewer",
        docId: "doc1",
        joinedAt: Date.now(),
      });

      const result = enforcer.checkPermission("conn1", "CRDT_UPDATE");
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.error).toBe("PERMISSION_DENIED");
      }
    });

    it("editor CRDT_UPDATE is allowed", () => {
      enforcer.registerSession({
        connectionId: "conn1",
        userId: "user1",
        role: "editor",
        docId: "doc1",
        joinedAt: Date.now(),
      });

      const result = enforcer.checkPermission("conn1", "CRDT_UPDATE");
      expect(result.allowed).toBe(true);
    });

    it("viewer can send JOIN", () => {
      enforcer.registerSession({
        connectionId: "conn1",
        userId: "user1",
        role: "viewer",
        docId: "doc1",
        joinedAt: Date.now(),
      });

      const result = enforcer.checkPermission("conn1", "JOIN");
      expect(result.allowed).toBe(true);
    });

    it("viewer can send PRESENCE", () => {
      enforcer.registerSession({
        connectionId: "conn1",
        userId: "user1",
        role: "viewer",
        docId: "doc1",
        joinedAt: Date.now(),
      });

      const result = enforcer.checkPermission("conn1", "PRESENCE");
      expect(result.allowed).toBe(true);
    });
  });

  describe("clear", () => {
    it("removes all sessions", () => {
      enforcer.registerSession({
        connectionId: "conn1",
        userId: "user1",
        role: "editor",
        docId: "doc1",
        joinedAt: Date.now(),
      });
      enforcer.registerSession({
        connectionId: "conn2",
        userId: "user2",
        role: "viewer",
        docId: "doc1",
        joinedAt: Date.now(),
      });

      expect(enforcer.getSessionCount()).toBe(2);

      enforcer.clear();

      expect(enforcer.getSessionCount()).toBe(0);
      expect(enforcer.getSession("conn1")).toBeUndefined();
      expect(enforcer.getSession("conn2")).toBeUndefined();
    });
  });
});
