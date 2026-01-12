/**
 * Unified Telemetry Context
 *
 * Provides a single context for all observability concerns:
 * logging, metrics, tracing, and profiling.
 *
 * Features:
 * - Correlation IDs across all telemetry
 * - Structured context propagation
 * - Multiple export destinations
 * - Sampling and filtering
 * - Resource attribution
 */

import type { Logger, MetricsCollector, Span, Tracer } from "../resilience/observability";
import { ConsoleLogger, InMemoryMetrics, SimpleTracer } from "../resilience/observability";

// ============================================================================
// Types
// ============================================================================

/** Resource attributes for context */
export interface ResourceAttributes {
  /** Service name */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Environment (production, staging, development) */
  environment: string;
  /** Instance ID */
  instanceId: string;
  /** Additional attributes */
  [key: string]: string | number | boolean | undefined;
}

/** Telemetry exporter interface */
export interface TelemetryExporter {
  /** Exporter name */
  name: string;
  /** Export logs */
  exportLogs?(entries: LogExportEntry[]): Promise<void>;
  /** Export metrics */
  exportMetrics?(metrics: MetricExportEntry[]): Promise<void>;
  /** Export traces */
  exportTraces?(spans: SpanExportEntry[]): Promise<void>;
  /** Flush pending exports */
  flush?(): Promise<void>;
  /** Shutdown exporter */
  shutdown?(): Promise<void>;
}

/** Log export entry */
export interface LogExportEntry {
  timestamp: number;
  level: string;
  message: string;
  attributes: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  resource: ResourceAttributes;
}

/** Metric export entry */
export interface MetricExportEntry {
  name: string;
  type: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
  resource: ResourceAttributes;
}

/** Span export entry */
export interface SpanExportEntry {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: string;
  attributes: Record<string, unknown>;
  events: Array<{ timestamp: number; name: string; attributes?: Record<string, unknown> }>;
  resource: ResourceAttributes;
}

/** Telemetry context configuration */
export interface TelemetryContextConfig {
  /** Resource attributes */
  resource: Partial<ResourceAttributes>;
  /** Logger instance */
  logger?: Logger;
  /** Metrics collector */
  metrics?: MetricsCollector;
  /** Tracer instance */
  tracer?: Tracer;
  /** Telemetry exporters */
  exporters?: TelemetryExporter[];
  /** Export interval in ms (default: 60000) */
  exportIntervalMs?: number;
  /** Sampling rate (0-1, default: 1) */
  samplingRate?: number;
  /** Enable auto-flush on shutdown (default: true) */
  autoFlush?: boolean;
  /** Max buffer size before auto-export (default: 1000) */
  maxBufferSize?: number;
}

