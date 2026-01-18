/**
 * LFCC v0.9 RC - Telemetry Module
 * @see docs/product/Audit/enhance/stage3/agent_2_observability.md
 *
 * Provides production metrics hooks for observability.
 * Enables tracking of durations, counts, and structured events.
 */

// ============================================================================
// Telemetry Adapter Interface
// ============================================================================

/**
 * Telemetry adapter interface for production metrics.
 * Implement this interface to integrate with your metrics backend
 * (e.g., Prometheus, DataDog, OpenTelemetry).
 */
export interface TelemetryAdapter {
  /**
   * Track duration of an operation in milliseconds.
   * @param metric - Metric name (e.g., "lfcc.negotiation.duration")
   * @param durationMs - Duration in milliseconds
   * @param tags - Optional key-value tags
   */
  trackDuration(metric: string, durationMs: number, tags?: MetricTags): void;

  /**
   * Increment a counter metric.
   * @param metric - Metric name (e.g., "lfcc.anchor.decode_failures")
   * @param count - Count to increment (default: 1)
   * @param tags - Optional key-value tags
   */
  count(metric: string, count?: number, tags?: MetricTags): void;

  /**
   * Record a gauge value.
   * @param metric - Metric name (e.g., "lfcc.document.block_count")
   * @param value - Current value
   * @param tags - Optional key-value tags
   */
  gauge(metric: string, value: number, tags?: MetricTags): void;

  /**
   * Record a histogram value.
   * @param metric - Metric name (e.g., "lfcc.payload.size_bytes")
   * @param value - Value to record
   * @param tags - Optional key-value tags
   */
  histogram(metric: string, value: number, tags?: MetricTags): void;

  /**
   * Emit a structured event.
   * @param event - Event name
   * @param data - Event data
   */
  event(event: string, data: Record<string, unknown>): void;
}

export type MetricTags = Record<string, string | number | boolean>;

// ============================================================================
// Metric Names (Constants)
// ============================================================================

export const LFCCMetrics = {
  // Negotiation
  NEGOTIATION_DURATION: "lfcc.negotiation.duration_ms",
  NEGOTIATION_SUCCESS: "lfcc.negotiation.success",
  NEGOTIATION_FAILURE: "lfcc.negotiation.failure",

  // Anchor
  ANCHOR_ENCODE_DURATION: "lfcc.anchor.encode_duration_ms",
  ANCHOR_DECODE_DURATION: "lfcc.anchor.decode_duration_ms",
  ANCHOR_DECODE_SUCCESS: "lfcc.anchor.decode_success",
  ANCHOR_DECODE_FAILURE: "lfcc.anchor.decode_failure",
  ANCHOR_CHECKSUM_MISMATCH: "lfcc.anchor.checksum_mismatch",

  // AI
  AI_VALIDATE_DURATION: "lfcc.ai.validate_duration_ms",
  AI_VALIDATE_SUCCESS: "lfcc.ai.validate_success",
  AI_VALIDATE_REJECTION: "lfcc.ai.validate_rejection",
  AI_PAYLOAD_SIZE: "lfcc.ai.payload_size_bytes",
  AI_PAYLOAD_DEPTH: "lfcc.ai.payload_depth",

  // Canonicalizer
  CANONICALIZE_DURATION: "lfcc.canonicalizer.duration_ms",
  CANONICALIZE_DIAGNOSTICS: "lfcc.canonicalizer.diagnostics",

  // BlockMapping
  BLOCKMAPPING_DURATION: "lfcc.blockmapping.duration_ms",
  BLOCKMAPPING_TRANSFORMS: "lfcc.blockmapping.transform_count",

  // Integrity
  CHECKPOINT_DURATION: "lfcc.integrity.checkpoint_duration_ms",
  CHECKPOINT_ANNOTATIONS: "lfcc.integrity.annotations_verified",

  // Shadow
  SHADOW_DIVERGENCE: "lfcc.shadow.divergence",
  SHADOW_CONFLICT: "lfcc.shadow.structural_conflict",
} as const;

// ============================================================================
// No-Op Adapter (Default)
// ============================================================================

/**
 * No-op telemetry adapter that discards all metrics.
 * Used as default when no adapter is configured.
 */
export const noopTelemetryAdapter: TelemetryAdapter = {
  trackDuration: () => {
    /* no-op */
  },
  count: () => {
    /* no-op */
  },
  gauge: () => {
    /* no-op */
  },
  histogram: () => {
    /* no-op */
  },
  event: () => {
    /* no-op */
  },
};

// ============================================================================
// Console Adapter (Development)
// ============================================================================

/**
 * Console telemetry adapter for development.
 * Logs all metrics to stdout.
 */
export function createConsoleTelemetryAdapter(options?: {
  prefix?: string;
  minDurationMs?: number;
}): TelemetryAdapter {
  const prefix = options?.prefix ?? "[LFCC Telemetry]";
  const minDurationMs = options?.minDurationMs ?? 0;

  function formatPayload(value: unknown): string {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    try {
      return ` ${JSON.stringify(value)}`;
    } catch {
      return ` ${String(value)}`;
    }
  }

  function writeLine(message: string): void {
    if (typeof process === "undefined" || !process.stdout) {
      return;
    }
    process.stdout.write(`${message}\n`);
  }

  return {
    trackDuration(metric, durationMs, tags) {
      if (durationMs >= minDurationMs) {
        writeLine(`${prefix} DURATION ${metric}=${durationMs}ms${formatPayload(tags)}`);
      }
    },
    count(metric, count, tags) {
      const actualCount = count ?? 1;
      writeLine(`${prefix} COUNT ${metric}=${actualCount}${formatPayload(tags)}`);
    },
    gauge(metric, value, tags) {
      writeLine(`${prefix} GAUGE ${metric}=${value}${formatPayload(tags)}`);
    },
    histogram(metric, value, tags) {
      writeLine(`${prefix} HISTOGRAM ${metric}=${value}${formatPayload(tags)}`);
    },
    event(eventName, data) {
      writeLine(`${prefix} EVENT ${eventName}${formatPayload(data)}`);
    },
  };
}

