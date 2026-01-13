/**
 * Unified Telemetry Adapter
 *
 * Provides a single interface for metrics, events, and performance data
 * with support for dev console, test mocking, and production providers.
 */

// ============================================================================
// Types
// ============================================================================

/** Metric types supported by the adapter */
export type MetricType = "counter" | "gauge" | "histogram";

/** Tags for metric grouping */
export type MetricTags = Record<string, string | number | boolean>;

/** Performance metric event */
export interface PerfMetricEvent {
  name: "perf_decode" | "perf_render" | "perf_fps";
  value: number;
  tags?: MetricTags;
}

/** Telemetry event - accepts any named event */
export type TelemetryEvent = { name: string } & Record<string, unknown>;

// ============================================================================
// Adapter Interface
// ============================================================================

/**
 * Telemetry adapter interface.
 * Implement this for different backends (console, PostHog, etc.)
 */
export interface TelemetryAdapter {
  /** Track an analytics or perf event */
  track(event: TelemetryEvent): void;

  /** Record a metric value */
  recordMetric(name: string, value: number, tags?: MetricTags): void;

  /** Increment a counter */
  increment(name: string, tags?: MetricTags): void;

  /** Set a gauge value */
  gauge(name: string, value: number, tags?: MetricTags): void;

  /** Record a histogram observation */
  observe(name: string, value: number, tags?: MetricTags): void;

  /** Flush pending events to backend */
  flush(): Promise<void>;
}

// ============================================================================
// Console Adapter (Development)
// ============================================================================

const DEBUG = process.env.NODE_ENV === "development";

/**
 * Console adapter for development logging.
 */
export class ConsoleTelemetryAdapter implements TelemetryAdapter {
  private enabled: boolean;

  constructor(enabled = DEBUG) {
    this.enabled = enabled;
  }

  track(event: TelemetryEvent): void {
    if (!this.enabled) {
      return;
    }
    console.debug(`[Telemetry] ${event.name}`, event);
  }

  recordMetric(name: string, value: number, tags?: MetricTags): void {
    if (!this.enabled) {
      return;
    }
    console.debug(`[Metric] ${name}=${value}`, tags);
  }

  increment(name: string, tags?: MetricTags): void {
    this.recordMetric(name, 1, tags);
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    this.recordMetric(name, value, { ...tags, type: "gauge" });
  }

  observe(name: string, value: number, tags?: MetricTags): void {
    this.recordMetric(name, value, { ...tags, type: "histogram" });
  }

  async flush(): Promise<void> {
    // No-op for console
  }
}

// ============================================================================
// Test Adapter (Mocking)
// ============================================================================

/**
 * Test adapter that stores events for assertions.
 */
export class TestTelemetryAdapter implements TelemetryAdapter {
  private events: TelemetryEvent[] = [];
  private metrics: Array<{ name: string; value: number; tags?: MetricTags }> = [];

  track(event: TelemetryEvent): void {
    this.events.push(event);
  }

  recordMetric(name: string, value: number, tags?: MetricTags): void {
    this.metrics.push({ name, value, tags });
  }

  increment(name: string, tags?: MetricTags): void {
    this.recordMetric(name, 1, tags);
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    this.recordMetric(name, value, tags);
  }

  observe(name: string, value: number, tags?: MetricTags): void {
    this.recordMetric(name, value, tags);
  }

  async flush(): Promise<void> {
    // No-op for tests
  }

  // Test helpers
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  getMetrics(): Array<{ name: string; value: number; tags?: MetricTags }> {
    return [...this.metrics];
  }

  clear(): void {
    this.events = [];
    this.metrics = [];
  }
}

// ============================================================================
// Global Adapter Registry
// ============================================================================

let globalAdapter: TelemetryAdapter = new ConsoleTelemetryAdapter();

/**
 * Set the global telemetry adapter.
 */
export function setTelemetryAdapter(adapter: TelemetryAdapter): void {
  globalAdapter = adapter;
}

/**
 * Get the global telemetry adapter.
 */
export function getTelemetryAdapter(): TelemetryAdapter {
  return globalAdapter;
}

/**
 * Track an event through the global adapter.
 */
export function telemetryTrack(event: TelemetryEvent): void {
  globalAdapter.track(event);
}

/**
 * Record a metric through the global adapter.
 */
export function telemetryMetric(name: string, value: number, tags?: MetricTags): void {
  globalAdapter.recordMetric(name, value, tags);
}