/** Scoped context for operations */
export interface ScopedContext {
  /** Trace ID for this scope */
  traceId: string;
  /** Span ID for this scope */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Operation name */
  operationName: string;
  /** Start timestamp */
  startTime: number;
  /** Context attributes */
  attributes: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_RESOURCE: ResourceAttributes = {
  serviceName: "unknown",
  serviceVersion: "0.0.0",
  environment: "development",
  instanceId: `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
};

const DEFAULT_CONFIG = {
  exportIntervalMs: 60000,
  samplingRate: 1,
  autoFlush: true,
  maxBufferSize: 1000,
} as const;

// ============================================================================
// Telemetry Context Implementation
// ============================================================================

/**
 * Unified Telemetry Context
 *
 * Central hub for all observability data.
 */
export class TelemetryContext {
  readonly resource: ResourceAttributes;
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  readonly tracer: Tracer;

  private readonly config: Required<
    Omit<TelemetryContextConfig, "resource" | "logger" | "metrics" | "tracer">
  >;
  private readonly exporters: TelemetryExporter[];
  private readonly logBuffer: LogExportEntry[] = [];
  private readonly metricBuffer: MetricExportEntry[] = [];
  private readonly spanBuffer: SpanExportEntry[] = [];
  private exportInterval: ReturnType<typeof setInterval> | null = null;
  private activeScopes = new Map<string, ScopedContext>();

  constructor(config: TelemetryContextConfig) {
    this.resource = { ...DEFAULT_RESOURCE, ...config.resource };
    this.logger = config.logger ?? new ConsoleLogger({ prefix: `[${this.resource.serviceName}]` });
    this.metrics = config.metrics ?? new InMemoryMetrics();
    this.tracer = config.tracer ?? new SimpleTracer();
    this.exporters = config.exporters ?? [];
    this.config = {
      exportIntervalMs: config.exportIntervalMs ?? DEFAULT_CONFIG.exportIntervalMs,
      samplingRate: config.samplingRate ?? DEFAULT_CONFIG.samplingRate,
      autoFlush: config.autoFlush ?? DEFAULT_CONFIG.autoFlush,
      maxBufferSize: config.maxBufferSize ?? DEFAULT_CONFIG.maxBufferSize,
      exporters: config.exporters ?? [],
    };

    // Start export interval if exporters are configured
    if (this.exporters.length > 0 && this.config.exportIntervalMs > 0) {
      this.startExportInterval();
    }
  }

  /**
   * Start a scoped operation context.
   */
  startScope(operationName: string, attributes: Record<string, unknown> = {}): ScopedContext {
    const span = this.tracer.startSpan(operationName);
    const scope: ScopedContext = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operationName,
      startTime: span.startTime,
      attributes,
    };

    this.activeScopes.set(span.spanId, scope);
    return scope;
  }

  /**
   * End a scoped operation context.
   */
  endScope(scope: ScopedContext, status: "ok" | "error" = "ok", error?: Error): void {
    const span = this.getSpanFromScope(scope);
    if (span) {
      if (error) {
        span.logs.push({
          timestamp: performance.now(),
          message: error.message,
        });
      }
      this.tracer.finishSpan(span, status);

      // Buffer span for export
      if (this.shouldSample()) {
        this.bufferSpan(span, scope);
      }
    }

    this.activeScopes.delete(scope.spanId);
  }

  /**
   * Execute an operation within a scope.
   */
  async withScope<T>(
    operationName: string,
    fn: (scope: ScopedContext) => Promise<T>,
    attributes: Record<string, unknown> = {}
  ): Promise<T> {
    const scope = this.startScope(operationName, attributes);

    try {
      const result = await fn(scope);
      this.endScope(scope, "ok");
      return result;
    } catch (error) {
      this.endScope(scope, "error", error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Log with context correlation.
   */
  log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    attributes: Record<string, unknown> = {},
    scope?: ScopedContext
  ): void {
    // Log via logger
    if (level === "error") {
      this.logger.error(message, undefined, attributes);
    } else {
      this.logger[level](message, attributes);
    }

    // Buffer for export
    if (this.shouldSample()) {
      this.bufferLog(level, message, attributes, scope);
    }
  }

  /**
   * Record a metric with context.
   */
  recordMetric(
    name: string,
    value: number,
    type: "counter" | "gauge" | "histogram" = "gauge",
    labels: Record<string, string> = {}
  ): void {
    // Record via metrics collector
    switch (type) {
      case "counter":
        this.metrics.increment(name, labels, value);
        break;
      case "gauge":
        this.metrics.gauge(name, value, labels);
        break;
      case "histogram":
        this.metrics.histogram(name, value, labels);
        break;
    }

    // Buffer for export
    if (this.shouldSample()) {
      this.bufferMetric(name, type, value, labels);
    }
  }

  /**
   * Add event to current scope.
   */
  addEvent(scope: ScopedContext, name: string, attributes: Record<string, unknown> = {}): void {
    const span = this.getSpanFromScope(scope);
    if (span) {
      span.logs.push({
        timestamp: performance.now(),
        message: `${name}: ${JSON.stringify(attributes)}`,
      });
    }
  }

  /**
   * Set attribute on scope.
   */
  setAttribute(scope: ScopedContext, key: string, value: unknown): void {
    scope.attributes[key] = value;
    const span = this.getSpanFromScope(scope);
    if (span) {
      span.tags[key] = value as string | number | boolean;
    }
  }

  /**
   * Get current active scope.
   */
  getCurrentScope(): ScopedContext | undefined {
    const currentSpan = this.tracer.getCurrentSpan();
    if (currentSpan) {
      return this.activeScopes.get(currentSpan.spanId);
    }
    return undefined;
  }

  /**
   * Flush all buffered telemetry to exporters.
   */
  async flush(): Promise<void> {
    const logs = [...this.logBuffer];
    const metrics = [...this.metricBuffer];
    const spans = [...this.spanBuffer];

    this.logBuffer.length = 0;
    this.metricBuffer.length = 0;
    this.spanBuffer.length = 0;

    const exportPromises: Promise<void>[] = [];

    for (const exporter of this.exporters) {
      if (exporter.exportLogs && logs.length > 0) {
        exportPromises.push(
          exporter.exportLogs(logs).catch((e) => {
            console.error(`[TelemetryContext] Log export failed for ${exporter.name}:`, e);
          })
        );
      }
      if (exporter.exportMetrics && metrics.length > 0) {
        exportPromises.push(
          exporter.exportMetrics(metrics).catch((e) => {
            console.error(`[TelemetryContext] Metric export failed for ${exporter.name}:`, e);
          })
        );
      }
      if (exporter.exportTraces && spans.length > 0) {
        exportPromises.push(
          exporter.exportTraces(spans).catch((e) => {
            console.error(`[TelemetryContext] Trace export failed for ${exporter.name}:`, e);
          })
        );
      }
    }

    await Promise.all(exportPromises);
  }

  /**
   * Shutdown the telemetry context.
   */
  async shutdown(): Promise<void> {
    this.stopExportInterval();

    if (this.config.autoFlush) {
      await this.flush();
    }

    for (const exporter of this.exporters) {
      if (exporter.shutdown) {
        await exporter.shutdown().catch((e) => {
          console.error(`[TelemetryContext] Exporter shutdown failed for ${exporter.name}:`, e);
        });
      }
    }
  }

  /**
   * Get telemetry statistics.
   */
  getStats(): {
    activeScopes: number;
    bufferedLogs: number;
    bufferedMetrics: number;
    bufferedSpans: number;
    exporters: number;
  } {
    return {
      activeScopes: this.activeScopes.size,
      bufferedLogs: this.logBuffer.length,
      bufferedMetrics: this.metricBuffer.length,
      bufferedSpans: this.spanBuffer.length,
      exporters: this.exporters.length,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startExportInterval(): void {
    this.exportInterval = setInterval(() => {
      this.flush().catch((e) => {
        console.error("[TelemetryContext] Auto-flush failed:", e);
      });
    }, this.config.exportIntervalMs);
  }

  private stopExportInterval(): void {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
    }
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  private getSpanFromScope(scope: ScopedContext): Span | undefined {
    const traces = this.tracer.getTrace(scope.traceId);
    return traces.find((s) => s.spanId === scope.spanId);
  }

  private bufferLog(
    level: string,
    message: string,
    attributes: Record<string, unknown>,
    scope?: ScopedContext
  ): void {
    const entry: LogExportEntry = {
      timestamp: Date.now(),
      level,
      message,
      attributes,
      traceId: scope?.traceId,
      spanId: scope?.spanId,
      resource: this.resource,
    };

    this.logBuffer.push(entry);
    this.checkAutoFlush();
  }

  private bufferMetric(
    name: string,
    type: string,
    value: number,
    labels: Record<string, string>
  ): void {
    const entry: MetricExportEntry = {
      name,
      type,
      value,
      labels,
      timestamp: Date.now(),
      resource: this.resource,
    };

    this.metricBuffer.push(entry);
    this.checkAutoFlush();
  }

  private bufferSpan(span: Span, scope: ScopedContext): void {
    const entry: SpanExportEntry = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      operationName: span.operationName,
      startTime: span.startTime,
      endTime: span.endTime ?? performance.now(),
      duration: span.duration ?? 0,
      status: span.status,
      attributes: { ...span.tags, ...scope.attributes },
      events: span.logs.map((log) => ({
        timestamp: log.timestamp,
        name: log.message,
      })),
      resource: this.resource,
    };

    this.spanBuffer.push(entry);
    this.checkAutoFlush();
  }

  private checkAutoFlush(): void {
    const totalBuffered = this.logBuffer.length + this.metricBuffer.length + this.spanBuffer.length;

    if (totalBuffered >= this.config.maxBufferSize) {
      this.flush().catch((e) => {
        console.error("[TelemetryContext] Buffer overflow flush failed:", e);
      });
    }
  }
}

/**
 * Create a telemetry context.
 */
export function createTelemetryContext(config: TelemetryContextConfig): TelemetryContext {
  return new TelemetryContext(config);
}
