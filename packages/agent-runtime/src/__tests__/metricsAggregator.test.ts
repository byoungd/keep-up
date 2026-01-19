import {
  createMetricsAggregator,
  METRIC_NAMES,
  type MetricsAggregator,
} from "@ku0/agent-runtime-telemetry/telemetry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MetricsAggregator", () => {
  let aggregator: MetricsAggregator;

  beforeEach(() => {
    aggregator = createMetricsAggregator();
  });

  afterEach(() => {
    aggregator.dispose();
  });

  describe("counter", () => {
    it("should increment counter", () => {
      aggregator.incrementCounter("test_counter");
      const metric = aggregator.getMetric("test_counter");

      expect(metric).toBeDefined();
      expect(metric?.type).toBe("counter");
      expect(metric?.value).toBe(1);
    });

    it("should increment counter by delta", () => {
      aggregator.incrementCounter("test_counter", {}, 5);
      aggregator.incrementCounter("test_counter", {}, 3);

      const metric = aggregator.getMetric("test_counter");
      expect(metric?.value).toBe(8);
    });

    it("should handle labels correctly", () => {
      aggregator.incrementCounter("test_counter", { env: "prod" });
      aggregator.incrementCounter("test_counter", { env: "dev" });

      const metrics = aggregator.getMetrics();
      expect(metrics.length).toBe(2);
    });
  });

  describe("gauge", () => {
    it("should set gauge value", () => {
      aggregator.setGauge("test_gauge", 42.5);
      const metric = aggregator.getMetric("test_gauge");

      expect(metric).toBeDefined();
      expect(metric?.type).toBe("gauge");
      expect(metric?.value).toBe(42.5);
    });

    it("should overwrite gauge value", () => {
      aggregator.setGauge("test_gauge", 10);
      aggregator.setGauge("test_gauge", 20);

      const metric = aggregator.getMetric("test_gauge");
      expect(metric?.value).toBe(20);
    });
  });

  describe("histogram", () => {
    it("should record histogram values", () => {
      aggregator.recordHistogram("test_histogram", 50);
      aggregator.recordHistogram("test_histogram", 100);
      aggregator.recordHistogram("test_histogram", 200);

      const metric = aggregator.getMetric("test_histogram");
      expect(metric).toBeDefined();
      expect(metric?.type).toBe("histogram");
      expect(metric?.histogram?.count).toBe(3);
      expect(metric?.histogram?.sum).toBe(350);
    });

    it("should have correct bucket counts", () => {
      aggregator.recordHistogram("test_histogram", 5);
      aggregator.recordHistogram("test_histogram", 50);
      aggregator.recordHistogram("test_histogram", 500);

      const metric = aggregator.getMetric("test_histogram");
      const buckets = metric?.histogram?.buckets ?? [];

      // Check some bucket counts
      const bucket10 = buckets.find((b) => b.le === 10);
      const bucket100 = buckets.find((b) => b.le === 100);

      expect(bucket10?.count).toBe(1); // Only 5 <= 10
      expect(bucket100?.count).toBe(2); // 5 and 50 <= 100
    });
  });

  describe("summary", () => {
    it("should record summary with percentiles", () => {
      // Record 100 values from 1 to 100
      for (let i = 1; i <= 100; i++) {
        aggregator.recordSummary("test_summary", i);
      }

      const metric = aggregator.getMetric("test_summary");
      expect(metric).toBeDefined();
      expect(metric?.type).toBe("summary");
      expect(metric?.summary?.count).toBe(100);
      expect(metric?.summary?.sum).toBe(5050); // Sum of 1 to 100
      expect(metric?.summary?.p50).toBe(50);
      expect(metric?.summary?.p90).toBe(90);
      expect(metric?.summary?.p95).toBe(95);
      expect(metric?.summary?.p99).toBe(99);
    });
  });

  describe("exportPrometheus", () => {
    it("should export counter in Prometheus format", () => {
      aggregator.incrementCounter("my_counter", { env: "test" }, 5);
      const output = aggregator.exportPrometheus();

      expect(output).toContain("# TYPE my_counter counter");
      expect(output).toContain('my_counter{env="test"} 5');
    });

    it("should export gauge in Prometheus format", () => {
      aggregator.setGauge("my_gauge", 42);
      const output = aggregator.exportPrometheus();

      expect(output).toContain("# TYPE my_gauge gauge");
      expect(output).toContain("my_gauge 42");
    });

    it("should export histogram in Prometheus format", () => {
      aggregator.recordHistogram("my_histogram", 50);
      const output = aggregator.exportPrometheus();

      expect(output).toContain("# TYPE my_histogram histogram");
      expect(output).toContain("my_histogram_bucket");
      expect(output).toContain("my_histogram_sum");
      expect(output).toContain("my_histogram_count");
    });
  });

  describe("maxMetrics enforcement", () => {
    it("should evict oldest metrics when limit exceeded", () => {
      const limitedAggregator = createMetricsAggregator({ maxMetrics: 3 });

      // Add 4 metrics with slight delay to ensure different timestamps
      limitedAggregator.incrementCounter("counter1");
      limitedAggregator.incrementCounter("counter2");
      limitedAggregator.incrementCounter("counter3");
      limitedAggregator.incrementCounter("counter4");

      const metrics = limitedAggregator.getMetrics();
      expect(metrics.length).toBe(3);

      // counter1 should have been evicted as oldest
      expect(limitedAggregator.getMetric("counter1")).toBeUndefined();
      expect(limitedAggregator.getMetric("counter4")).toBeDefined();

      limitedAggregator.dispose();
    });
  });

  describe("clear", () => {
    it("should clear all metrics", () => {
      aggregator.incrementCounter("test");
      aggregator.setGauge("gauge", 1);
      aggregator.recordHistogram("hist", 10);

      aggregator.clear();

      expect(aggregator.getMetrics().length).toBe(0);
    });
  });

  describe("METRIC_NAMES", () => {
    it("should have predefined metric names", () => {
      expect(METRIC_NAMES.ROUTING_LATENCY_MS).toBe("agent_runtime_routing_latency_ms");
      expect(METRIC_NAMES.TOOL_CALLS_TOTAL).toBe("agent_runtime_tool_calls_total");
      expect(METRIC_NAMES.LLM_LATENCY_MS).toBe("agent_runtime_llm_latency_ms");
    });
  });

  describe("auto-flush", () => {
    it("should call onFlush callback when enabled", async () => {
      vi.useFakeTimers();
      const onFlush = vi.fn();

      const autoFlushAggregator = createMetricsAggregator({
        flushIntervalMs: 100,
        onFlush,
      });

      autoFlushAggregator.incrementCounter("test");

      vi.advanceTimersByTime(150);
      expect(onFlush).toHaveBeenCalled();

      autoFlushAggregator.dispose();
      vi.useRealTimers();
    });
  });
});
