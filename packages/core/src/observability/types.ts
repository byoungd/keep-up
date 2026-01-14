/**
 * LFCC v0.9 RC - Observability Types
 *
 * Core types for structured logging, metrics, and tracing.
 */

// ============================================================================
// Correlation IDs
// ============================================================================

/** Correlation context for tracing operations end-to-end */
export type CorrelationContext = {
  /** Document ID */
  docId: string;
  /** Client ID */
  clientId: string;
  /** Session ID */
  sessionId: string;
  /** Operation ID (unique per operation) */
  opId: string;
  /** Frontier tag at operation start */
  frontierTag: string;
  /** Parent span ID for nested operations */
  parentSpanId?: string;
};

// ============================================================================
// Log Levels & Events
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "sync"
  | "verification"
  | "mapping"
  | "gateway"
  | "persistence"
  | "presence"
  | "undo"
  | "ingest";

/** Structured log entry */
export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: Partial<CorrelationContext>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

// ============================================================================
// Metrics
// ============================================================================

export type MetricType = "counter" | "gauge" | "histogram";

/** Metric labels for filtering/grouping */
export type MetricLabels = {
  docId?: string;
  clientId?: string;
  operation?: string;
  status?: "success" | "failure" | "partial";
  reason?: string;
  source?: string;
  env?: string;
};

/** Counter metric (monotonically increasing) */
export type CounterMetric = {
  type: "counter";
  name: string;
  value: number;
  labels: MetricLabels;
};

/** Gauge metric (point-in-time value) */
export type GaugeMetric = {
  type: "gauge";
  name: string;
  value: number;
  labels: MetricLabels;
};

/** Histogram metric (distribution of values) */
export type HistogramMetric = {
  type: "histogram";
  name: string;
  value: number;
  buckets: number[];
  labels: MetricLabels;
};

export type Metric = CounterMetric | GaugeMetric | HistogramMetric;

// ============================================================================
// Verification Outcomes
// ============================================================================

export type VerificationOutcome =
  | "active"
  | "active_partial"
  | "orphan"
  | "mapping_failed"
  | "conflict_409";

/** Verification event for metrics */
export type VerificationEvent = {
  annotationId: string;
  outcome: VerificationOutcome;
  previousState?: string;
  reason?: string;
  spanCount: number;
  missingBlockCount: number;
  durationMs: number;
};

// ============================================================================
// Fail-Closed Events
// ============================================================================

export type FailClosedReason =
  | "frontier_conflict"
  | "precondition_failed"
  | "schema_validation"
  | "sanitization_rejected"
  | "mapping_ambiguous"
  | "block_not_found"
  | "span_hash_mismatch"
  | "rate_limited"
  | "payload_too_large";

/** Fail-closed event for debugging */
export type FailClosedEvent = {
  timestamp: string;
  context: CorrelationContext;
  reason: FailClosedReason;
  details: {
    expected?: unknown;
    actual?: unknown;
    suggestion?: string;
  };
  recoverable: boolean;
};

// ============================================================================
// Trace Spans
// ============================================================================

export type SpanStatus = "ok" | "error" | "cancelled";

/** Trace span for distributed tracing */
export type TraceSpan = {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
};

// ============================================================================
// Debug Export
// ============================================================================

/** Repro bundle for debugging (sanitized) */
export type ReproBundle = {
  version: string;
  exportedAt: string;
  docId: string;
  /** Sanitized - no PII */
  opLog: Array<{
    seq: number;
    type: string;
    frontierTag: string;
    timestamp: string;
    durationMs: number;
    outcome: string;
  }>;
  /** Canonical snapshot (anonymized content) */
  snapshot: {
    blockCount: number;
    annotationCount: number;
    /** Structure only, no text content */
    structure: unknown;
  };
  /** Recent fail-closed events */
  failClosedEvents: FailClosedEvent[];
  /** Metrics summary */
  metricsSummary: {
    totalOps: number;
    failedOps: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
};
