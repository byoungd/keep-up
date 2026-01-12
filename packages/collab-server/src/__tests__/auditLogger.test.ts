/**
 * Collaboration Audit - AuditLogger Property Tests
 *
 * Property-based tests for audit event structure and logging.
 * Uses fast-check for generating random test inputs.
 *
 * **Feature: collab-permissions-audit, Property 3: Audit Event Structure Validity**
 * **Feature: collab-permissions-audit, Property 4: No Content in Audit or Metrics**
 * **Feature: collab-permissions-audit, Property 5: Audit Query Correctness**
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 8.2, 8.3, 8.4, 8.5, 11.1, 11.2, 11.3, 11.4**
 */

import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuditLogger } from "../audit/auditLogger";
import type { AuditEventInput, AuditEventType } from "../audit/auditTypes";
import { isValidAuditEvent } from "../audit/auditTypes";
import { MemoryAuditStore } from "../audit/memoryAuditStore";
import type { Role } from "../permissions/types";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generate a valid document ID */
const docIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid actor ID */
const actorIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid role */
const roleArb: fc.Arbitrary<Role> = fc.constantFrom("editor" as const, "viewer" as const);

/** Generate a valid event type */
const eventTypeArb: fc.Arbitrary<AuditEventType> = fc.constantFrom(
  "JOIN" as const,
  "LEAVE" as const,
  "UPDATE" as const,
  "ERROR" as const
);

/** Generate a valid audit event input */
const auditEventInputArb: fc.Arbitrary<AuditEventInput> = fc.record({
  docId: docIdArb,
  actorId: actorIdArb,
  role: roleArb,
  eventType: eventTypeArb,
  updateBytesLen: fc.option(fc.nat({ max: 1000000 }), { nil: undefined }),
  clientInfo: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  connectionId: fc.option(fc.uuid(), { nil: undefined }),
  errorCode: fc.option(
    fc.constantFrom("PERMISSION_DENIED" as const, "INVALID_TOKEN" as const, "UNKNOWN" as const),
    { nil: undefined }
  ),
});

// ============================================================================
// Property Tests
// ============================================================================

