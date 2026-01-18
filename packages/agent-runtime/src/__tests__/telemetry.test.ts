/**
 * Telemetry Module Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_METRICS,
  createTelemetryContext,
  InMemoryMetricsCollector,
  InMemoryTracer,
  measureAsync,
  traced,
} from "../telemetry";

// ============================================================================
// Metrics Collector Tests
// ============================================================================

describe("InMemoryMetricsCollector", () => {
  let collector: InMemoryMetricsCollector;

  beforeEach(() => {
    collector = new InMemoryMetricsCollector();
  });

  it("should increment counters", () => {
    collector.increment("test_counter", { label: "a" });
    collector.increment("test_counter", { label: "a" });
    collector.increment("test_counter", { label: "b" });

    const metrics = collector.getMetrics();
    const counterA = metrics.find((m) => m.name.includes('label="a"'));
    const counterB = metrics.find((m) => m.name.includes('label="b"'));

    expect(counterA?.value).toBe(2);
    expect(counterB?.value).toBe(1);
  });

  it("should set gauge values", () => {
    collector.gauge("active_agents", 5);
    collector.gauge("active_agents", 3);

    const metrics = collector.getMetrics();
    const gauge = metrics.find((m) => m.name === "active_agents");

    expect(gauge?.value).toBe(3);
  });

  it("should record histogram observations", () => {
    collector.observe("latency", 100);
    collector.observe("latency", 200);
    collector.observe("latency", 300);

    const metrics = collector.getMetrics();
    const avgMetric = metrics.find((m) => m.name === "latency_avg");
    const countMetric = metrics.find((m) => m.name === "latency_count");
    const sumMetric = metrics.find((m) => m.name === "latency_sum");

    expect(avgMetric?.value).toBe(200);
    expect(countMetric?.value).toBe(3);
    expect(sumMetric?.value).toBe(600);
  });

  it("should export to Prometheus format", () => {
    collector.increment("requests_total", { method: "GET" });
    collector.gauge("connections", 10);

    const output = collector.toPrometheus();

    expect(output).toContain("requests_total");
    expect(output).toContain("connections 10");
  });

  it("should reset all metrics", () => {
    collector.increment("counter");
    collector.gauge("gauge", 5);
    collector.observe("histogram", 100);

    collector.reset();

    expect(collector.getMetrics()).toHaveLength(0);
  });
});

// ============================================================================
// Tracer Tests
// ============================================================================

describe("InMemoryTracer", () => {
  let tracer: InMemoryTracer;

  beforeEach(() => {
    tracer = new InMemoryTracer();
  });

  it("should create and end spans", () => {
    const span = tracer.startSpan("test-operation");

    span.setAttribute("key", "value");
    span.addEvent("checkpoint");
    span.setStatus("ok");
    span.end();

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("test-operation");
    expect(spans[0].status).toBe("ok");
    expect(spans[0].attributes.key).toBe("value");
    expect(spans[0].events).toHaveLength(1);
  });

  it("should link parent and child spans", () => {
    const parent = tracer.startSpan("parent");
    const child = tracer.startSpan("child", { parentSpan: parent });

    child.end();
    parent.end();

    const spans = tracer.getSpans();
    const childSpan = spans.find((s) => s.name === "child");

    expect(childSpan?.parentSpanId).toBe(parent.spanId);
    expect(childSpan?.traceId).toBe(parent.traceId);
  });

  it("should run function within span via withSpan", async () => {
    const result = await tracer.withSpan("async-op", async (span) => {
      span.setAttribute("step", 1);
      await new Promise((r) => setTimeout(r, 10));
      return "done";
    });

    expect(result).toBe("done");

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe("ok");
  });

  it("should record error status on exception", async () => {
    await expect(
      tracer.withSpan("failing-op", async () => {
        throw new Error("test error");
      })
    ).rejects.toThrow("test error");

    const spans = tracer.getSpans();
    expect(spans[0].status).toBe("error");
    expect(spans[0].attributes["status.message"]).toBe("test error");
  });

  it("should limit stored spans", () => {
    const smallTracer = new InMemoryTracer(3);

    for (let i = 0; i < 5; i++) {
      const span = smallTracer.startSpan(`span-${i}`);
      span.end();
    }

    const spans = smallTracer.getSpans();
    expect(spans).toHaveLength(3);
    expect(spans[0].name).toBe("span-2");
  });

  it("should filter spans by trace ID", () => {
    const span1 = tracer.startSpan("op-1");
    const span2 = tracer.startSpan("op-2", { parentSpan: span1 });
    const span3 = tracer.startSpan("op-3"); // Different trace

    span2.end();
    span1.end();
    span3.end();

    const traceSpans = tracer.getSpansByTrace(span1.traceId);
    expect(traceSpans).toHaveLength(2);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("measureAsync", () => {
  it("should measure async function duration", async () => {
    const collector = new InMemoryMetricsCollector();

    const result = await measureAsync(collector, "operation_duration", { op: "test" }, async () => {
      await new Promise((r) => setTimeout(r, 60));
      return 42;
    });

    expect(result).toBe(42);

    const metrics = collector.getMetrics();
    const durationMetric = metrics.find((m) => m.name.includes("operation_duration"));
    expect(durationMetric).toBeDefined();
    expect(durationMetric?.value).toBeGreaterThanOrEqual(50);
  });
});

describe("traced", () => {
  it("should wrap function with tracing", async () => {
    const tracer = new InMemoryTracer();

    const add = traced(tracer, "add", (a: number, b: number) => a + b);
    const result = await add(2, 3);

    expect(result).toBe(5);

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("add");
  });
});

// ============================================================================
// Telemetry Context Tests
// ============================================================================

describe("createTelemetryContext", () => {
  it("should create context with metrics and tracer", () => {
    const context = createTelemetryContext();

    expect(context.metrics).toBeInstanceOf(InMemoryMetricsCollector);
    expect(context.tracer).toBeInstanceOf(InMemoryTracer);
  });
});

// ============================================================================
// Predefined Metrics Tests
// ============================================================================

describe("AGENT_METRICS", () => {
  it("should have all required metric definitions", () => {
    expect(AGENT_METRICS.toolCallsTotal.name).toBe("agent_tool_calls_total");
    expect(AGENT_METRICS.toolCallsTotal.type).toBe("counter");

    expect(AGENT_METRICS.turnsTotal.name).toBe("agent_turns_total");
    expect(AGENT_METRICS.llmRequestsTotal.name).toBe("agent_llm_requests_total");
    expect(AGENT_METRICS.activeAgents.type).toBe("gauge");

    expect(AGENT_METRICS.coworkPolicyEvaluations.name).toBe("cowork_policy_evaluations_total");
    expect(AGENT_METRICS.coworkPolicyDenials.name).toBe("cowork_policy_denials_total");
    expect(AGENT_METRICS.coworkPolicyLatency.type).toBe("histogram");
  });
});
