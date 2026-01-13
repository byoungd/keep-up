/**
 * LFCC v0.9 RC - Debug Export
 *
 * Exports sanitized repro bundles for debugging fail-closed events.
 * Dev-only endpoint - should not be exposed in production.
 */

import { getMetrics, hasMetricsRegistry, initMetricsRegistry } from "./metrics.js";
import { getTracer } from "./tracer.js";
import type { FailClosedEvent, ReproBundle } from "./types.js";

// ============================================================================
// Repro Bundle Builder
// ============================================================================

export type ReproBundleOptions = {
  docId: string;
  /** Include last N operations */
  opLogLimit?: number;
  /** Include last N fail-closed events */
  failClosedLimit?: number;
  /** Anonymize content (replace text with placeholders) */
  anonymize?: boolean;
};

/** Operation log entry for repro */
type OpLogEntry = {
  seq: number;
  type: string;
  frontierTag: string;
  timestamp: string;
  durationMs: number;
  outcome: string;
};

/** In-memory operation log (dev only) */
const opLog: OpLogEntry[] = [];
const failClosedEvents: FailClosedEvent[] = [];
const MAX_OP_LOG = 1000;
const MAX_FAIL_CLOSED = 100;

// ============================================================================
// Recording Functions
// ============================================================================

/** Record operation for repro bundle */
export function recordOperation(entry: Omit<OpLogEntry, "seq">): void {
  opLog.push({
    seq: opLog.length + 1,
    ...entry,
  });

  // Trim if over limit
  if (opLog.length > MAX_OP_LOG) {
    opLog.splice(0, opLog.length - MAX_OP_LOG);
  }
}

/** Record fail-closed event */
export function recordFailClosedEvent(event: FailClosedEvent): void {
  failClosedEvents.push(event);

  // Trim if over limit
  if (failClosedEvents.length > MAX_FAIL_CLOSED) {
    failClosedEvents.splice(0, failClosedEvents.length - MAX_FAIL_CLOSED);
  }
}

// ============================================================================
// Export Functions
// ============================================================================

/** Build repro bundle for a document */
export function buildReproBundle(options: ReproBundleOptions): ReproBundle {
  const { docId, opLogLimit = 100, failClosedLimit = 20, anonymize = true } = options;

  ensureMetricsRegistry();

  // Filter ops for this doc
  const docOps = opLog
    .filter((op) => op.frontierTag.includes(docId) || true) // Simplified filter
    .slice(-opLogLimit);

  // Filter fail-closed events for this doc
  const docFailClosed = failClosedEvents
    .filter((e) => e.context.docId === docId)
    .slice(-failClosedLimit);

  // Calculate metrics summary
  const _metrics = getMetrics();
  const latencies = docOps.map((op) => op.durationMs).filter((d) => d > 0);
  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95Latency = sortedLatencies[p95Index] ?? 0;

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    docId,
    opLog: anonymize ? anonymizeOpLog(docOps) : docOps,
    snapshot: {
      blockCount: 0, // Would be populated from actual doc
      annotationCount: 0,
      structure: null, // Would be populated from actual doc structure
    },
    failClosedEvents: anonymize ? anonymizeFailClosed(docFailClosed) : docFailClosed,
    metricsSummary: {
      totalOps: docOps.length,
      failedOps: docOps.filter((op) => op.outcome !== "success").length,
      avgLatencyMs: Math.round(avgLatency),
      p95LatencyMs: Math.round(p95Latency),
    },
  };
}

/** Export repro bundle as JSON string */
export function exportReproBundle(options: ReproBundleOptions): string {
  const bundle = buildReproBundle(options);
  return JSON.stringify(bundle, null, 2);
}

/** Clear all recorded data */
export function clearReproData(): void {
  opLog.length = 0;
  failClosedEvents.length = 0;
}

// ============================================================================
// Anonymization
// ============================================================================

function anonymizeOpLog(ops: OpLogEntry[]): OpLogEntry[] {
  return ops.map((op) => ({
    ...op,
    // Keep structure, anonymize any potential PII in frontierTag
    frontierTag: hashString(op.frontierTag),
  }));
}

function anonymizeFailClosed(events: FailClosedEvent[]): FailClosedEvent[] {
  return events.map((event) => ({
    ...event,
    context: {
      ...event.context,
      clientId: hashString(event.context.clientId),
      sessionId: hashString(event.context.sessionId),
    },
    details: {
      ...event.details,
      // Remove potentially sensitive data
      expected: event.details.expected ? "[redacted]" : undefined,
      actual: event.details.actual ? "[redacted]" : undefined,
    },
  }));
}

function hashString(str: string): string {
  // Simple hash for anonymization (not cryptographic)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `anon-${Math.abs(hash).toString(36)}`;
}

// ============================================================================
// HTTP Handler (for dev server)
// ============================================================================

export type DebugExportHandler = {
  /** Handle GET /debug/repro/:docId */
  handleReproRequest: (
    docId: string,
    query: Record<string, string>
  ) => {
    status: number;
    body: string;
    contentType: string;
  };
  /** Handle GET /debug/metrics */
  handleMetricsRequest: () => {
    status: number;
    body: string;
    contentType: string;
  };
  /** Handle GET /debug/traces/:traceId */
  handleTraceRequest: (traceId: string) => {
    status: number;
    body: string;
    contentType: string;
  };
};

export function createDebugExportHandler(): DebugExportHandler {
  return {
    handleReproRequest(docId, query) {
      try {
        ensureMetricsRegistry();
        const bundle = exportReproBundle({
          docId,
          opLogLimit: Number.parseInt(query.opLimit ?? "100", 10),
          failClosedLimit: Number.parseInt(query.failLimit ?? "20", 10),
          anonymize: query.anonymize !== "false",
        });

        return {
          status: 200,
          body: bundle,
          contentType: "application/json",
        };
      } catch (error) {
        return {
          status: 500,
          body: JSON.stringify({ error: String(error) }),
          contentType: "application/json",
        };
      }
    },

    handleMetricsRequest() {
      ensureMetricsRegistry();
      const metrics = getMetrics();
      return {
        status: 200,
        body: metrics.toPrometheusText(),
        contentType: "text/plain",
      };
    },

    handleTraceRequest(traceId) {
      const tracer = getTracer();
      const spans = tracer.getTrace(traceId);

      if (spans.length === 0) {
        return {
          status: 404,
          body: JSON.stringify({ error: "Trace not found" }),
          contentType: "application/json",
        };
      }

      return {
        status: 200,
        body: JSON.stringify(spans, null, 2),
        contentType: "application/json",
      };
    },
  };
}

function ensureMetricsRegistry(): void {
  if (!hasMetricsRegistry()) {
    initMetricsRegistry();
  }
}
