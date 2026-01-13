/**
 * Telemetry Adapter Tests
 */

import {
  ConsoleTelemetryAdapter,
  TestTelemetryAdapter,
  getTelemetryAdapter,
  setTelemetryAdapter,
  telemetryMetric,
  telemetryTrack,
} from "@/lib/analytics/telemetryAdapter";
import { beforeEach, describe, expect, it } from "vitest";

// ============================================================================
// Console Adapter Tests
// ============================================================================

describe("ConsoleTelemetryAdapter", () => {
  it("should create with enabled state", () => {
    const adapter = new ConsoleTelemetryAdapter(true);
    expect(adapter).toBeInstanceOf(ConsoleTelemetryAdapter);
  });

  it("should track events when enabled", () => {
    const adapter = new ConsoleTelemetryAdapter(true);
    // Should not throw
    adapter.track({ name: "test_event", data: 123 });
  });

  it("should record metrics when enabled", () => {
    const adapter = new ConsoleTelemetryAdapter(true);
    // Should not throw
    adapter.recordMetric("test_metric", 42, { label: "test" });
  });

  it("should flush without error", async () => {
    const adapter = new ConsoleTelemetryAdapter(true);
    await expect(adapter.flush()).resolves.toBeUndefined();
  });
});

// ============================================================================
// Test Adapter Tests
// ============================================================================

describe("TestTelemetryAdapter", () => {
  let adapter: TestTelemetryAdapter;

  beforeEach(() => {
    adapter = new TestTelemetryAdapter();
  });

  it("should store tracked events", () => {
    adapter.track({ name: "event_1", value: 1 });
    adapter.track({ name: "event_2", value: 2 });

    const events = adapter.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].name).toBe("event_1");
    expect(events[1].name).toBe("event_2");
  });

  it("should store recorded metrics", () => {
    adapter.recordMetric("metric_a", 10, { type: "counter" });
    adapter.recordMetric("metric_b", 20);

    const metrics = adapter.getMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toEqual({ name: "metric_a", value: 10, tags: { type: "counter" } });
    expect(metrics[1]).toEqual({ name: "metric_b", value: 20, tags: undefined });
  });

  it("should increment counters", () => {
    adapter.increment("counter", { source: "test" });
    adapter.increment("counter", { source: "test" });

    const metrics = adapter.getMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0].value).toBe(1);
    expect(metrics[1].value).toBe(1);
  });

  it("should record gauge values", () => {
    adapter.gauge("active_users", 50);

    const metrics = adapter.getMetrics();
    expect(metrics[0].name).toBe("active_users");
    expect(metrics[0].value).toBe(50);
  });

  it("should observe histogram values", () => {
    adapter.observe("latency_ms", 150);

    const metrics = adapter.getMetrics();
    expect(metrics[0].name).toBe("latency_ms");
    expect(metrics[0].value).toBe(150);
  });

  it("should clear events and metrics", () => {
    adapter.track({ name: "event" });
    adapter.recordMetric("metric", 1);

    adapter.clear();

    expect(adapter.getEvents()).toHaveLength(0);
    expect(adapter.getMetrics()).toHaveLength(0);
  });
});

// ============================================================================
// Global Adapter Registry Tests
// ============================================================================

describe("Telemetry Adapter Registry", () => {
  beforeEach(() => {
    // Reset to default adapter
    setTelemetryAdapter(new ConsoleTelemetryAdapter(false));
  });

  it("should return default adapter", () => {
    const adapter = getTelemetryAdapter();
    expect(adapter).toBeDefined();
  });

  it("should set and get custom adapter", () => {
    const testAdapter = new TestTelemetryAdapter();
    setTelemetryAdapter(testAdapter);

    expect(getTelemetryAdapter()).toBe(testAdapter);
  });

  it("should track through global function", () => {
    const testAdapter = new TestTelemetryAdapter();
    setTelemetryAdapter(testAdapter);

    telemetryTrack({ name: "global_event" });

    expect(testAdapter.getEvents()).toHaveLength(1);
    expect(testAdapter.getEvents()[0].name).toBe("global_event");
  });

  it("should record metric through global function", () => {
    const testAdapter = new TestTelemetryAdapter();
    setTelemetryAdapter(testAdapter);

    telemetryMetric("global_metric", 99, { env: "test" });

    expect(testAdapter.getMetrics()).toHaveLength(1);
    expect(testAdapter.getMetrics()[0]).toEqual({
      name: "global_metric",
      value: 99,
      tags: { env: "test" },
    });
  });
});
