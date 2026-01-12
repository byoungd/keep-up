/**
 * Collaboration Metrics - MetricsCollector Property Tests
 *
 * Property-based tests for metrics accuracy.
 * Uses fast-check for generating random test inputs.
 *
 * **Feature: collab-permissions-audit, Property 6: Metrics Accuracy**
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6**
 */

import * as fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import { MetricsCollector } from "../metrics/metricsCollector";

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/** Generate a valid document ID */
const docIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate a valid client ID */
const clientIdArb = fc.string({ minLength: 1, maxLength: 50 });

/** Generate an error type */
const errorTypeArb = fc.constantFrom(
  "PERMISSION_DENIED",
  "INVALID_TOKEN",
  "UNKNOWN",
  "CONNECTION_ERROR",
  "TIMEOUT"
);

/** Event type for simulation */
type EventType = "JOIN" | "LEAVE" | "UPDATE" | "RECONNECT" | "PERMISSION_DENIED" | "ERROR";

/** Generate an event for simulation */
const eventArb: fc.Arbitrary<{
  type: EventType;
  docId: string;
  clientId: string;
  errorType?: string;
}> = fc.record({
  type: fc.constantFrom(
    "JOIN" as const,
    "LEAVE" as const,
    "UPDATE" as const,
    "RECONNECT" as const,
    "PERMISSION_DENIED" as const,
    "ERROR" as const
  ),
  docId: docIdArb,
  clientId: clientIdArb,
  errorType: fc.option(errorTypeArb, { nil: undefined }),
});

// ============================================================================
// Property Tests
// ============================================================================