// ============================================================================
// Global Telemetry Instance
// ============================================================================

let globalTelemetry: TelemetryAdapter = noopTelemetryAdapter;

/**
 * Set the global telemetry adapter.
 * Call this once at application startup.
 */
export function setTelemetryAdapter(adapter: TelemetryAdapter): void {
  globalTelemetry = adapter;
}

/**
 * Get the current global telemetry adapter.
 */
export function getTelemetryAdapter(): TelemetryAdapter {
  return globalTelemetry;
}

// ============================================================================
// Instrumentation Helpers
// ============================================================================

/**
 * Measure the duration of an async operation.
 */
export async function measureAsync<T>(
  metric: string,
  operation: () => Promise<T>,
  tags?: MetricTags
): Promise<T> {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    const duration = performance.now() - start;
    globalTelemetry.trackDuration(metric, duration, tags);
  }
}

/**
 * Measure the duration of a sync operation.
 */
export function measureSync<T>(metric: string, operation: () => T, tags?: MetricTags): T {
  const start = performance.now();
  try {
    return operation();
  } finally {
    const duration = performance.now() - start;
    globalTelemetry.trackDuration(metric, duration, tags);
  }
}

/**
 * Create a scoped telemetry context with prefixed metrics.
 */
export function createScopedTelemetry(scope: string): TelemetryAdapter {
  return {
    trackDuration(metric, durationMs, tags) {
      globalTelemetry.trackDuration(`${scope}.${metric}`, durationMs, tags);
    },
    count(metric, count, tags) {
      const actualCount = count ?? 1;
      globalTelemetry.count(`${scope}.${metric}`, actualCount, tags);
    },
    gauge(metric, value, tags) {
      globalTelemetry.gauge(`${scope}.${metric}`, value, tags);
    },
    histogram(metric, value, tags) {
      globalTelemetry.histogram(`${scope}.${metric}`, value, tags);
    },
    event(eventName, data) {
      globalTelemetry.event(`${scope}.${eventName}`, data);
    },
  };
}

// ============================================================================
// Instrumented Wrappers
// ============================================================================

/**
 * Instrument negotiation with telemetry.
 */
export function instrumentNegotiation<T>(
  negotiate: () => T,
  manifestCount: number
): { result: T; success: boolean } {
  const start = performance.now();
  let success = false;

  try {
    const result = negotiate();
    success = true;
    return { result, success: true };
  } catch (error) {
    globalTelemetry.count(LFCCMetrics.NEGOTIATION_FAILURE, 1, {
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  } finally {
    const duration = performance.now() - start;
    globalTelemetry.trackDuration(LFCCMetrics.NEGOTIATION_DURATION, duration, {
      manifests: manifestCount,
    });
    if (success) {
      globalTelemetry.count(LFCCMetrics.NEGOTIATION_SUCCESS);
    }
  }
}

/**
 * Instrument anchor decode with telemetry.
 */
export function instrumentAnchorDecode<T>(decode: () => T | null): {
  result: T | null;
  success: boolean;
} {
  const start = performance.now();

  try {
    const result = decode();
    const success = result !== null;

    if (success) {
      globalTelemetry.count(LFCCMetrics.ANCHOR_DECODE_SUCCESS);
    } else {
      globalTelemetry.count(LFCCMetrics.ANCHOR_DECODE_FAILURE, 1, { reason: "null_result" });
    }

    return { result, success };
  } catch (error) {
    globalTelemetry.count(LFCCMetrics.ANCHOR_DECODE_FAILURE, 1, {
      reason: error instanceof Error ? error.message : "exception",
    });
    return { result: null, success: false };
  } finally {
    const duration = performance.now() - start;
    globalTelemetry.trackDuration(LFCCMetrics.ANCHOR_DECODE_DURATION, duration);
  }
}

/**
 * Instrument AI payload validation with telemetry.
 */
export function instrumentAIValidation<T>(
  validate: () => T,
  payloadSize: number,
  payloadDepth: number
): { result: T; rejected: boolean } {
  const start = performance.now();
  let rejected = false;

  globalTelemetry.histogram(LFCCMetrics.AI_PAYLOAD_SIZE, payloadSize);
  globalTelemetry.histogram(LFCCMetrics.AI_PAYLOAD_DEPTH, payloadDepth);

  try {
    const result = validate();
    globalTelemetry.count(LFCCMetrics.AI_VALIDATE_SUCCESS);
    return { result, rejected: false };
  } catch (error) {
    rejected = true;
    globalTelemetry.count(LFCCMetrics.AI_VALIDATE_REJECTION, 1, {
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  } finally {
    const duration = performance.now() - start;
    globalTelemetry.trackDuration(LFCCMetrics.AI_VALIDATE_DURATION, duration, {
      size: payloadSize,
      depth: payloadDepth,
      rejected,
    });
  }
}
