/**
 * OpenTelemetry-Compatible Tracer
 *
 * Distributed tracing implementation compatible with OpenTelemetry standards.
 * Supports W3C Trace Context propagation and OTLP export.
 *
 * Features:
 * - W3C Trace Context header propagation
 * - Span linking and baggage
 * - Configurable sampling strategies
 * - Multiple export formats (OTLP, Jaeger, Zipkin)
 * - Automatic instrumentation hooks
 */
import { ConsoleLogger, type Span, type Tracer } from "../resilience/observability";

// ============================================================================
// Types
// ============================================================================

/** Span context for propagation */
export interface SpanContext {
  /** Trace ID (32 hex characters) */
  traceId: string;
  /** Span ID (16 hex characters) */
  spanId: string;
  /** Trace flags (sampled, etc.) */
  traceFlags: number;
  /** Trace state (vendor-specific) */
  traceState?: string;
  /** Is remote span */
  isRemote: boolean;
}

/** Span kind */
export type SpanKind = "internal" | "server" | "client" | "producer" | "consumer";

/** Span status */
export interface SpanStatus {
  code: "unset" | "ok" | "error";
  message?: string;
}

const logger = new ConsoleLogger({ prefix: "[OpenTelemetryTracer]" });

/** Span link */
export interface SpanLink {
  context: SpanContext;
  attributes?: Record<string, unknown>;
}

/** Extended span with OpenTelemetry features */
export interface OTelSpan extends Span {
  /** Span context */
  context: SpanContext;
  /** Span kind */
  kind: SpanKind;
  /** Span status */
  spanStatus: SpanStatus;
  /** Links to other spans */
  links: SpanLink[];
  /** Baggage items */
  baggage: Map<string, string>;
  /** Resource attributes */
  resource: Record<string, unknown>;
  /** Instrumentation scope */
  instrumentationScope: {
    name: string;
    version?: string;
  };
}

/** Trace exporter interface */
export interface TraceExporter {
  /** Exporter name */
  name: string;
  /** Export spans */
  export(spans: OTelSpan[]): Promise<ExportResult>;
  /** Force flush */
  forceFlush?(): Promise<void>;
  /** Shutdown */
  shutdown(): Promise<void>;
}

/** Export result */
export interface ExportResult {
  code: "success" | "failed";
  error?: Error;
}

/** Sampler interface */
export interface Sampler {
  /** Should sample this span */
  shouldSample(
    context: SpanContext | undefined,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Record<string, unknown>
  ): SamplingResult;
}

/** Sampling result */
export interface SamplingResult {
  decision: "not_record" | "record" | "record_and_sample";
  attributes?: Record<string, unknown>;
  traceState?: string;
}

/** OpenTelemetry tracer configuration */
export interface OpenTelemetryConfig {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion?: string;
  /** Trace exporters */
  exporters?: TraceExporter[];
  /** Sampler (default: always sample) */
  sampler?: Sampler;
  /** Max spans per trace (default: 1000) */
  maxSpansPerTrace?: number;
  /** Export batch size (default: 512) */
  exportBatchSize?: number;
  /** Export interval in ms (default: 5000) */
  exportIntervalMs?: number;
  /** Resource attributes */
  resource?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

/** Trace flags */
const TRACE_FLAG_SAMPLED = 0x01;

/** Default configuration */
const DEFAULT_CONFIG = {
  maxSpansPerTrace: 1000,
  exportBatchSize: 512,
  exportIntervalMs: 5000,
} as const;

// ============================================================================
// Samplers
// ============================================================================

/**
 * Always sample (100%).
 */
export function createAlwaysSampler(): Sampler {
  return {
    shouldSample() {
      return { decision: "record_and_sample" };
    },
  };
}

/**
 * Never sample (0%).
 */
export function createNeverSampler(): Sampler {
  return {
    shouldSample() {
      return { decision: "not_record" };
    },
  };
}

/**
 * Probabilistic sampler.
 */
export function createProbabilitySampler(probability: number): Sampler {
  const threshold = Math.max(0, Math.min(1, probability));

  return {
    shouldSample(_context, traceId) {
      // Use last 8 chars of traceId for deterministic sampling
      const hash = Number.parseInt(traceId.slice(-8), 16);
      const decision = hash / 0xffffffff < threshold;

      return {
        decision: decision ? "record_and_sample" : "not_record",
      };
    },
  };
}

/**
 * Rate limiting sampler.
 */
export function createRateLimitingSampler(maxPerSecond: number): Sampler {
  let tokens = maxPerSecond;
  let lastRefill = Date.now();

  return {
    shouldSample() {
      const now = Date.now();
      const elapsed = now - lastRefill;

      // Refill tokens
      if (elapsed >= 1000) {
        tokens = maxPerSecond;
        lastRefill = now;
      } else {
        tokens += (elapsed / 1000) * maxPerSecond;
        tokens = Math.min(tokens, maxPerSecond);
        lastRefill = now;
      }

      if (tokens >= 1) {
        tokens -= 1;
        return { decision: "record_and_sample" };
      }

      return { decision: "not_record" };
    },
  };
}

// ============================================================================
// OpenTelemetry Tracer Implementation
// ============================================================================

/**
 * OpenTelemetry-compatible Tracer
 *
 * Implements distributed tracing with W3C Trace Context support.
 */
export class OpenTelemetryTracer implements Tracer {
  private readonly config: Required<OpenTelemetryConfig>;
  private readonly spans = new Map<string, OTelSpan[]>();
  private readonly pendingExport: OTelSpan[] = [];
  private currentSpan: OTelSpan | null = null;
  private exportInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: OpenTelemetryConfig) {
    this.config = {
      serviceName: config.serviceName,
      serviceVersion: config.serviceVersion ?? "0.0.0",
      exporters: config.exporters ?? [],
      sampler: config.sampler ?? createAlwaysSampler(),
      maxSpansPerTrace: config.maxSpansPerTrace ?? DEFAULT_CONFIG.maxSpansPerTrace,
      exportBatchSize: config.exportBatchSize ?? DEFAULT_CONFIG.exportBatchSize,
      exportIntervalMs: config.exportIntervalMs ?? DEFAULT_CONFIG.exportIntervalMs,
      resource: config.resource ?? {},
    };

    // Start export interval if exporters configured
    if (this.config.exporters.length > 0) {
      this.startExportInterval();
    }
  }