describe("MetricsCollector Property Tests", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  /**
   * **Feature: collab-permissions-audit, Property 6: Metrics Accuracy**
   *
   * For any sequence of JOIN, LEAVE, UPDATE, and ERROR events, the metrics SHALL
   * accurately reflect the counts: active connections equals joins minus leaves per doc,
   * update count matches actual updates per doc, permission denied count matches actual denials.
   *
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6**
   */
  describe("Property 6: Metrics Accuracy", () => {
    it("active connections equals joins minus leaves per doc", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom("JOIN" as const, "LEAVE" as const),
              docId: docIdArb,
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (events) => {
            // Track expected counts
            const expectedCounts = new Map<string, number>();

            for (const event of events) {
              if (event.type === "JOIN") {
                collector.recordJoin(event.docId);
                const current = expectedCounts.get(event.docId) ?? 0;
                expectedCounts.set(event.docId, current + 1);
              } else {
                collector.recordLeave(event.docId);
                const current = expectedCounts.get(event.docId) ?? 0;
                expectedCounts.set(event.docId, Math.max(0, current - 1));
              }
            }

            // Verify counts match
            for (const [docId, expected] of expectedCounts) {
              const actual = collector.getActiveConnections(docId);
              expect(actual).toBe(expected);
            }

            // Reset for next iteration
            collector.reset();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("join count matches actual joins", () => {
      fc.assert(
        fc.property(fc.array(docIdArb, { minLength: 1, maxLength: 50 }), (docIds) => {
          for (const docId of docIds) {
            collector.recordJoin(docId);
          }

          const metrics = collector.getMetrics();
          expect(metrics.joinCount).toBe(docIds.length);

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("leave count matches actual leaves", () => {
      fc.assert(
        fc.property(fc.array(docIdArb, { minLength: 1, maxLength: 50 }), (docIds) => {
          for (const docId of docIds) {
            collector.recordLeave(docId);
          }

          const metrics = collector.getMetrics();
          expect(metrics.leaveCount).toBe(docIds.length);

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("update count matches actual updates per doc", () => {
      fc.assert(
        fc.property(fc.array(docIdArb, { minLength: 1, maxLength: 50 }), (docIds) => {
          // Track expected counts
          const expectedCounts = new Map<string, number>();

          for (const docId of docIds) {
            collector.recordUpdate(docId);
            const current = expectedCounts.get(docId) ?? 0;
            expectedCounts.set(docId, current + 1);
          }

          // Verify counts match
          for (const [docId, expected] of expectedCounts) {
            const actual = collector.getUpdateCount(docId);
            expect(actual).toBe(expected);
          }

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("reconnect count matches actual reconnects per client", () => {
      fc.assert(
        fc.property(fc.array(clientIdArb, { minLength: 1, maxLength: 50 }), (clientIds) => {
          // Track expected counts
          const expectedCounts = new Map<string, number>();

          for (const clientId of clientIds) {
            collector.recordReconnect(clientId);
            const current = expectedCounts.get(clientId) ?? 0;
            expectedCounts.set(clientId, current + 1);
          }

          // Verify counts match
          for (const [clientId, expected] of expectedCounts) {
            const actual = collector.getReconnectCount(clientId);
            expect(actual).toBe(expected);
          }

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("permission denied count matches actual denials", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
          for (let i = 0; i < count; i++) {
            collector.recordPermissionDenied();
          }

          const metrics = collector.getMetrics();
          expect(metrics.permissionDeniedCount).toBe(count);

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("error count by type matches actual errors", () => {
      fc.assert(
        fc.property(fc.array(errorTypeArb, { minLength: 1, maxLength: 50 }), (errorTypes) => {
          // Track expected counts
          const expectedCounts = new Map<string, number>();

          for (const errorType of errorTypes) {
            collector.recordError(errorType);
            const current = expectedCounts.get(errorType) ?? 0;
            expectedCounts.set(errorType, current + 1);
          }

          // Verify counts match
          for (const [errorType, expected] of expectedCounts) {
            const actual = collector.getErrorCount(errorType);
            expect(actual).toBe(expected);
          }

          collector.reset();
        }),
        { numRuns: 100 }
      );
    });

    it("total active connections is sum of per-doc connections", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom("JOIN" as const, "LEAVE" as const),
              docId: docIdArb,
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (events) => {
            for (const event of events) {
              if (event.type === "JOIN") {
                collector.recordJoin(event.docId);
              } else {
                collector.recordLeave(event.docId);
              }
            }

            const metrics = collector.getMetrics();
            const sumOfPerDoc = Object.values(metrics.activeConnectionsByDoc).reduce(
              (sum, count) => sum + count,
              0
            );

            expect(collector.getTotalActiveConnections()).toBe(sumOfPerDoc);

            collector.reset();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Prometheus Format", () => {
    it("produces valid Prometheus output", () => {
      fc.assert(
        fc.property(
          fc.array(eventArb, { minLength: 1, maxLength: 20 }),
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: property-based validation over varied event sequences
          (events) => {
            for (const event of events) {
              switch (event.type) {
                case "JOIN":
                  collector.recordJoin(event.docId);
                  break;
                case "LEAVE":
                  collector.recordLeave(event.docId);
                  break;
                case "UPDATE":
                  collector.recordUpdate(event.docId);
                  break;
                case "RECONNECT":
                  collector.recordReconnect(event.clientId);
                  break;
                case "PERMISSION_DENIED":
                  collector.recordPermissionDenied();
                  break;
                case "ERROR":
                  if (event.errorType) {
                    collector.recordError(event.errorType);
                  }
                  break;
              }
            }

            const prometheus = collector.toPrometheus();

            // Should be non-empty
            expect(prometheus.length).toBeGreaterThan(0);

            // Should contain expected metric names
            expect(prometheus).toContain("collab_active_connections");
            expect(prometheus).toContain("collab_joins_total");
            expect(prometheus).toContain("collab_leaves_total");
            expect(prometheus).toContain("collab_permission_denied_total");

            // Should have valid format (lines starting with # or metric name)
            const lines = prometheus.split("\n");
            for (const line of lines) {
              if (line.length > 0) {
                expect(line.startsWith("#") || line.startsWith("collab_")).toBe(true);
              }
            }

            collector.reset();
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

describe("MetricsCollector Unit Tests", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe("edge cases", () => {
    it("leave without join doesn't go negative", () => {
      collector.recordLeave("doc1");
      expect(collector.getActiveConnections("doc1")).toBe(0);
    });

    it("multiple leaves don't go negative", () => {
      collector.recordJoin("doc1");
      collector.recordLeave("doc1");
      collector.recordLeave("doc1");
      collector.recordLeave("doc1");
      expect(collector.getActiveConnections("doc1")).toBe(0);
    });

    it("reset clears all metrics", () => {
      collector.recordJoin("doc1");
      collector.recordUpdate("doc1");
      collector.recordReconnect("client1");
      collector.recordPermissionDenied();
      collector.recordError("UNKNOWN");

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.joinCount).toBe(0);
      expect(metrics.leaveCount).toBe(0);
      expect(metrics.permissionDeniedCount).toBe(0);
      expect(Object.keys(metrics.activeConnectionsByDoc).length).toBe(0);
      expect(Object.keys(metrics.updateCountByDoc).length).toBe(0);
      expect(Object.keys(metrics.reconnectCountByClient).length).toBe(0);
      expect(Object.keys(metrics.errorCountByType).length).toBe(0);
    });

    it("permission denied also records error", () => {
      collector.recordPermissionDenied();

      expect(collector.getErrorCount("PERMISSION_DENIED")).toBe(1);
    });
  });

  describe("prometheus format", () => {
    it("escapes special characters in labels", () => {
      collector.recordJoin('doc"with"quotes');
      collector.recordJoin("doc\\with\\backslash");
      collector.recordJoin("doc\nwith\nnewline");

      const prometheus = collector.toPrometheus();

      // Should escape quotes
      expect(prometheus).toContain('\\"');
      // Should escape backslashes
      expect(prometheus).toContain("\\\\");
      // Should escape newlines
      expect(prometheus).toContain("\\n");
    });
  });
});
