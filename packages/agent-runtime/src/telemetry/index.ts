/**
 * Telemetry Module
 *
 * Provides observability infrastructure for the agent runtime.
 * Includes metrics collection, tracing, and structured logging.
 */

import type { RuntimeEventBus } from "../events/eventBus";

// ============================================================================
// Metric Types
// ============================================================================

export type MetricType = "counter" | "gauge" | "histogram";

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  labels?: string[];
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

// ============================================================================
// Pre-defined Metrics
// ============================================================================

export const AGENT_METRICS = {
  // Tool metrics
  toolCallsTotal: {
    name: "agent_tool_calls_total",
    type: "counter" as const,
    description: "Total number of tool calls",
    labels: ["tool_name", "status"],
  },
  toolCallDuration: {
    name: "agent_tool_call_duration_ms",
    type: "histogram" as const,
    description: "Tool call duration in milliseconds",
    labels: ["tool_name"],
  },

  // Orchestrator metrics
  turnsTotal: {
    name: "agent_turns_total",
    type: "counter" as const,
    description: "Total number of agent turns",
    labels: ["status"],
  },
  turnDuration: {
    name: "agent_turn_duration_ms",
    type: "histogram" as const,
    description: "Turn duration in milliseconds",
    labels: [],
  },
  activeAgents: {
    name: "agent_active_count",
    type: "gauge" as const,
    description: "Number of currently active agents",
    labels: [],
  },

  // LLM metrics
  llmRequestsTotal: {
    name: "agent_llm_requests_total",
    type: "counter" as const,
    description: "Total LLM requests",
    labels: ["provider", "model", "status"],
  },
  llmTokensTotal: {
    name: "agent_llm_tokens_total",
    type: "counter" as const,
    description: "Total LLM tokens used",
    labels: ["provider", "direction"],
  },
  llmLatency: {
    name: "agent_llm_latency_ms",
    type: "histogram" as const,
    description: "LLM request latency in milliseconds",
    labels: ["provider", "model"],
  },

  // Security metrics
  permissionDenied: {
    name: "agent_permission_denied_total",
    type: "counter" as const,
    description: "Permission denied events",
    labels: ["tool_name", "permission"],
  },
  confirmationRequests: {
    name: "agent_confirmation_requests_total",
    type: "counter" as const,
    description: "Confirmation requests",
    labels: ["tool_name", "result"],
  },

  // Cowork policy metrics
  coworkPolicyEvaluations: {
    name: "cowork_policy_evaluations_total",
    type: "counter" as const,
    description: "Total Cowork policy evaluations",
    labels: ["decision"],
  },
  coworkPolicyDenials: {
    name: "cowork_policy_denials_total",
    type: "counter" as const,
    description: "Total Cowork policy denials",
    labels: ["reason"],
  },
  coworkPolicyLatency: {
    name: "cowork_policy_latency_ms",
    type: "histogram" as const,
    description: "Cowork policy evaluation latency in milliseconds",
    labels: ["decision"],
  },

  // Performance optimization metrics
  messageCompressionRatio: {
    name: "agent_message_compression_ratio",
    type: "histogram" as const,
    description: "Message compression ratio (0-1)",
    labels: [],
  },
  messageCompressionTime: {
    name: "agent_message_compression_time_ms",
    type: "histogram" as const,
    description: "Message compression time in milliseconds",
    labels: [],
  },
  requestCacheHits: {
    name: "agent_request_cache_hits_total",
    type: "counter" as const,
    description: "Request cache hits",
    labels: [],
  },
  requestCacheMisses: {
    name: "agent_request_cache_misses_total",
    type: "counter" as const,
    description: "Request cache misses",
    labels: [],
  },
  requestCacheTime: {
    name: "agent_request_cache_time_ms",
    type: "histogram" as const,
    description: "Request cache lookup time in milliseconds",
    labels: [],
  },
  dependencyAnalysisTime: {
    name: "agent_dependency_analysis_time_ms",
    type: "histogram" as const,
    description: "Dependency analysis time in milliseconds",
    labels: [],
  },
  dependencyAnalysisGroups: {
    name: "agent_dependency_analysis_groups",
    type: "histogram" as const,
    description: "Number of execution groups from dependency analysis",
    labels: [],
  },
  dependencyAnalysisCycles: {
    name: "agent_dependency_analysis_cycles_detected_total",
    type: "counter" as const,
    description: "Cycles detected in dependency analysis",
    labels: [],
  },
} as const;

