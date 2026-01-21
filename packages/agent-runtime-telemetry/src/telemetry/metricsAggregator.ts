/**
 * Metrics Aggregator
 *
 * Aggregates runtime metrics for observability and monitoring.
 * Implements Track H.3: Observability & Metrics.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Metric types supported by the aggregator.
 */
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

/**
 * A single metric data point.
 */
export interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Histogram bucket for distribution metrics.
 */
export interface HistogramBucket {
  le: number; // Less than or equal
  count: number;
}

/**
 * Aggregated histogram data.
 */
export interface HistogramData {
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

/**
 * Summary data with percentiles.
 */
export interface SummaryData {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  sum: number;
  count: number;
}

/**
 * Aggregated metric with computed statistics.
 */
export interface AggregatedMetric {
  name: string;
  type: MetricType;
  labels: Record<string, string>;
  value?: number; // For counter/gauge
  histogram?: HistogramData; // For histogram
  summary?: SummaryData; // For summary
  lastUpdated: number;
}

/**
 * Metrics aggregator configuration.
 */
export interface MetricsAggregatorConfig {
  /** Histogram bucket boundaries */
  histogramBuckets?: number[];
  /** Maximum number of metrics to retain */
  maxMetrics?: number;
  /** Auto-flush interval in ms (0 = disabled) */
  flushIntervalMs?: number;
  /** Callback for flushing metrics */
  onFlush?: (metrics: AggregatedMetric[]) => void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_HISTOGRAM_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const MAX_SAMPLE_WINDOW = 10000;

class SlidingWindow {
  private values: number[] = [];
  private head = 0;
  private total = 0;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(value: number): void {
    this.values.push(value);
    this.total += value;
    if (this.size <= this.maxSize) {
      return;
    }
    const removed = this.values[this.head];
    this.head += 1;
    this.total -= removed;
    if (this.head > 64 && this.head * 2 > this.values.length) {
      this.values = this.values.slice(this.head);
      this.head = 0;
    }
  }

  get size(): number {
    return this.values.length - this.head;
  }

  get sum(): number {
    return this.total;
  }

  forEach(callback: (value: number) => void): void {
    for (let i = this.head; i < this.values.length; i++) {
      callback(this.values[i]);
    }
  }

  toArray(): number[] {
    if (this.head === 0) {
      return [...this.values];
    }
    return this.values.slice(this.head);
  }
}

// ============================================================================
// Metrics Aggregator
// ============================================================================

/**
 * Aggregates and exports runtime metrics.
 */
export class MetricsAggregator {
  private readonly metrics = new Map<string, AggregatedMetric>();
  private readonly histogramValues = new Map<string, SlidingWindow>();
  private readonly summaryValues = new Map<string, SlidingWindow>();
  private readonly config: Required<Omit<MetricsAggregatorConfig, "onFlush">> & {
    onFlush?: (metrics: AggregatedMetric[]) => void;
  };
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(config: MetricsAggregatorConfig = {}) {
    this.config = {
      histogramBuckets: config.histogramBuckets ?? DEFAULT_HISTOGRAM_BUCKETS,
      maxMetrics: config.maxMetrics ?? 1000,
      flushIntervalMs: config.flushIntervalMs ?? 0,
      onFlush: config.onFlush,
    };

    if (this.config.flushIntervalMs > 0) {
      this.startAutoFlush();
    }
  }

  /**
   * Increment a counter metric.
   */
  incrementCounter(name: string, labels: Record<string, string> = {}, delta = 1): void {
    const key = this.makeKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type === "counter") {
      existing.value = (existing.value ?? 0) + delta;
      existing.lastUpdated = Date.now();
    } else {
      this.metrics.set(key, {
        name,
        type: "counter",
        labels,
        value: delta,
        lastUpdated: Date.now(),
      });
      this.enforceMaxMetrics();
    }
  }

  /**
   * Set a gauge metric.
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const isNew = !this.metrics.has(key);
    this.metrics.set(key, {
      name,
      type: "gauge",
      labels,
      value,
      lastUpdated: Date.now(),
    });
    if (isNew) {
      this.enforceMaxMetrics();
    }
  }

  /**
   * Record a value in a histogram.
   */
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);