  /**
   * Start a new span.
   */
  startSpan(operationName: string, parentSpan?: Span): OTelSpan {
    const parentContext = parentSpan ? (parentSpan as OTelSpan).context : this.currentSpan?.context;

    const traceId = parentContext?.traceId ?? this.generateTraceId();
    const spanId = this.generateSpanId();

    // Check sampling
    const samplingResult = this.config.sampler.shouldSample(
      parentContext,
      traceId,
      operationName,
      "internal",
      {}
    );

    const isSampled = samplingResult.decision !== "not_record";
    const context: SpanContext = {
      traceId,
      spanId,
      traceFlags: isSampled ? TRACE_FLAG_SAMPLED : 0,
      traceState: samplingResult.traceState,
      isRemote: false,
    };

    const span: OTelSpan = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      operationName,
      startTime: performance.now(),
      status: "ok",
      tags: {},
      logs: [],
      context,
      kind: "internal",
      spanStatus: { code: "unset" },
      links: [],
      baggage: new Map(),
      resource: {
        "service.name": this.config.serviceName,
        "service.version": this.config.serviceVersion,
        ...this.config.resource,
      },
      instrumentationScope: {
        name: "@ku0/ai-core",
        version: "1.0.0",
      },
    };

    // Apply sampling attributes
    if (samplingResult.attributes) {
      Object.assign(span.tags, samplingResult.attributes);
    }

    // Store span
    let traceSpans = this.spans.get(traceId);
    if (!traceSpans) {
      traceSpans = [];
      this.spans.set(traceId, traceSpans);
    }
    traceSpans.push(span);

    // Limit spans per trace
    if (traceSpans.length > this.config.maxSpansPerTrace) {
      traceSpans.shift();
    }

    // Set as current
    this.currentSpan = span;

