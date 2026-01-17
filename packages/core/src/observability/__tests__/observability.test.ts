/**
 * LFCC v0.9 RC - Observability Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { LfccError } from "../../errors.js";
import { getLogger, LFCCLogger } from "../logger.js";
import { getMetrics, initMetricsRegistry, MetricsRegistry } from "../metrics.js";
import { getTracer, LFCCTracer, setDefaultTracer, traceAsync } from "../tracer.js";

describe("LFCCLogger", () => {
  let logger: LFCCLogger;
  let logEntries: unknown[];

  beforeEach(() => {
    logEntries = [];
    logger = new LFCCLogger({
      minLevel: "debug",
      console: false,
      handler: (entry) => logEntries.push(entry),
    });
  });

  it("logs at different levels", () => {
    logger.debug("sync", "Debug message");
    logger.info("sync", "Info message");
    logger.warn("sync", "Warn message");
    logger.error("sync", "Error message");

    expect(logEntries).toHaveLength(4);
    expect((logEntries[0] as { level: string }).level).toBe("debug");
    expect((logEntries[1] as { level: string }).level).toBe("info");
    expect((logEntries[2] as { level: string }).level).toBe("warn");
    expect((logEntries[3] as { level: string }).level).toBe("error");
  });

  it("respects minimum log level", () => {
    const warnLogger = new LFCCLogger({
      minLevel: "warn",
      console: false,
      handler: (entry) => logEntries.push(entry),
    });

    warnLogger.debug("sync", "Debug");
    warnLogger.info("sync", "Info");
    warnLogger.warn("sync", "Warn");
    warnLogger.error("sync", "Error");

    expect(logEntries).toHaveLength(2);
  });

  it("includes correlation context", () => {
    logger.setContext({ docId: "doc-123", clientId: "client-456" });
    logger.info("sync", "Test message");

    const entry = logEntries[0] as { context: { docId: string; clientId: string } };
    expect(entry.context.docId).toBe("doc-123");
    expect(entry.context.clientId).toBe("client-456");
  });

  it("creates child logger with inherited context", () => {
    logger.setContext({ docId: "doc-123" });
    const child = logger.child({ opId: "op-789" });
    child.info("sync", "Child message");

    const entry = logEntries[0] as { context: { docId: string; opId: string } };
    expect(entry.context.docId).toBe("doc-123");
    expect(entry.context.opId).toBe("op-789");
  });

  it("logs verification outcomes", () => {
    logger.logVerification("anno-1", "active", { spanCount: 3 });

    const entry = logEntries[0] as { data: { annotationId: string; outcome: string } };
    expect(entry.data.annotationId).toBe("anno-1");
    expect(entry.data.outcome).toBe("active");
  });

  it("logs fail-closed events", () => {
    logger.logFailClosed("frontier_conflict", { expected: "v1", actual: "v2" }, true);

    const entry = logEntries[0] as { level: string; data: { reason: string } };
    expect(entry.level).toBe("warn");
    expect(entry.data.reason).toBe("frontier_conflict");
  });
});

describe("MetricsRegistry", () => {
  let metrics: MetricsRegistry;

  beforeEach(() => {
    metrics = new MetricsRegistry();
  });

  it("increments counters", () => {
    metrics.incCounter("test_counter");
    metrics.incCounter("test_counter");
    metrics.incCounter("test_counter", {}, 5);

    expect(metrics.getCounter("test_counter")).toBe(7);
  });

  it("tracks counters with labels", () => {
    metrics.incCounter("requests", { status: "success" });
    metrics.incCounter("requests", { status: "failure" });
    metrics.incCounter("requests", { status: "success" });

    expect(metrics.getCounter("requests", { status: "success" })).toBe(2);
    expect(metrics.getCounter("requests", { status: "failure" })).toBe(1);
  });

  it("sets and gets gauges", () => {
    metrics.setGauge("active_connections", 10);
    expect(metrics.getGauge("active_connections")).toBe(10);

    metrics.setGauge("active_connections", 15);
    expect(metrics.getGauge("active_connections")).toBe(15);
  });

  it("observes histogram values", () => {
    metrics.observeHistogram("latency", 10);
    metrics.observeHistogram("latency", 20);
    metrics.observeHistogram("latency", 30);
    metrics.observeHistogram("latency", 100);

    expect(metrics.getHistogramPercentile("latency", 50)).toBe(20);
    expect(metrics.getHistogramPercentile("latency", 95)).toBe(100);
  });

  it("records LFCC-specific metrics", () => {
    metrics.recordUpdateLatency(50, { docId: "doc-1" });
    metrics.recordVerification("active");
    metrics.recordVerification("orphan");
    metrics.recordFailClosed("frontier_conflict");
    metrics.recordConflict(true);

    expect(metrics.getCounter("lfcc_updates_total", { docId: "doc-1" })).toBe(1);
    expect(metrics.getCounter("lfcc_verification_active_total")).toBe(1);
    expect(metrics.getCounter("lfcc_verification_orphan_total")).toBe(1);
    expect(metrics.getCounter("lfcc_fail_closed_total", { reason: "frontier_conflict" })).toBe(1);
    expect(metrics.getCounter("lfcc_conflicts_total")).toBe(1);
    expect(metrics.getCounter("lfcc_conflict_retries_succeeded_total")).toBe(1);
  });

  it("exports to Prometheus format", () => {
    metrics.incCounter("test_counter", { env: "test" });
    metrics.setGauge("test_gauge", 42);

    const output = metrics.toPrometheusText();
    expect(output).toContain("# TYPE test_counter counter");
    expect(output).toContain('test_counter{env="test"} 1');
    expect(output).toContain("# TYPE test_gauge gauge");
    expect(output).toContain("test_gauge 42");
  });

  it("exports to JSON", () => {
    metrics.incCounter("test_counter");
    const json = metrics.toJSON();

    expect(json.counters).toHaveLength(1);
    expect(json.counters[0].name).toBe("test_counter");
  });

  it("resets all metrics", () => {
    metrics.incCounter("test");
    metrics.setGauge("test", 10);
    metrics.reset();

    expect(metrics.getCounter("test")).toBe(0);
    expect(metrics.getGauge("test")).toBe(0);
  });
});

describe("LFCCTracer", () => {
  let tracer: LFCCTracer;

  beforeEach(() => {
    tracer = new LFCCTracer({ maxSpans: 100 });
  });

  it("creates and records spans", () => {
    const span = tracer.startSpan("test.operation");
    span.setAttribute("key", "value");
    span.end();

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe("test.operation");
    expect(spans[0].attributes.key).toBe("value");
    expect(spans[0].endTime).toBeDefined();
  });

  it("creates parent-child span relationships", () => {
    const parent = tracer.startSpan("parent");
    const parentId = parent.getSpanId();
    parent.end();

    const child = tracer.startSpan("child", parentId);
    child.end();

    const spans = tracer.getSpans();
    expect(spans).toHaveLength(2);
    expect(spans[1].parentSpanId).toBe(parentId);
    expect(spans[1].traceId).toBe(spans[0].traceId);
  });

  it("adds events to spans", () => {
    const span = tracer.startSpan("test");
    span.addEvent("checkpoint", { progress: 50 });
    span.addEvent("complete");
    span.end();

    const recorded = tracer.getSpans()[0];
    expect(recorded.events).toHaveLength(2);
    expect(recorded.events[0].name).toBe("checkpoint");
    expect(recorded.events[0].attributes?.progress).toBe(50);
  });

  it("sets span status", () => {
    const span = tracer.startSpan("test");
    span.setStatus("error");
    span.end();

    expect(tracer.getSpans()[0].status).toBe("error");
  });

  it("includes context attributes", () => {
    tracer.setContext({ docId: "doc-123", clientId: "client-456" });
    const span = tracer.startSpan("test");
    span.end();

    const recorded = tracer.getSpans()[0];
    expect(recorded.attributes.doc_id).toBe("doc-123");
    expect(recorded.attributes.client_id).toBe("client-456");
  });

  it("limits stored spans", () => {
    const smallTracer = new LFCCTracer({ maxSpans: 5 });

    for (let i = 0; i < 10; i++) {
      smallTracer.startSpan(`span-${i}`).end();
    }

    expect(smallTracer.getSpans()).toHaveLength(5);
  });

  it("gets spans by trace ID", () => {
    const span1 = tracer.startSpan("span1");
    const traceId = span1.end().traceId;

    tracer.startSpan("span2", span1.getSpanId()).end();
    tracer.startSpan("unrelated").end();

    const trace = tracer.getTrace(traceId);
    expect(trace).toHaveLength(2);
  });

  it("clears all spans", () => {
    tracer.startSpan("test").end();
    tracer.clear();

    expect(tracer.getSpans()).toHaveLength(0);
  });
});

describe("traceAsync", () => {
  beforeEach(() => {
    setDefaultTracer(new LFCCTracer());
  });

  it("traces successful async operations", async () => {
    const result = await traceAsync("async.op", async (span) => {
      span.setAttribute("input", "test");
      return "success";
    });

    expect(result).toBe("success");
    const spans = getTracer().getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe("ok");
  });

  it("traces failed async operations", async () => {
    await expect(
      traceAsync("async.op", async () => {
        throw new Error("Test error");
      })
    ).rejects.toThrow("Test error");

    const spans = getTracer().getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe("error");
    expect(spans[0].events[0].name).toBe("error");
  });
});

describe("Default instances", () => {
  it("provides default logger", () => {
    const logger = getLogger();
    expect(logger).toBeInstanceOf(LFCCLogger);
  });

  it("requires explicit metrics registry init", () => {
    expect(() => getMetrics()).toThrow(LfccError);
    expect(() => getMetrics()).toThrow("Metrics registry not initialized");
  });

  it("provides default metrics registry after init", () => {
    const metrics = initMetricsRegistry();
    expect(metrics).toBeInstanceOf(MetricsRegistry);
    expect(getMetrics()).toBe(metrics);
  });

  it("provides default tracer", () => {
    const tracer = getTracer();
    expect(tracer).toBeInstanceOf(LFCCTracer);
  });
});
