/**
 * Trace Context - Distributed Tracing Propagation
 *
 * Implements W3C Trace Context for end-to-end request tracing across:
 * - Frontend → API routes → LLM providers
 * - Collab server → Agent runtime → Tools
 *
 * @see https://www.w3.org/TR/trace-context/
 */

// ============================================================================
// Types
// ============================================================================

/** Trace context data for propagation */
export interface TraceContextData {
  /** Unique trace identifier (16 bytes hex) */
  traceId: string;
  /** Current span identifier (8 bytes hex) */
  spanId: string;
  /** Parent span identifier (optional) */
  parentSpanId?: string;
  /** Trace flags (sampled, etc.) */
  flags: number;
  /** Trace state for vendor-specific data */
  traceState?: string;
}

/** Propagator interface for different transport protocols */
export interface TracePropagator {
  inject(context: TraceContextData, carrier: Record<string, string>): void;
  extract(carrier: Record<string, string>): TraceContextData | null;
}

// ============================================================================
// Constants
// ============================================================================

const TRACE_PARENT_HEADER = "traceparent";
const TRACE_STATE_HEADER = "tracestate";
const TRACE_PARENT_VERSION = "00";

// Custom headers for simpler propagation
const X_TRACE_ID = "x-trace-id";
const X_SPAN_ID = "x-span-id";
const X_PARENT_SPAN_ID = "x-parent-span-id";
const X_REQUEST_ID = "x-request-id";

// Sampling flags
const FLAG_SAMPLED = 0x01;

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a random trace ID (16 bytes / 32 hex chars).
 */
export function generateTraceId(): string {
  return generateRandomHex(32);
}

/**
 * Generate a random span ID (8 bytes / 16 hex chars).
 */
export function generateSpanId(): string {
  return generateRandomHex(16);
}

/**
 * Generate a request ID (shorter, human-readable format).
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = generateRandomHex(8);
  return `req_${timestamp}_${random}`;
}

function generateRandomHex(length: number): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(length / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback for environments without crypto
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 16).toString(16);
  }
  return result;
}

// ============================================================================
// Trace Context Class
// ============================================================================

/**
 * Immutable trace context for distributed tracing.
 */
export class TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly flags: number;
  readonly traceState?: string;

  private constructor(data: TraceContextData) {
    this.traceId = data.traceId;
    this.spanId = data.spanId;
    this.parentSpanId = data.parentSpanId;
    this.flags = data.flags;
    this.traceState = data.traceState;
  }

  /**
   * Create a new root trace context.
   */
  static createRoot(options?: { sampled?: boolean; traceState?: string }): TraceContext {
    return new TraceContext({
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      flags: options?.sampled !== false ? FLAG_SAMPLED : 0,
      traceState: options?.traceState,
    });
  }

  /**
   * Create a child span from this context.
   */
  createChild(): TraceContext {
    return new TraceContext({
      traceId: this.traceId,
      spanId: generateSpanId(),
      parentSpanId: this.spanId,
      flags: this.flags,
      traceState: this.traceState,
    });
  }

  /**
   * Check if this trace is sampled.
   */
  isSampled(): boolean {
    return (this.flags & FLAG_SAMPLED) === FLAG_SAMPLED;
  }

  /**
   * Get a request ID for this context (for logging).
   */
  getRequestId(): string {
    return `${this.traceId.slice(0, 8)}-${this.spanId.slice(0, 4)}`;
  }

  /**
   * Convert to plain object for serialization.
   */
  toData(): TraceContextData {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      flags: this.flags,
      traceState: this.traceState,
    };
  }

  /**
   * Format as W3C traceparent header.
   */
  toTraceParent(): string {
    const flagsHex = this.flags.toString(16).padStart(2, "0");
    return `${TRACE_PARENT_VERSION}-${this.traceId}-${this.spanId}-${flagsHex}`;
  }

  /**
   * Parse from W3C traceparent header.
   */
  static fromTraceParent(traceParent: string, traceState?: string): TraceContext | null {
    const parts = traceParent.split("-");
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, spanId, flagsHex] = parts;

    // Validate version
    if (version !== TRACE_PARENT_VERSION) {
      return null;
    }

    // Validate trace ID (32 hex chars, not all zeros)
    if (!/^[0-9a-f]{32}$/i.test(traceId) || /^0+$/.test(traceId)) {
      return null;
    }

    // Validate span ID (16 hex chars, not all zeros)
    if (!/^[0-9a-f]{16}$/i.test(spanId) || /^0+$/.test(spanId)) {
      return null;
    }

    // Parse flags
    const flags = Number.parseInt(flagsHex, 16);
    if (Number.isNaN(flags)) {
      return null;
    }

    return new TraceContext({
      traceId: traceId.toLowerCase(),
      spanId: spanId.toLowerCase(),
      flags,
      traceState,
    });
  }

  /**
   * Create from data object.
   */
  static fromData(data: TraceContextData): TraceContext {
    return new TraceContext(data);
  }
}