    // Store raw value for histogram calculation
    let window = this.histogramValues.get(key);
    if (!window) {
      window = new SlidingWindow(MAX_SAMPLE_WINDOW);
      this.histogramValues.set(key, window);
    }
    window.push(value);

    // Update aggregated metric
    this.updateHistogram(key, name, labels, window);
  }

  /**
   * Record a value in a summary.
   */
  recordSummary(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);

    // Store raw value for summary calculation
    let window = this.summaryValues.get(key);
    if (!window) {
      window = new SlidingWindow(MAX_SAMPLE_WINDOW);
      this.summaryValues.set(key, window);
    }
    window.push(value);

    // Update aggregated metric
    this.updateSummary(key, name, labels, window);
  }

  /**
   * Get all aggregated metrics.
   */
  getMetrics(): AggregatedMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get a specific metric by name and labels.
   */
  getMetric(name: string, labels: Record<string, string> = {}): AggregatedMetric | undefined {
    const key = this.makeKey(name, labels);
    return this.metrics.get(key);
  }

  /**
   * Export metrics in Prometheus text format.
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      const labelStr = this.formatLabels(metric.labels);

      switch (metric.type) {
        case "counter":
        case "gauge":
          lines.push(`# TYPE ${metric.name} ${metric.type}`);
          lines.push(`${metric.name}${labelStr} ${metric.value ?? 0}`);
          break;

        case "histogram":
          if (metric.histogram) {
            lines.push(`# TYPE ${metric.name} histogram`);
            for (const bucket of metric.histogram.buckets) {
              const bucketLabels = { ...metric.labels, le: String(bucket.le) };
              lines.push(`${metric.name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`);
            }
            lines.push(`${metric.name}_sum${labelStr} ${metric.histogram.sum}`);
            lines.push(`${metric.name}_count${labelStr} ${metric.histogram.count}`);
          }
          break;

        case "summary":
          if (metric.summary) {
            lines.push(`# TYPE ${metric.name} summary`);
            lines.push(
              `${metric.name}${this.formatLabels({ ...metric.labels, quantile: "0.5" })} ${metric.summary.p50}`
            );
            lines.push(
              `${metric.name}${this.formatLabels({ ...metric.labels, quantile: "0.9" })} ${metric.summary.p90}`
            );
            lines.push(
              `${metric.name}${this.formatLabels({ ...metric.labels, quantile: "0.95" })} ${metric.summary.p95}`
            );
            lines.push(
              `${metric.name}${this.formatLabels({ ...metric.labels, quantile: "0.99" })} ${metric.summary.p99}`
            );
            lines.push(`${metric.name}_sum${labelStr} ${metric.summary.sum}`);
            lines.push(`${metric.name}_count${labelStr} ${metric.summary.count}`);
          }
          break;
      }
    }

    return lines.join("\n");
  }

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.metrics.clear();
    this.histogramValues.clear();
    this.summaryValues.clear();
  }

  /**
   * Dispose the aggregator.
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private makeKey(name: string, labels: Record<string, string>): string {
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${sortedLabels}}`;
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return "";
    }
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }

  private updateHistogram(
    key: string,
    name: string,
    labels: Record<string, string>,
    window: SlidingWindow
  ): void {
    const bucketLimits = this.config.histogramBuckets;
    const bucketCounts = new Array(bucketLimits.length).fill(0);
    window.forEach((value) => {
      const index = this.findBucketIndex(bucketLimits, value);
      if (index >= 0) {
        bucketCounts[index] += 1;
      }
    });

    const buckets: HistogramBucket[] = [];
    let running = 0;
    for (let i = 0; i < bucketLimits.length; i++) {
      running += bucketCounts[i];
      buckets.push({ le: bucketLimits[i], count: running });
    }

    buckets.push({ le: Number.POSITIVE_INFINITY, count: window.size });

    const isNew = !this.metrics.has(key);
    this.metrics.set(key, {
      name,
      type: "histogram",
      labels,
      histogram: {
        buckets,
        sum: window.sum,
        count: window.size,
      },
      lastUpdated: Date.now(),
    });
    if (isNew) {
      this.enforceMaxMetrics();
    }
  }

  private updateSummary(
    key: string,
    name: string,
    labels: Record<string, string>,
    window: SlidingWindow
  ): void {
    const sorted = window.toArray().sort((a, b) => a - b);
    const count = sorted.length;

    const percentile = (p: number): number => {
      if (count === 0) {
        return 0;
      }
      const idx = Math.ceil((p / 100) * count) - 1;
      return sorted[Math.max(0, Math.min(idx, count - 1))];
    };

    const isNew = !this.metrics.has(key);
    this.metrics.set(key, {
      name,
      type: "summary",
      labels,
      summary: {
        p50: percentile(50),
        p90: percentile(90),
        p95: percentile(95),
        p99: percentile(99),
        sum: window.sum,
        count,
      },
      lastUpdated: Date.now(),
    });
    if (isNew) {
      this.enforceMaxMetrics();
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.config.onFlush) {
        this.config.onFlush(this.getMetrics());
      }
    }, this.config.flushIntervalMs);
  }

  private findBucketIndex(bucketLimits: number[], value: number): number {
    let left = 0;
    let right = bucketLimits.length - 1;
    let result = -1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (value <= bucketLimits[mid]) {
        result = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return result;
  }

  /**
   * Enforce the maxMetrics limit by evicting oldest metrics.
   */
  private enforceMaxMetrics(): void {
    while (this.metrics.size > this.config.maxMetrics) {
      // Find oldest metric by lastUpdated
      let oldestKey: string | undefined;
      let oldestTime = Number.POSITIVE_INFINITY;

      for (const [key, metric] of this.metrics) {
        if (metric.lastUpdated < oldestTime) {
          oldestTime = metric.lastUpdated;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.metrics.delete(oldestKey);
        // Also clean up associated raw values
        this.histogramValues.delete(oldestKey);
        this.summaryValues.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalAggregator: MetricsAggregator | undefined;

/**
 * Get the global metrics aggregator instance.
 */
export function getMetricsAggregator(config?: MetricsAggregatorConfig): MetricsAggregator {
  if (!globalAggregator) {
    globalAggregator = new MetricsAggregator(config);
  }
  return globalAggregator;
}

/**
 * Create a new metrics aggregator instance.
 */
export function createMetricsAggregator(config?: MetricsAggregatorConfig): MetricsAggregator {
  return new MetricsAggregator(config);
}

/**
 * Reset the global metrics aggregator instance.
 * Useful for test isolation.
 */
export function resetGlobalMetricsAggregator(): void {
  globalAggregator?.dispose();
  globalAggregator = undefined;
}

// ============================================================================
// Pre-defined Metric Names
// ============================================================================

export const METRIC_NAMES = {
  // Routing metrics
  ROUTING_LATENCY_MS: "agent_runtime_routing_latency_ms",
  ROUTING_CACHE_HITS: "agent_runtime_routing_cache_hits_total",
  ROUTING_CACHE_MISSES: "agent_runtime_routing_cache_misses_total",

  // Compression metrics
  COMPRESSION_TOKENS_SAVED: "agent_runtime_compression_tokens_saved_total",
  COMPRESSION_RATIO: "agent_runtime_compression_ratio",
  COMPRESSION_TIME_MS: "agent_runtime_compression_time_ms",

  // Tool execution metrics
  TOOL_EXECUTION_TIME_MS: "agent_runtime_tool_execution_time_ms",
  TOOL_CALLS_TOTAL: "agent_runtime_tool_calls_total",
  TOOL_ERRORS_TOTAL: "agent_runtime_tool_errors_total",

  // LLM metrics
  LLM_LATENCY_MS: "agent_runtime_llm_latency_ms",
  LLM_TOKENS_INPUT: "agent_runtime_llm_tokens_input_total",
  LLM_TOKENS_OUTPUT: "agent_runtime_llm_tokens_output_total",

  // Turn metrics
  TURN_COUNT: "agent_runtime_turn_count_total",
  TURN_DURATION_MS: "agent_runtime_turn_duration_ms",
} as const;
