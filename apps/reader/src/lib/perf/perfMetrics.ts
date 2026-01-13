/**
 * Performance Metrics
 *
 * Tracks decode time, render time, and scroll FPS for debugging.
 * Optionally emits events to the telemetry adapter.
 */

import { getTelemetryAdapter } from "@/lib/analytics/telemetryAdapter";

/** Percentile stats */
export interface PercentileStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/** Performance metrics */
export interface PerfMetricsData {
  /** Decode time stats (ms) */
  decodeTime: PercentileStats;
  /** Render time stats (ms) */
  renderTime: PercentileStats;
  /** Scroll FPS stats */
  scrollFps: PercentileStats;
  /** Last update timestamp */
  lastUpdateMs: number;
}

/** Performance metrics configuration */
export interface PerfMetricsConfig {
  /** Maximum samples to keep (default: 1000) */
  maxSamples: number;
  /** Enable FPS tracking (default: true) */
  enableFpsTracking: boolean;
  /** FPS sample interval in ms (default: 100) */
  fpsSampleIntervalMs: number;
}

const DEFAULT_CONFIG: PerfMetricsConfig = {
  maxSamples: 1000,
  enableFpsTracking: true,
  fpsSampleIntervalMs: 100,
};

/**
 * Performance metrics collector.
 */
export class PerfMetrics {
  private config: PerfMetricsConfig;
  private decodeSamples: number[] = [];
  private renderSamples: number[] = [];
  private fpsSamples: number[] = [];
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<PerfMetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a decode time sample.
   */
  recordDecodeTime(durationMs: number): void {
    this.addSample(this.decodeSamples, durationMs);
    getTelemetryAdapter().observe("perf_decode_ms", durationMs);
  }

  /**
   * Record a render time sample.
   */
  recordRenderTime(durationMs: number): void {
    this.addSample(this.renderSamples, durationMs);
    getTelemetryAdapter().observe("perf_render_ms", durationMs);
  }

  /**
   * Record a frame for FPS calculation.
   */
  recordFrame(): void {
    this.frameCount++;
  }

  /**
   * Start FPS tracking.
   */
  startFpsTracking(): void {
    if (!this.config.enableFpsTracking || this.fpsIntervalId) {
      return;
    }

    this.lastFrameTime = performance.now();
    this.frameCount = 0;

    this.fpsIntervalId = setInterval(() => {
      const now = performance.now();
      const elapsed = now - this.lastFrameTime;

      if (elapsed > 0) {
        const fps = (this.frameCount / elapsed) * 1000;
        this.addSample(this.fpsSamples, fps);
        getTelemetryAdapter().observe("perf_fps", fps);
      }

      this.lastFrameTime = now;
      this.frameCount = 0;
    }, this.config.fpsSampleIntervalMs);
  }

  /**
   * Stop FPS tracking.
   */
  stopFpsTracking(): void {
    if (this.fpsIntervalId) {
      clearInterval(this.fpsIntervalId);
      this.fpsIntervalId = null;
    }
  }

  /**
   * Get current metrics.
   */
  getMetrics(): PerfMetricsData {
    return {
      decodeTime: this.calculateStats(this.decodeSamples),
      renderTime: this.calculateStats(this.renderSamples),
      scrollFps: this.calculateStats(this.fpsSamples),
      lastUpdateMs: Date.now(),
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.decodeSamples = [];
    this.renderSamples = [];
    this.fpsSamples = [];
    this.frameCount = 0;
  }

  /**
   * Measure a function's execution time.
   */
  measure<T>(type: "decode" | "render", fn: () => T): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    if (type === "decode") {
      this.recordDecodeTime(duration);
    } else {
      this.recordRenderTime(duration);
    }

    return result;
  }

  /**
   * Measure an async function's execution time.
   */
  async measureAsync<T>(type: "decode" | "render", fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (type === "decode") {
      this.recordDecodeTime(duration);
    } else {
      this.recordRenderTime(duration);
    }

    return result;
  }

  /**
   * Add a sample to a collection.
   */
  private addSample(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > this.config.maxSamples) {
      samples.shift();
    }
  }

  /**
   * Calculate percentile stats for samples.
   */
  private calculateStats(samples: number[]): PercentileStats {
    if (samples.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        avg: 0,
        count: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      count: sorted.length,
    };
  }

  /**
   * Calculate percentile value.
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
}

/** Global performance metrics instance */
let globalMetrics: PerfMetrics | null = null;

/**
 * Get or create global performance metrics.
 */
export function getPerfMetrics(config?: Partial<PerfMetricsConfig>): PerfMetrics {
  if (!globalMetrics) {
    globalMetrics = new PerfMetrics(config);
  }
  return globalMetrics;
}

/**
 * Reset global performance metrics.
 */
export function resetPerfMetrics(): void {
  globalMetrics?.reset();
}