// ============================================================================
// Metrics Collector Interface
// ============================================================================

export interface IMetricsCollector {
  /** Increment a counter */
  increment(name: string, labels?: Record<string, string>, value?: number): void;

  /** Set a gauge value */
  gauge(name: string, value: number, labels?: Record<string, string>): void;

  /** Record a histogram observation */
  observe(name: string, value: number, labels?: Record<string, string>): void;

  /** Get all current metrics */
  getMetrics(): MetricValue[];

  /** Export metrics in Prometheus format */
  toPrometheus(): string;
}

// ============================================================================
// In-Memory Metrics Collector
// ============================================================================

export class InMemoryMetricsCollector implements IMetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  private makeKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  increment(name: string, labels?: Record<string, string>, value = 1): void {
    const key = this.makeKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    this.histograms.set(key, values);
  }

  getMetrics(): MetricValue[] {
    const now = Date.now();
    const result: MetricValue[] = [];

    for (const [key, value] of this.counters) {
      result.push({ name: key, value, timestamp: now });
    }

    for (const [key, value] of this.gauges) {
      result.push({ name: key, value, timestamp: now });
    }

    for (const [key, values] of this.histograms) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        result.push({ name: `${key}_avg`, value: avg, timestamp: now });
        result.push({ name: `${key}_count`, value: values.length, timestamp: now });
        result.push({ name: `${key}_sum`, value: sum, timestamp: now });
      }
    }

    return result;
  }

  toPrometheus(): string {
    const lines: string[] = [];

    for (const [key, value] of this.counters) {
      lines.push(`${key} ${value}`);
    }

    for (const [key, value] of this.gauges) {
      lines.push(`${key} ${value}`);
    }

    for (const [key, values] of this.histograms) {
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        lines.push(`${key}_count ${values.length}`);
        lines.push(`${key}_sum ${sum}`);
      }
    }

    return lines.join("\n");
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

// ============================================================================
// Tracing Types
// ============================================================================

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: "ok" | "error" | "unset";
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

// ============================================================================
// Tracer Interface
// ============================================================================

export interface ITracer {
  /** Start a new span */
  startSpan(name: string, options?: StartSpanOptions): SpanContext;

  /** Get the current active span */
  getActiveSpan(): SpanContext | undefined;

  /** Run a function within a span */
  withSpan<T>(name: string, fn: (span: SpanContext) => T | Promise<T>): Promise<T>;
}

export interface StartSpanOptions {
  parentSpan?: SpanContext;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanContext {
  readonly traceId: string;
  readonly spanId: string;

  /** Set an attribute on the span */
  setAttribute(key: string, value: string | number | boolean): void;

  /** Add an event to the span */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;

  /** Set the span status */
  setStatus(status: "ok" | "error", message?: string): void;

  /** End the span */
  end(): void;
}

// ============================================================================
// Simple In-Memory Tracer
// ============================================================================

export class InMemoryTracer implements ITracer {
  private spans: Span[] = [];
  private activeSpan?: SpanContext;
  private readonly maxSpans: number;

  constructor(maxSpans = 1000) {
    this.maxSpans = maxSpans;
  }

  startSpan(name: string, options?: StartSpanOptions): SpanContext {
    const traceId = options?.parentSpan?.traceId ?? this.generateId();
    const spanId = this.generateId();

    const span: Span = {
      traceId,
      spanId,
      parentSpanId: options?.parentSpan?.spanId,
      name,
      startTime: Date.now(),
      attributes: options?.attributes ?? {},
      events: [],
      status: "unset",
    };

    const context: SpanContext = {
      traceId,
      spanId,
      setAttribute: (key, value) => {
        span.attributes[key] = value;
      },
      addEvent: (eventName, attributes) => {
        span.events.push({ name: eventName, timestamp: Date.now(), attributes });
      },
      setStatus: (status, message) => {
        span.status = status;
        if (message) {
          span.attributes["status.message"] = message;
        }
      },
      end: () => {
        span.endTime = Date.now();
        this.spans.push(span);
        if (this.spans.length > this.maxSpans) {
          this.spans.shift();
        }
        if (this.activeSpan === context) {
          this.activeSpan = undefined;
        }
      },
    };

    this.activeSpan = context;
    return context;
  }

  getActiveSpan(): SpanContext | undefined {
    return this.activeSpan;
  }

