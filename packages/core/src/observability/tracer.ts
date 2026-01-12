/**
 * LFCC v0.9 RC - Distributed Tracer
 *
 * Provides span-based tracing for end-to-end operation visibility.
 * Compatible with OpenTelemetry trace format.
 */

import type { CorrelationContext, SpanStatus, TraceSpan } from "./types";

// ============================================================================
// Span Builder
// ============================================================================

export class SpanBuilder {
  private span: TraceSpan;
  private tracer: LFCCTracer;

  constructor(tracer: LFCCTracer, name: string, parentSpanId?: string) {
    const traceId = parentSpanId ? tracer.getTraceId(parentSpanId) : generateId();

    this.tracer = tracer;
    this.span = {
      spanId: generateId(),
      parentSpanId,
      traceId,
      name,
      startTime: Date.now(),
      status: "ok",
      attributes: {},
      events: [],
    };
  }

  /** Set span attribute */
  setAttribute(key: string, value: string | number | boolean): SpanBuilder {
    this.span.attributes[key] = value;
    return this;
  }

  /** Set multiple attributes */
  setAttributes(attrs: Record<string, string | number | boolean>): SpanBuilder {
    Object.assign(this.span.attributes, attrs);
    return this;
  }

  /** Add event to span */
  addEvent(name: string, attributes?: Record<string, unknown>): SpanBuilder {
    this.span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
    return this;
  }

  /** Set span status */
  setStatus(status: SpanStatus): SpanBuilder {
    this.span.status = status;
    return this;
  }

  /** End span and record it */
  end(): TraceSpan {
    this.span.endTime = Date.now();
    this.tracer.recordSpan(this.span);
    return this.span;
  }

  /** Get span ID for child spans */
  getSpanId(): string {
    return this.span.spanId;
  }
}

// ============================================================================
// Tracer Implementation
// ============================================================================

export type TracerConfig = {
  /** Maximum spans to keep in memory */
  maxSpans: number;
  /** Export handler */
  exporter?: (spans: TraceSpan[]) => void;
  /** Export batch size */
  exportBatchSize: number;
};

export class LFCCTracer {
  private config: TracerConfig;
  private spans: TraceSpan[] = [];
  private spanToTrace = new Map<string, string>();
  private context: Partial<CorrelationContext> = {};

  constructor(config: Partial<TracerConfig> = {}) {
    this.config = {
      maxSpans: config.maxSpans ?? 1000,
      exporter: config.exporter,
      exportBatchSize: config.exportBatchSize ?? 100,
    };
  }

  /** Set correlation context */
  setContext(context: Partial<CorrelationContext>): void {
    this.context = { ...this.context, ...context };
  }

  /** Start a new span */
  startSpan(name: string, parentSpanId?: string): SpanBuilder {
    const builder = new SpanBuilder(this, name, parentSpanId);

    // Add context attributes
    if (this.context.docId) {
      builder.setAttribute("doc_id", this.context.docId);
    }
    if (this.context.clientId) {
      builder.setAttribute("client_id", this.context.clientId);
    }
    if (this.context.sessionId) {
      builder.setAttribute("session_id", this.context.sessionId);
    }
    if (this.context.opId) {
      builder.setAttribute("op_id", this.context.opId);
    }

    return builder;
  }

  /** Record completed span */
  recordSpan(span: TraceSpan): void {
    this.spans.push(span);
    this.spanToTrace.set(span.spanId, span.traceId);

    // Trim if over limit
    if (this.spans.length > this.config.maxSpans) {
      const removed = this.spans.splice(0, this.spans.length - this.config.maxSpans);
      for (const s of removed) {
        this.spanToTrace.delete(s.spanId);
      }
    }

    // Export if batch size reached
    if (this.config.exporter && this.spans.length >= this.config.exportBatchSize) {
      this.flush();
    }
  }

  /** Get trace ID for span */
  getTraceId(spanId: string): string {
    return this.spanToTrace.get(spanId) ?? generateId();
  }

  /** Flush spans to exporter */
  flush(): void {
    if (this.config.exporter && this.spans.length > 0) {
      this.config.exporter([...this.spans]);
      this.spans = [];
    }
  }

  /** Get all recorded spans */
  getSpans(): TraceSpan[] {
    return [...this.spans];
  }

  /** Get spans for a specific trace */
  getTrace(traceId: string): TraceSpan[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  /** Clear all spans */
  clear(): void {
    this.spans = [];
    this.spanToTrace.clear();
  }

  // --------------------------------------------------------------------------
  // LFCC-Specific Tracing
  // --------------------------------------------------------------------------

  /** Trace sync operation */
  traceSyncOp(operation: string, _fn: () => void | Promise<void>): SpanBuilder {
    const span = this.startSpan(`sync.${operation}`);
    span.setAttribute("operation", operation);
    return span;
  }

  /** Trace verification pass */
  traceVerification(annotationId: string): SpanBuilder {
    const span = this.startSpan("verification.check");
    span.setAttribute("annotation_id", annotationId);
    return span;
  }

  /** Trace gateway request */
  traceGatewayRequest(requestId: string): SpanBuilder {
    const span = this.startSpan("gateway.request");
    span.setAttribute("request_id", requestId);
    return span;
  }

  /** Trace mapping operation */
  traceMapping(blockId: string): SpanBuilder {
    const span = this.startSpan("mapping.resolve");
    span.setAttribute("block_id", blockId);
    return span;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Default Tracer
// ============================================================================

let defaultTracer: LFCCTracer | null = null;

export function getTracer(): LFCCTracer {
  if (!defaultTracer) {
    defaultTracer = new LFCCTracer();
  }
  return defaultTracer;
}

export function setDefaultTracer(tracer: LFCCTracer): void {
  defaultTracer = tracer;
}

// ============================================================================
// Convenience: Trace Async Function
// ============================================================================

export async function traceAsync<T>(
  name: string,
  fn: (span: SpanBuilder) => Promise<T>,
  parentSpanId?: string
): Promise<T> {
  const span = getTracer().startSpan(name, parentSpanId);
  try {
    const result = await fn(span);
    span.setStatus("ok");
    return result;
  } catch (error) {
    span.setStatus("error");
    span.addEvent("error", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}
