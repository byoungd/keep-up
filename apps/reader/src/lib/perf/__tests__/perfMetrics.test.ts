/**
 * Performance Metrics Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PerfMetrics, getPerfMetrics, resetPerfMetrics } from "../perfMetrics";

describe("PerfMetrics", () => {
  let metrics: PerfMetrics;

  beforeEach(() => {
    metrics = new PerfMetrics({
      maxSamples: 100,
      enableFpsTracking: false,
    });
  });

  afterEach(() => {
    metrics.stopFpsTracking();
    metrics.reset();
  });

  describe("decode time tracking", () => {
    it("should record decode time samples", () => {
      metrics.recordDecodeTime(10);
      metrics.recordDecodeTime(20);
      metrics.recordDecodeTime(30);

      const data = metrics.getMetrics();
      expect(data.decodeTime.count).toBe(3);
      expect(data.decodeTime.avg).toBe(20);
    });

    it("should calculate percentiles", () => {
      for (let i = 1; i <= 100; i++) {
        metrics.recordDecodeTime(i);
      }

      const data = metrics.getMetrics();
      expect(data.decodeTime.p50).toBe(50);
      expect(data.decodeTime.p95).toBe(95);
      expect(data.decodeTime.p99).toBe(99);
      expect(data.decodeTime.min).toBe(1);
      expect(data.decodeTime.max).toBe(100);
    });
  });

  describe("render time tracking", () => {
    it("should record render time samples", () => {
      metrics.recordRenderTime(5);
      metrics.recordRenderTime(15);

      const data = metrics.getMetrics();
      expect(data.renderTime.count).toBe(2);
      expect(data.renderTime.avg).toBe(10);
    });
  });

  describe("measure helper", () => {
    it("should measure sync function", () => {
      const result = metrics.measure("decode", () => {
        // Simulate work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(499500);
      const data = metrics.getMetrics();
      expect(data.decodeTime.count).toBe(1);
    });

    it("should measure async function", async () => {
      const result = await metrics.measureAsync("render", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "done";
      });

      expect(result).toBe("done");
      const data = metrics.getMetrics();
      expect(data.renderTime.count).toBe(1);
      expect(data.renderTime.avg).toBeGreaterThanOrEqual(10);
    });
  });

  describe("sample limits", () => {
    it("should limit samples to maxSamples", () => {
      const limitedMetrics = new PerfMetrics({ maxSamples: 10 });

      for (let i = 0; i < 20; i++) {
        limitedMetrics.recordDecodeTime(i);
      }

      const data = limitedMetrics.getMetrics();
      expect(data.decodeTime.count).toBe(10);
      // Should have kept the last 10 samples (10-19)
      expect(data.decodeTime.min).toBe(10);
    });
  });

  describe("reset", () => {
    it("should reset all samples", () => {
      metrics.recordDecodeTime(10);
      metrics.recordRenderTime(20);

      metrics.reset();

      const data = metrics.getMetrics();
      expect(data.decodeTime.count).toBe(0);
      expect(data.renderTime.count).toBe(0);
    });
  });

  describe("empty stats", () => {
    it("should return zeros for empty samples", () => {
      const data = metrics.getMetrics();
      expect(data.decodeTime.count).toBe(0);
      expect(data.decodeTime.avg).toBe(0);
      expect(data.decodeTime.p50).toBe(0);
    });
  });
});

describe("global metrics", () => {
  afterEach(() => {
    resetPerfMetrics();
  });

  it("should return same instance", () => {
    const m1 = getPerfMetrics();
    const m2 = getPerfMetrics();
    expect(m1).toBe(m2);
  });

  it("should reset global metrics", () => {
    const m = getPerfMetrics();
    m.recordDecodeTime(10);

    resetPerfMetrics();

    const data = m.getMetrics();
    expect(data.decodeTime.count).toBe(0);
  });
});
