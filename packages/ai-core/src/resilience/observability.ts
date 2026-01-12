/**
 * AI Observability
 *
 * Metrics collection, structured logging, and distributed tracing
 * for monitoring AI operations in production.
 */

/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Metric types */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/** Log entry */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

/** Metric entry */
export interface MetricEntry {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/** Span for distributed tracing */
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  tags: Record<string, string | number | boolean>;
  logs: Array<{ timestamp: number; message: string }>;
}

/** Logger interface */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/** Metrics collector interface */
export interface MetricsCollector {
  increment(name: string, labels?: Record<string, string>, value?: number): void;
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  getMetrics(): MetricEntry[];
}

/** Tracer interface */
export interface Tracer {
  startSpan(operationName: string, parentSpan?: Span): Span;
  finishSpan(span: Span, status?: "ok" | "error"): void;
  getCurrentSpan(): Span | null;
  getTrace(traceId: string): Span[];
}

/**
 * Default console logger with structured output.
 */
export class ConsoleLogger implements Logger {
  private readonly prefix: string;
  private readonly minLevel: LogLevel;
  private traceId?: string;

  private static readonly LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options: { prefix?: string; minLevel?: LogLevel } = {}) {
    this.prefix = options.prefix || "[AI]";
    this.minLevel = options.minLevel || "info";
  }

  withTrace(traceId: string): ConsoleLogger {
    const logger = new ConsoleLogger({ prefix: this.prefix, minLevel: this.minLevel });
    logger.traceId = traceId;
    return logger;
  }

  private shouldLog(level: LogLevel): boolean {
    return ConsoleLogger.LEVEL_ORDER[level] >= ConsoleLogger.LEVEL_ORDER[this.minLevel];
  }

  private formatContext(context: Record<string, unknown>): string {
    const entries = Object.entries(context);
    if (entries.length === 0) {
      return "";
    }
    return ` ${entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`;
  }

  debug(message: string, context: Record<string, unknown> = {}): void {
    if (!this.shouldLog("debug")) {
      return;
    }
    const ctx = this.traceId ? { ...context, traceId: this.traceId } : context;
    console.debug(`${this.prefix} [DEBUG] ${message}${this.formatContext(ctx)}`);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    if (!this.shouldLog("info")) {
      return;
    }
    const ctx = this.traceId ? { ...context, traceId: this.traceId } : context;
    console.info(`${this.prefix} [INFO] ${message}${this.formatContext(ctx)}`);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    if (!this.shouldLog("warn")) {
      return;
    }
    const ctx = this.traceId ? { ...context, traceId: this.traceId } : context;
    console.warn(`${this.prefix} [WARN] ${message}${this.formatContext(ctx)}`);
  }

  error(message: string, error?: Error, context: Record<string, unknown> = {}): void {
    if (!this.shouldLog("error")) {
      return;
    }
    const ctx = this.traceId ? { ...context, traceId: this.traceId } : context;
    const errorInfo = error ? ` error=${error.message}` : "";
    console.error(`${this.prefix} [ERROR] ${message}${errorInfo}${this.formatContext(ctx)}`);
    if (error?.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * In-memory metrics collector.
 */
export class InMemoryMetrics implements MetricsCollector {
  private readonly metrics: Map<string, MetricEntry[]> = new Map();
  private readonly maxEntriesPerMetric = 1000;

  increment(name: string, labels: Record<string, string> = {}, value = 1): void {
    this.addMetric(name, "counter", value, labels);
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    this.addMetric(name, "gauge", value, labels);
  }

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    this.addMetric(name, "histogram", value, labels);
  }

  private addMetric(
    name: string,
    type: MetricType,
    value: number,
    labels: Record<string, string>
  ): void {
    const entry: MetricEntry = {
      name,
      type,
      value,
      labels,
      timestamp: Date.now(),
    };

    let entries = this.metrics.get(name);
    if (!entries) {
      entries = [];
      this.metrics.set(name, entries);
    }

    entries.push(entry);

    // Trim if too many entries
    if (entries.length > this.maxEntriesPerMetric) {
      entries.shift();
    }
  }

  getMetrics(): MetricEntry[] {
    const all: MetricEntry[] = [];
    for (const entries of this.metrics.values()) {
      all.push(...entries);
    }
    return all;
  }

  getMetricsByName(name: string): MetricEntry[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get aggregated stats for a metric.
   */
  getStats(
    name: string,
    windowMs = 60000
  ): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const entries = this.metrics.get(name);
    if (!entries || entries.length === 0) {
      return null;
    }

    const cutoff = Date.now() - windowMs;
    const values = entries
      .filter((e) => e.timestamp >= cutoff)
      .map((e) => e.value)
      .sort((a, b) => a - b);

    if (values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const percentile = (p: number) => {
      const idx = Math.ceil((p / 100) * values.length) - 1;
      return values[Math.max(0, idx)];
    };

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
    };
  }

  clear(): void {
    this.metrics.clear();
  }
}

/**
 * Simple distributed tracer.
 */
export class SimpleTracer implements Tracer {
  private readonly spans = new Map<string, Span[]>();
  private currentSpan: Span | null = null;
  private readonly maxSpansPerTrace = 100;

  startSpan(operationName: string, parentSpan?: Span): Span {
    const traceId = parentSpan?.traceId || this.generateId();
    const span: Span = {
      traceId,
      spanId: this.generateId(),
      parentSpanId: parentSpan?.spanId,
      operationName,
      startTime: performance.now(),
      status: "ok",
      tags: {},
      logs: [],
    };

    // Store span
    let traceSpans = this.spans.get(traceId);
    if (!traceSpans) {
      traceSpans = [];
      this.spans.set(traceId, traceSpans);
    }
    traceSpans.push(span);

    // Limit spans per trace
    if (traceSpans.length > this.maxSpansPerTrace) {
      traceSpans.shift();
    }

    this.currentSpan = span;
    return span;
  }

  finishSpan(span: Span, status: "ok" | "error" = "ok"): void {
    span.endTime = performance.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    // Clear current span if it's this one
    if (this.currentSpan?.spanId === span.spanId) {
      // Find parent span
      const traceSpans = this.spans.get(span.traceId);
      if (traceSpans && span.parentSpanId) {
        this.currentSpan = traceSpans.find((s) => s.spanId === span.parentSpanId) || null;
      } else {
        this.currentSpan = null;
      }
    }
  }

  getCurrentSpan(): Span | null {
    return this.currentSpan;
  }

  getTrace(traceId: string): Span[] {
    return this.spans.get(traceId) || [];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Create a trace-aware execution context.
   */
  async trace<T>(
    operationName: string,
    fn: (span: Span) => Promise<T>,
    parentSpan?: Span
  ): Promise<T> {
    const span = this.startSpan(operationName, parentSpan);
    try {
      const result = await fn(span);
      this.finishSpan(span, "ok");
      return result;
    } catch (error) {
      span.logs.push({
        timestamp: performance.now(),
        message: error instanceof Error ? error.message : String(error),
      });
      this.finishSpan(span, "error");
      throw error;
    }
  }

  clear(): void {
    this.spans.clear();
    this.currentSpan = null;
  }
}

/**
 * Observability context combining logger, metrics, and tracer.
 */
export class ObservabilityContext {
  readonly logger: Logger;
  readonly metrics: MetricsCollector;
  readonly tracer: Tracer;

  constructor(
    options: {
      logger?: Logger;
      metrics?: MetricsCollector;
      tracer?: Tracer;
    } = {}
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.metrics = options.metrics || new InMemoryMetrics();
    this.tracer = options.tracer || new SimpleTracer();
  }

  /**
   * Record an AI operation with full observability.
   */
  async recordOperation<T>(
    operationName: string,
    fn: () => Promise<T>,
    labels: Record<string, string> = {}
  ): Promise<T> {
    const span = this.tracer.startSpan(operationName);
    const startTime = performance.now();

    try {
      this.logger.debug(`Starting ${operationName}`, labels);
      const result = await fn();
      const duration = performance.now() - startTime;

      this.metrics.histogram(`ai.${operationName}.duration_ms`, duration, labels);
      this.metrics.increment(`ai.${operationName}.success`, labels);
      this.logger.info(`Completed ${operationName}`, { ...labels, durationMs: duration });
      this.tracer.finishSpan(span, "ok");

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;

      this.metrics.histogram(`ai.${operationName}.duration_ms`, duration, labels);
      this.metrics.increment(`ai.${operationName}.error`, labels);
      this.logger.error(
        `Failed ${operationName}`,
        error instanceof Error ? error : undefined,
        labels
      );
      this.tracer.finishSpan(span, "error");

      throw error;
    }
  }
}

/**
 * Create a default observability context.
 */
export function createObservability(
  options: {
    logLevel?: LogLevel;
    prefix?: string;
  } = {}
): ObservabilityContext {
  return new ObservabilityContext({
    logger: new ConsoleLogger({
      prefix: options.prefix || "[AI]",
      minLevel: options.logLevel || "info",
    }),
    metrics: new InMemoryMetrics(),
    tracer: new SimpleTracer(),
  });
}

/** Singleton observability context */
let globalObservability: ObservabilityContext | null = null;

export function getObservability(): ObservabilityContext {
  if (!globalObservability) {
    globalObservability = createObservability();
  }
  return globalObservability;
}

export function setObservability(ctx: ObservabilityContext): void {
  globalObservability = ctx;
}