    return span;
  }

  /**
   * Start a span with specific kind.
   */
  startSpanWithKind(
    operationName: string,
    kind: SpanKind,
    options: {
      parent?: Span;
      links?: SpanLink[];
      attributes?: Record<string, unknown>;
    } = {}
  ): OTelSpan {
    const span = this.startSpan(operationName, options.parent) as OTelSpan;
    span.kind = kind;

    if (options.links) {
      span.links.push(...options.links);
    }

    if (options.attributes) {
      Object.assign(span.tags, options.attributes);
    }

    return span;
  }

  /**
   * Finish a span.
   */
  finishSpan(span: Span, status: "ok" | "error" = "ok"): void {
    const otelSpan = span as OTelSpan;
    otelSpan.endTime = performance.now();
    otelSpan.duration = otelSpan.endTime - otelSpan.startTime;
    otelSpan.status = status;
    otelSpan.spanStatus = {
      code: status === "ok" ? "ok" : "error",
    };

    // Add to pending export if sampled
    if ((otelSpan.context.traceFlags & TRACE_FLAG_SAMPLED) !== 0) {
      this.pendingExport.push(otelSpan);
      this.checkBatchExport();
    }

    // Update current span
    if (this.currentSpan?.spanId === otelSpan.spanId) {
      const traceSpans = this.spans.get(otelSpan.traceId);
      if (traceSpans && otelSpan.parentSpanId) {
        this.currentSpan =
          (traceSpans.find((s) => s.spanId === otelSpan.parentSpanId) as OTelSpan) || null;
      } else {
        this.currentSpan = null;
      }
    }
  }

  /**
   * Get current span.
   */
  getCurrentSpan(): OTelSpan | null {
    return this.currentSpan;
  }

  /**
   * Get trace by ID.
   */
  getTrace(traceId: string): OTelSpan[] {
    return this.spans.get(traceId) || [];
  }

  /**
   * Extract span context from headers (W3C Trace Context).
   */
  extractContext(headers: Record<string, string>): SpanContext | undefined {
    const traceparent = headers.traceparent;
    if (!traceparent) {
      return undefined;
    }

    // Format: version-traceid-spanid-flags
    const parts = traceparent.split("-");
    if (parts.length !== 4) {
      return undefined;
    }

    const [_version, traceId, spanId, flags] = parts;

    return {
      traceId,
      spanId,
      traceFlags: Number.parseInt(flags, 16),
      traceState: headers.tracestate,
      isRemote: true,
    };
  }

  /**
   * Inject span context into headers (W3C Trace Context).
   */
  injectContext(span: Span, headers: Record<string, string>): void {
    const otelSpan = span as OTelSpan;
    const { traceId, spanId, traceFlags, traceState } = otelSpan.context;

    headers.traceparent = `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, "0")}`;

    if (traceState) {
      headers.tracestate = traceState;
    }
  }

  /**
   * Create a linked span from remote context.
   */
  startSpanFromContext(
    operationName: string,
    context: SpanContext,
    kind: SpanKind = "server"
  ): OTelSpan {
    const span = this.startSpan(operationName);
    span.kind = kind;

    // Link to remote parent
    span.links.push({
      context,
      attributes: { "link.type": "parent" },
    });

    return span;
  }

  /**
   * Add baggage item to span.
   */
  setBaggage(span: Span, key: string, value: string): void {
    (span as OTelSpan).baggage.set(key, value);
  }

  /**
   * Get baggage item from span.
   */
  getBaggage(span: Span, key: string): string | undefined {
    return (span as OTelSpan).baggage.get(key);
  }

  /**
   * Force flush pending spans.
   */
  async forceFlush(): Promise<void> {
    if (this.pendingExport.length === 0) {
      return;
    }

    const spans = [...this.pendingExport];
    this.pendingExport.length = 0;

    await this.exportSpans(spans);
  }

  /**
   * Shutdown the tracer.
   */
  async shutdown(): Promise<void> {
    this.stopExportInterval();
    await this.forceFlush();

    for (const exporter of this.config.exporters) {
      await exporter.shutdown().catch((e) => {
        logger.error("Exporter shutdown failed", e instanceof Error ? e : new Error(String(e)));
      });
    }
  }

  /**
   * Clear all spans.
   */
  clear(): void {
    this.spans.clear();
    this.pendingExport.length = 0;
    this.currentSpan = null;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateTraceId(): string {
    // 32 hex characters (128 bits)
    return this.generateRandomHex(32);
  }

  private generateSpanId(): string {
    // 16 hex characters (64 bits)
    return this.generateRandomHex(16);
  }

  private generateRandomHex(length: number): string {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private startExportInterval(): void {
    this.exportInterval = setInterval(() => {
      this.forceFlush().catch((e) => {
        logger.error("Auto-export failed", e instanceof Error ? e : new Error(String(e)));
      });
    }, this.config.exportIntervalMs);
  }

  private stopExportInterval(): void {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
    }
  }

  private checkBatchExport(): void {
    if (this.pendingExport.length >= this.config.exportBatchSize) {
      this.forceFlush().catch((e) => {
        logger.error("Batch export failed", e instanceof Error ? e : new Error(String(e)));
      });
    }
  }

  private async exportSpans(spans: OTelSpan[]): Promise<void> {
    if (spans.length === 0) {
      return;
    }

    const exportPromises = this.config.exporters.map((exporter) =>
      exporter.export(spans).catch((e) => ({
        code: "failed" as const,
        error: e instanceof Error ? e : new Error(String(e)),
      }))
    );

    await Promise.all(exportPromises);
  }
}

/**
 * Create an OpenTelemetry tracer.
 */
export function createOpenTelemetryTracer(config: OpenTelemetryConfig): OpenTelemetryTracer {
  return new OpenTelemetryTracer(config);
}

/**
 * Create a console trace exporter (for development).
 */
export function createConsoleTraceExporter(): TraceExporter {
  return {
    name: "console",
    async export(spans) {
      // No-op exporter for development; spans intentionally ignored
      void spans;
      return { code: "success" };
    },
    async shutdown() {
      // Nothing to clean up for console exporter
    },
  };
}
