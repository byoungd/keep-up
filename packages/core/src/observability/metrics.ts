/**
 * LFCC v0.9 RC - Metrics Collector
 *
 * Collects and exposes metrics for observability:
 * - Update apply latency (p50/p95)
 * - Verification outcomes counters
 * - Mapping failures / fail-closed events
 * - 409 conflict rate + retry outcomes
 *
 * Compatible with Prometheus/OpenTelemetry export formats.
 */

import { LfccError } from "../errors";
import type { Metric, MetricLabels, VerificationOutcome } from "./types";

// ============================================================================
// Histogram Buckets
// ============================================================================

const LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

// ============================================================================
// Metrics Registry
// ============================================================================

export class MetricsRegistry {
  private counters = new Map<string, Map<string, number>>();
  private gauges = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, number[]>>();
  private histogramSums = new Map<string, Map<string, number>>();

  // --------------------------------------------------------------------------
  // Counter Operations
  // --------------------------------------------------------------------------

  incCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    const key = this.labelsToKey(labels);
    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }
    // biome-ignore lint/style/noNonNullAssertion: metrics logic
    const counter = this.counters.get(name)!;
    counter.set(key, (counter.get(key) ?? 0) + value);
  }

  getCounter(name: string, labels: MetricLabels = {}): number {
    const key = this.labelsToKey(labels);
    return this.counters.get(name)?.get(key) ?? 0;
  }

  // --------------------------------------------------------------------------
  // Gauge Operations
  // --------------------------------------------------------------------------

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.labelsToKey(labels);
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }
    this.gauges.get(name)?.set(key, value);
  }

  getGauge(name: string, labels: MetricLabels = {}): number {
    const key = this.labelsToKey(labels);
    return this.gauges.get(name)?.get(key) ?? 0;
  }

  // --------------------------------------------------------------------------
  // Histogram Operations
  // --------------------------------------------------------------------------

  private histogramCache = new Map<string, Map<string, number[]>>();

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.labelsToKey(labels);
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Map());
      this.histogramCache.set(name, new Map());
      this.histogramSums.set(name, new Map());
    }
    // biome-ignore lint/style/noNonNullAssertion: metrics logic
    const histogram = this.histograms.get(name)!;
    if (!histogram.has(key)) {
      histogram.set(key, []);
    }
    histogram.get(key)?.push(value);
    // biome-ignore lint/style/noNonNullAssertion: metrics logic
    const sums = this.histogramSums.get(name)!;
    sums.set(key, (sums.get(key) ?? 0) + value);

    // Invalidate cache
    this.histogramCache.get(name)?.delete(key);
  }

  getHistogramPercentile(name: string, percentile: number, labels: MetricLabels = {}): number {
    const key = this.labelsToKey(labels);
    const values = this.histograms.get(name)?.get(key);
    if (!values || values.length === 0) {
      return 0;
    }

    const sorted = this.getSortedHistogram(name, key, values);

    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // --------------------------------------------------------------------------
  // LFCC-Specific Metrics
  // --------------------------------------------------------------------------

  /** Record update apply latency */
  recordUpdateLatency(durationMs: number, labels: MetricLabels = {}): void {
    this.observeHistogram("lfcc_update_apply_duration_ms", durationMs, labels);
    this.incCounter("lfcc_updates_total", labels);
  }

  /** Record verification outcome */
  recordVerification(outcome: VerificationOutcome, labels: MetricLabels = {}): void {
    this.incCounter("lfcc_verification_total", {
      ...labels,
      status: outcome === "active" ? "success" : "failure",
    });
    this.incCounter(`lfcc_verification_${outcome}_total`, labels);
  }

  /** Record fail-closed event */
  recordFailClosed(reason: string, labels: MetricLabels = {}): void {
    this.incCounter("lfcc_fail_closed_total", { ...labels, reason });
  }

  /** Record 409 conflict */
  recordConflict(retrySucceeded: boolean, labels: MetricLabels = {}): void {
    this.incCounter("lfcc_conflicts_total", labels);
    if (retrySucceeded) {
      this.incCounter("lfcc_conflict_retries_succeeded_total", labels);
    } else {
      this.incCounter("lfcc_conflict_retries_failed_total", labels);
    }
  }

  /** Record mapping operation */
  recordMapping(success: boolean, durationMs: number, labels: MetricLabels = {}): void {
    this.observeHistogram("lfcc_mapping_duration_ms", durationMs, labels);
    this.incCounter("lfcc_mappings_total", { ...labels, status: success ? "success" : "failure" });
  }

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  /** Export all metrics in Prometheus text format */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: export logic
  toPrometheusText(): string {
    const lines: string[] = [];

    // Counters
    for (const [name, values] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const [labels, value] of values) {
        lines.push(`${name}${labels ? `{${labels}}` : ""} ${value}`);
      }
    }

    // Gauges
    for (const [name, values] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const [labels, value] of values) {
        lines.push(`${name}${labels ? `{${labels}}` : ""} ${value}`);
      }
    }

    // Histograms (simplified - just percentiles)
    for (const [name, values] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      const sums = this.histogramSums.get(name);
      for (const [labels, samples] of values) {
        if (samples.length === 0) {
          continue;
        }
        const sorted = this.getSortedHistogram(name, labels, samples);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const sum = sums?.get(labels) ?? 0;

        const labelStr = labels ? `{${labels}}` : "";
        lines.push(`${name}_p50${labelStr} ${p50}`);
        lines.push(`${name}_p95${labelStr} ${p95}`);
        lines.push(`${name}_p99${labelStr} ${p99}`);
        lines.push(`${name}_sum${labelStr} ${sum}`);
        lines.push(`${name}_count${labelStr} ${samples.length}`);
      }
    }

    return lines.join("\n");
  }

  /** Export metrics as JSON */
  toJSON(): Record<string, Metric[]> {
    const result: Record<string, Metric[]> = { counters: [], gauges: [], histograms: [] };

    for (const [name, values] of this.counters) {
      for (const [labelsStr, value] of values) {
        result.counters.push({
          type: "counter",
          name,
          value,
          labels: this.keyToLabels(labelsStr),
        });
      }
    }

    for (const [name, values] of this.gauges) {
      for (const [labelsStr, value] of values) {
        result.gauges.push({
          type: "gauge",
          name,
          value,
          labels: this.keyToLabels(labelsStr),
        });
      }
    }

    for (const [name, values] of this.histograms) {
      for (const [labelsStr, samples] of values) {
        const sum = this.histogramSums.get(name)?.get(labelsStr) ?? 0;
        result.histograms.push({
          type: "histogram",
          name,
          value: samples.length > 0 ? sum / samples.length : 0,
          buckets: LATENCY_BUCKETS,
          labels: this.keyToLabels(labelsStr),
        });
      }
    }

    return result;
  }

  /** Reset all metrics */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.histogramCache.clear();
    this.histogramSums.clear();
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private labelsToKey(labels: MetricLabels): string {
    const entries = Object.entries(labels).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return "";
    }
    return entries
      .map(([k, v]) => `${k}="${v}"`)
      .sort()
      .join(",");
  }

  private keyToLabels(key: string): MetricLabels {
    if (!key) {
      return {};
    }
    const labels: MetricLabels = {};
    for (const part of key.split(",")) {
      const [k, v] = part.split("=");
      if (k && v) {
        (labels as Record<string, string>)[k] = v.replace(/"/g, "");
      }
    }
    return labels;
  }

  private getSortedHistogram(name: string, key: string, values: number[]): number[] {
    const cache = this.histogramCache.get(name);
    if (!cache) {
      return [...values].sort((a, b) => a - b);
    }

    let sorted = cache.get(key);
    if (!sorted) {
      sorted = [...values].sort((a, b) => a - b);
      cache.set(key, sorted);
    }
    return sorted;
  }
}

// ============================================================================
// Default Registry
// ============================================================================

let defaultRegistry: MetricsRegistry | null = null;

export function getMetrics(): MetricsRegistry {
  if (!defaultRegistry) {
    throw new LfccError(
      "METRICS_REGISTRY_NOT_INITIALIZED",
      "Metrics registry not initialized; call initMetricsRegistry() first."
    );
  }
  return defaultRegistry;
}

export function initMetricsRegistry(registry?: MetricsRegistry): MetricsRegistry {
  defaultRegistry = registry ?? new MetricsRegistry();
  return defaultRegistry;
}

export function hasMetricsRegistry(): boolean {
  return defaultRegistry !== null;
}

export function setDefaultRegistry(registry: MetricsRegistry): void {
  defaultRegistry = registry;
}