describe("AuditLogger Property Tests", () => {
  let store: MemoryAuditStore;
  let logger: AuditLogger;

  beforeEach(() => {
    store = new MemoryAuditStore();
    logger = new AuditLogger({
      store,
      flushIntervalMs: 100000, // Long interval to control flushing manually
      batchSize: 1000,
    });
  });

  afterEach(async () => {
    await logger.stop();
  });

  /**
   * **Feature: collab-permissions-audit, Property 3: Audit Event Structure Validity**
   *
   * For any AuditEvent created by the system, the event SHALL contain valid
   * `eventId` (UUID), `ts` (positive number), `docId` (non-empty string),
   * `actorId` (non-empty string), `role` (valid role), and `eventType` (valid event type).
   * For UPDATE events, `updateBytesLen` SHALL be a non-negative integer.
   *
   * **Validates: Requirements 6.2, 6.3, 6.4**
   */
  describe("Property 3: Audit Event Structure Validity", () => {
    it("logged events have valid structure", async () => {
      await fc.assert(
        fc.asyncProperty(
          auditEventInputArb,
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: property-based validation over many inputs
          async (input) => {
            logger.log(input);
            await logger.flush();

            const events = await store.query({});
            const event = events[events.length - 1];

            // Validate structure
            expect(isValidAuditEvent(event)).toBe(true);

            // Check required fields
            expect(typeof event.eventId).toBe("string");
            expect(event.eventId.length).toBeGreaterThan(0);
            expect(typeof event.ts).toBe("number");
            expect(event.ts).toBeGreaterThan(0);
            expect(event.docId).toBe(input.docId);
            expect(event.actorId).toBe(input.actorId);
            expect(event.role).toBe(input.role);
            expect(event.eventType).toBe(input.eventType);

            // Check optional fields
            if (input.updateBytesLen !== undefined) {
              expect(event.updateBytesLen).toBe(input.updateBytesLen);
            }
            if (input.clientInfo !== undefined) {
              expect(event.clientInfo).toBe(input.clientInfo);
            }
            if (input.connectionId !== undefined) {
              expect(event.connectionId).toBe(input.connectionId);
            }
            if (input.errorCode !== undefined) {
              expect(event.errorCode).toBe(input.errorCode);
            }

            // Cleanup for next iteration
            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("UPDATE events have updateBytesLen as non-negative integer", async () => {
      await fc.assert(
        fc.asyncProperty(
          docIdArb,
          actorIdArb,
          roleArb,
          fc.nat({ max: 1000000 }),
          async (docId, actorId, role, bytesLen) => {
            logger.log({
              docId,
              actorId,
              role,
              eventType: "UPDATE",
              updateBytesLen: bytesLen,
            });
            await logger.flush();

            const events = await store.query({});
            const event = events[events.length - 1];

            expect(event.eventType).toBe("UPDATE");
            expect(event.updateBytesLen).toBe(bytesLen);
            expect(Number.isInteger(event.updateBytesLen)).toBe(true);
            expect(event.updateBytesLen).toBeGreaterThanOrEqual(0);

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("each event gets a unique eventId", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 2, maxLength: 10 }),
          async (inputs) => {
            for (const input of inputs) {
              logger.log(input);
            }
            await logger.flush();

            const events = await store.query({});
            const eventIds = events.map((e) => e.eventId);
            const uniqueIds = new Set(eventIds);

            expect(uniqueIds.size).toBe(eventIds.length);

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: collab-permissions-audit, Property 4: No Content in Audit or Metrics**
   *
   * For any AuditEvent or metric recorded by the system, the data SHALL NOT contain
   * raw CRDT bytes, document text, or any document content. For UPDATE events,
   * only the byte length SHALL be recorded.
   *
   * **Validates: Requirements 6.5, 11.1, 11.2, 11.3, 11.4**
   */
  describe("Property 4: No Content in Audit or Metrics", () => {
    it("audit events do not contain raw content", async () => {
      await fc.assert(
        fc.asyncProperty(auditEventInputArb, async (input) => {
          logger.log(input);
          await logger.flush();

          const events = await store.query({});
          const event = events[events.length - 1];

          // Serialize event to check for content
          const _serialized = JSON.stringify(event);

          // Should not contain any field that could hold raw content
          expect(event).not.toHaveProperty("content");
          expect(event).not.toHaveProperty("data");
          expect(event).not.toHaveProperty("bytes");
          expect(event).not.toHaveProperty("bytesB64");
          expect(event).not.toHaveProperty("text");
          expect(event).not.toHaveProperty("payload");

          // For UPDATE events, only byte length is stored (if provided)
          if (event.eventType === "UPDATE" && event.updateBytesLen !== undefined) {
            expect(typeof event.updateBytesLen).toBe("number");
          }

          store.clear();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: collab-permissions-audit, Property 5: Audit Query Correctness**
   *
   * For any audit query with filters (docId, since, limit), the returned events
   * SHALL only include events matching all specified filters, SHALL be sorted
   * in chronological order by timestamp, and SHALL respect the limit parameter.
   *
   * **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
   */
  describe("Property 5: Audit Query Correctness", () => {
    it("docId filter returns only matching events", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 5, maxLength: 20 }),
          docIdArb,
          async (inputs, targetDocId) => {
            // Log events with various docIds
            for (const input of inputs) {
              logger.log(input);
            }
            // Log some events with target docId
            for (let i = 0; i < 3; i++) {
              logger.log({ ...inputs[0], docId: targetDocId });
            }
            await logger.flush();

            const events = await store.query({ docId: targetDocId });

            // All returned events should have the target docId
            for (const event of events) {
              expect(event.docId).toBe(targetDocId);
            }

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("since filter returns only events after timestamp", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 5, maxLength: 20 }),
          async (inputs) => {
            // Log events
            for (const input of inputs) {
              logger.log(input);
            }
            await logger.flush();

            const allEvents = await store.query({});
            if (allEvents.length < 2) {
              store.clear();
              return;
            }

            // Pick a timestamp in the middle
            const midIndex = Math.floor(allEvents.length / 2);
            const sinceTs = allEvents[midIndex].ts;

            const filteredEvents = await store.query({ since: sinceTs });

            // All returned events should have ts >= sinceTs
            for (const event of filteredEvents) {
              expect(event.ts).toBeGreaterThanOrEqual(sinceTs);
            }

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("limit parameter caps results", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 10, maxLength: 30 }),
          fc.integer({ min: 1, max: 10 }),
          async (inputs, limit) => {
            for (const input of inputs) {
              logger.log(input);
            }
            await logger.flush();

            const events = await store.query({ limit });

            expect(events.length).toBeLessThanOrEqual(limit);

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("results are sorted chronologically", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 5, maxLength: 20 }),
          async (inputs) => {
            for (const input of inputs) {
              logger.log(input);
            }
            await logger.flush();

            const events = await store.query({});

            // Check chronological order
            for (let i = 1; i < events.length; i++) {
              expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
            }

            store.clear();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("combined filters work correctly", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(auditEventInputArb, { minLength: 10, maxLength: 30 }),
          docIdArb,
          fc.integer({ min: 1, max: 5 }),
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: property-based validation over many inputs
          async (inputs, targetDocId, limit) => {
            // Log events with various docIds
            for (const input of inputs) {
              logger.log(input);
            }
            // Log some events with target docId
            for (let i = 0; i < 5; i++) {
              logger.log({ ...inputs[0], docId: targetDocId });
            }
            await logger.flush();

            const allEvents = await store.query({ docId: targetDocId });
            if (allEvents.length < 2) {
              store.clear();
              return;
            }

            const midIndex = Math.floor(allEvents.length / 2);
            const sinceTs = allEvents[midIndex].ts;

            const events = await store.query({
              docId: targetDocId,
              since: sinceTs,
              limit,
            });

            // Check all filters
            expect(events.length).toBeLessThanOrEqual(limit);
            for (const event of events) {
              expect(event.docId).toBe(targetDocId);
              expect(event.ts).toBeGreaterThanOrEqual(sinceTs);
            }

            // Check chronological order
            for (let i = 1; i < events.length; i++) {
              expect(events[i].ts).toBeGreaterThanOrEqual(events[i - 1].ts);
            }

            store.clear();
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

describe("AuditLogger Unit Tests", () => {
  let store: MemoryAuditStore;
  let logger: AuditLogger;

  beforeEach(() => {
    store = new MemoryAuditStore();
    logger = new AuditLogger({
      store,
      flushIntervalMs: 100000,
      batchSize: 5,
    });
  });

  afterEach(async () => {
    await logger.stop();
  });

  describe("buffering", () => {
    it("buffers events until flush", async () => {
      logger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
      });

      expect(logger.getBufferSize()).toBe(1);
      expect(store.getEventCount()).toBe(0);

      await logger.flush();

      expect(logger.getBufferSize()).toBe(0);
      expect(store.getEventCount()).toBe(1);
    });

    it("auto-flushes when batch size reached", async () => {
      for (let i = 0; i < 5; i++) {
        logger.log({
          docId: "doc1",
          actorId: "user1",
          role: "editor",
          eventType: "JOIN",
        });
      }

      // Wait for async flush
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(store.getEventCount()).toBe(5);
    });
  });

  describe("stop", () => {
    it("flushes remaining events on stop", async () => {
      logger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
      });

      expect(store.getEventCount()).toBe(0);

      await logger.stop();

      expect(store.getEventCount()).toBe(1);
    });

    it("rejects new events after stop", async () => {
      await logger.stop();

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
        // swallow expected warning
      });

      logger.log({
        docId: "doc1",
        actorId: "user1",
        role: "editor",
        eventType: "JOIN",
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(store.getEventCount()).toBe(0);

      consoleSpy.mockRestore();
    });
  });
});

// Import vi for mocking
import { vi } from "vitest";