  async withSpan<T>(name: string, fn: (span: SpanContext) => T | Promise<T>): Promise<T> {
    const span = this.startSpan(name, {
      parentSpan: this.activeSpan,
    });

    try {
      const result = await fn(span);
      span.setStatus("ok");
      return result;
    } catch (error) {
      span.setStatus("error", error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span.end();
    }
  }

  getSpans(): Span[] {
    return [...this.spans];
  }

  getSpansByTrace(traceId: string): Span[] {
    return this.spans.filter((s) => s.traceId === traceId);
  }

  private generateId(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  reset(): void {
    this.spans = [];
    this.activeSpan = undefined;
  }
}

// ============================================================================
// Telemetry Context (combines metrics + tracing)
// ============================================================================

export interface TelemetryContext {
  metrics: IMetricsCollector;
  tracer: ITracer;
}

export function createTelemetryContext(): TelemetryContext {
  return {
    metrics: new InMemoryMetricsCollector(),
    tracer: new InMemoryTracer(),
  };
}

// ============================================================================
// Instrumented Helpers
// ============================================================================

/**
 * Measure the duration of an async function and record as histogram.
 */
export async function measureAsync<T>(
  metrics: IMetricsCollector,
  metricName: string,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    metrics.observe(metricName, Date.now() - start, labels);
  }
}

/**
 * Wrap a function with tracing.
 */
export function traced<T extends (...args: unknown[]) => unknown>(
  tracer: ITracer,
  spanName: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    return tracer.withSpan(spanName, async (span) => {
      span.setAttribute("args.count", args.length);
      return fn(...args);
    });
  }) as T;
}

// ============================================================================
// Event Bus Telemetry Bridge
// ============================================================================

/**
 * Attach telemetry updates to event bus signals.
 * Avoid double counting if metrics are emitted elsewhere.
 */
export function attachTelemetryToEventBus(
  telemetry: TelemetryContext,
  eventBus: RuntimeEventBus
): () => void {
  let activeAgents = 0;

  const subscriptions = [
    eventBus.subscribe("tool:called", (event) => {
      telemetry.metrics.increment(AGENT_METRICS.toolCallsTotal.name, {
        tool_name: event.payload.toolName,
        status: "started",
      });
    }),
    eventBus.subscribe("tool:completed", (event) => {
      telemetry.metrics.increment(AGENT_METRICS.toolCallsTotal.name, {
        tool_name: event.payload.toolName,
        status: "success",
      });
      telemetry.metrics.observe(AGENT_METRICS.toolCallDuration.name, event.payload.durationMs, {
        tool_name: event.payload.toolName,
      });
    }),
    eventBus.subscribe("tool:failed", (event) => {
      telemetry.metrics.increment(AGENT_METRICS.toolCallsTotal.name, {
        tool_name: event.payload.toolName,
        status: "error",
      });
    }),
    eventBus.subscribe("agent:started", () => {
      activeAgents += 1;
      telemetry.metrics.gauge(AGENT_METRICS.activeAgents.name, activeAgents);
    }),
    eventBus.subscribe("agent:completed", () => {
      activeAgents = Math.max(0, activeAgents - 1);
      telemetry.metrics.gauge(AGENT_METRICS.activeAgents.name, activeAgents);
    }),
    eventBus.subscribe("agent:failed", () => {
      activeAgents = Math.max(0, activeAgents - 1);
      telemetry.metrics.gauge(AGENT_METRICS.activeAgents.name, activeAgents);
    }),
    eventBus.subscribe("agent:cancelled", () => {
      activeAgents = Math.max(0, activeAgents - 1);
      telemetry.metrics.gauge(AGENT_METRICS.activeAgents.name, activeAgents);
    }),
  ];

  return () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };
}

// Profiler
export {
  createNoopProfiler,
  createProfiler,
  getGlobalProfiler,
  type ProfileEntry,
  type ProfileReport,
  Profiler,
  type ProfilerConfig,
  type ProfileStats,
  profileMethod,
  setGlobalProfiler,
} from "./profiler";

// Structured Logger
export {
  type AgentLogContext,
  consoleHandler,
  createNoopLogger,
  createStructuredLogger,
  type IStructuredLogger,
  jsonHandler,
  LogBuffer,
  type LogEntry,
  type LogHandler,
  type LogLevel,
  StructuredLogger,
  type StructuredLoggerConfig,
} from "./structuredLogger";