// ============================================================================
// Header Propagation
// ============================================================================

/**
 * Extract trace context from HTTP headers.
 * Supports both W3C Trace Context and custom x-* headers.
 */
export function extractTraceFromHeaders(
  headers: Headers | Record<string, string | undefined>
): TraceContext | null {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) ?? undefined;
    }
    return headers[name] ?? headers[name.toLowerCase()];
  };

  // Try W3C Trace Context first
  const traceParent = get(TRACE_PARENT_HEADER);
  if (traceParent) {
    const traceState = get(TRACE_STATE_HEADER);
    const context = TraceContext.fromTraceParent(traceParent, traceState);
    if (context) {
      return context;
    }
  }

  // Fall back to custom headers
  const traceId = get(X_TRACE_ID);
  const spanId = get(X_SPAN_ID);
  const parentSpanId = get(X_PARENT_SPAN_ID);

  if (traceId && spanId) {
    return TraceContext.fromData({
      traceId,
      spanId,
      parentSpanId,
      flags: FLAG_SAMPLED,
    });
  }

  // Try request ID as last resort
  const requestId = get(X_REQUEST_ID);
  if (requestId) {
    // Use request ID as seed for trace ID
    return TraceContext.fromData({
      traceId: requestId.padEnd(32, "0").slice(0, 32),
      spanId: generateSpanId(),
      flags: FLAG_SAMPLED,
    });
  }

  return null;
}

/**
 * Inject trace context into HTTP headers.
 */
export function injectTraceToHeaders(
  context: TraceContext,
  headers: Headers | Record<string, string>
): void {
  const set = (name: string, value: string) => {
    if (headers instanceof Headers) {
      headers.set(name, value);
    } else {
      headers[name] = value;
    }
  };

  // W3C Trace Context
  set(TRACE_PARENT_HEADER, context.toTraceParent());
  if (context.traceState) {
    set(TRACE_STATE_HEADER, context.traceState);
  }

  // Custom headers for simpler debugging
  set(X_TRACE_ID, context.traceId);
  set(X_SPAN_ID, context.spanId);
  if (context.parentSpanId) {
    set(X_PARENT_SPAN_ID, context.parentSpanId);
  }
  set(X_REQUEST_ID, context.getRequestId());
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new trace context, optionally continuing from headers.
 */
export function createTraceContext(
  headersOrParent?: Headers | Record<string, string | undefined> | TraceContext
): TraceContext {
  // If given a TraceContext, create a child
  if (headersOrParent instanceof TraceContext) {
    return headersOrParent.createChild();
  }

  // If given headers, try to extract and continue
  if (headersOrParent) {
    const extracted = extractTraceFromHeaders(headersOrParent);
    if (extracted) {
      return extracted.createChild();
    }
  }

  // Create a new root context
  return TraceContext.createRoot();
}
