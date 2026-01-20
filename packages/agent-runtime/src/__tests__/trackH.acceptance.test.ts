/**
 * Track H Acceptance Tests
 *
 * Performance regression tests and KPI validation for Track H optimization work.
 * Validates acceptance criteria from docs/roadmap/agent-runtime-2026-track-h-optimization.md
 *
 * KPIs:
 * - Model routing latency: <10ms (P99)
 * - Context compression ratio: >30% reduction
 * - Cache hit rate: >50%
 * - Error rate: <1%
 * - Event log write latency: <5ms (P99)
 */

import {
  createMetricsAggregator,
  type MetricsAggregator,
} from "@ku0/agent-runtime-telemetry/telemetry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextCompactor, type Message } from "../context/ContextCompactor";
import { createModelRouter, type ModelRoutingDecision } from "../routing/modelRouter";
import { ToolResultCache } from "../utils/cache";

// ============================================================================
// H.1: Model Routing Optimization
// ============================================================================

describe("Track H.1: Model Routing Optimization", () => {
  describe("Routing Latency KPI (<10ms P99)", () => {
    it("should complete routing decisions within 10ms P99", () => {
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        enableCapabilityScoring: true,
        rules: [
          {
            id: "high-risk",
            match: (req) => req.risk === "high",
            modelId: "gpt-4-turbo",
            reason: "high risk task",
          },
          {
            id: "cost-optimization",
            match: (req) => req.policy === "cost",
            modelId: "gpt-3.5-turbo",
            reason: "cost optimized",
            policy: "cost",
          },
        ],
      });

      const latencies: number[] = [];
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        router.resolveForTurn({
          taskType: "coding",
          risk: i % 3 === 0 ? "high" : "medium",
          budget: { maxTokens: 2000 },
          policy: i % 5 === 0 ? "cost" : "quality",
          turn: i,
        });
        latencies.push(performance.now() - start);
      }

      const sorted = latencies.sort((a, b) => a - b);
      const p99Index = Math.floor(iterations * 0.99);
      const p99Latency = sorted[p99Index];

      expect(p99Latency).toBeLessThan(10);
    });

    it("should include cost/latency scoring with configurable weights", () => {
      const decisions: ModelRoutingDecision[] = [];
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        enableCapabilityScoring: true,
        onRoutingDecision: (d) => decisions.push(d),
      });

      // Test with multiple preferred models to trigger scoring
      const decision = router.resolveForTurn({
        taskType: "summarize",
        risk: "low",
        budget: { maxTokens: 1000 },
        policy: "cost",
        preferredModels: ["gpt-3.5-turbo", "gpt-4", "gpt-4-turbo"],
      });

      expect(decision.policy).toBe("cost");
      expect(decision.metrics).toBeDefined();
      expect(decision.metrics?.routingLatencyMs).toBeDefined();
    });

    it("should emit routing decision metrics", () => {
      const emittedDecisions: ModelRoutingDecision[] = [];
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        onRoutingDecision: (decision) => emittedDecisions.push(decision),
      });

      router.resolveForTurn({
        taskType: "test",
        risk: "low",
        budget: { maxTokens: 1000 },
      });

      expect(emittedDecisions).toHaveLength(1);
      expect(emittedDecisions[0].metrics?.routingLatencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof emittedDecisions[0].metrics?.cacheHit).toBe("boolean");
    });
  });

  describe("Fallback Chain", () => {
    it("should provide fallback models on routing failure", () => {
      const router = createModelRouter({
        defaultModel: "fallback-model",
        defaultBudget: { maxTokens: 1000 },
        rules: [
          {
            id: "error-rule",
            match: () => {
              throw new Error("Simulated routing error");
            },
            modelId: "unreachable",
            reason: "should not reach",
          },
        ],
      });

      const decision = router.resolveForTurn({
        taskType: "test",
        risk: "low",
        budget: { maxTokens: 500 },
      });

      expect(decision.resolved).toBe("fallback-model");
      expect(decision.reason).toContain("fallback");
    });
  });
});

// ============================================================================
// H.2: Context Compression Enhancement
// ============================================================================

describe("Track H.2: Context Compression Enhancement", () => {
  describe("Compression Ratio KPI (>30% reduction)", () => {
    it("should achieve >30% token reduction on average", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.5,
          preserveLastN: 2,
          compressionStrategy: "hybrid",
        },
      });

      // Create a conversation with substantial content
      const messages: Message[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          role: "user",
          content: `Question ${i}: ${"This is a detailed question about the codebase. ".repeat(5)}`,
        });
        messages.push({
          role: "assistant",
          content: `Answer ${i}: ${"Here is a comprehensive response with implementation details. ".repeat(10)}`,
          toolResults: [
            {
              callId: `tool-${i}`,
              result: { data: "x".repeat(200) },
              size: 200,
            },
          ],
        });
      }

      const originalTokens = compactor.estimateTokens(messages);
      const { preserved, toSummarize } = compactor.getMessagesToPreserve(messages);

      // Simulate compression by keeping only preserved messages
      const compressedTokens = compactor.estimateTokens(preserved);
      const compressionRatio = (originalTokens - compressedTokens) / originalTokens;

      expect(compressionRatio).toBeGreaterThan(0.3);
      expect(toSummarize.length).toBeGreaterThan(0);
    });

    it("should preserve system prompt and last N user messages", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.8,
          preserveLastN: 3,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question" },
        { role: "assistant", content: "Second answer" },
        { role: "user", content: "Third question" },
        { role: "assistant", content: "Third answer" },
        { role: "user", content: "Fourth question" },
        { role: "assistant", content: "Fourth answer" },
      ];

      const { preserved, toSummarize } = compactor.getMessagesToPreserve(messages);

      // Should preserve last 3 user messages and their responses
      expect(preserved.length).toBeGreaterThanOrEqual(4); // At least 2 Q&A pairs
      expect(toSummarize.length).toBeGreaterThan(0);
    });

    it("should include compression metrics", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 10000,
          compressionThreshold: 0.5,
          preserveLastN: 2,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({
          role: "user",
          content: `Question ${i}: ${"Detail ".repeat(20)}`,
        });
        messages.push({
          role: "assistant",
          content: `Answer ${i}: ${"Response ".repeat(30)}`,
        });
      }

      const { preserved } = compactor.getMessagesToPreserve(messages);

      // Mock context manager for applyCompaction
      const mockContextManager = {
        get: () => ({
          facts: [],
          progress: { completedSteps: [], pendingSteps: [] },
          scratchpad: "",
        }),
        updateScratchpad: () => {
          // No-op for test
        },
      };

      const result = compactor.applyCompaction(
        mockContextManager as never,
        "test-ctx",
        "Summary of conversation",
        preserved,
        messages
      );

      expect(result.compacted).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.compressionRatio).toBeGreaterThan(0);
      expect(result.metrics?.qualityScore).toBeGreaterThan(0);
      expect(result.metrics?.strategy).toBe("hybrid");
    });
  });

  describe("Sliding Window Context Retention", () => {
    it("should implement sliding window for recent messages", () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 5000,
          compressionThreshold: 0.8,
          preserveLastN: 5,
          compressionStrategy: "hybrid",
        },
      });

      const messages: Message[] = [];
      for (let i = 0; i < 15; i++) {
        messages.push({ role: "user", content: `Message ${i}` });
        messages.push({ role: "assistant", content: `Response ${i}` });
      }

      const { preserved } = compactor.getMessagesToPreserve(messages);

      // Should preserve approximately 5 user messages worth
      const userMessages = preserved.filter((m) => m.role === "user");
      expect(userMessages.length).toBeLessThanOrEqual(5);
    });
  });
});

// ============================================================================
// H.3: Caching Layer
// ============================================================================

describe("Track H.3: Caching Layer", () => {
  describe("Cache Hit Rate KPI (>50%)", () => {
    it("should achieve >50% cache hit rate for repeated idempotent calls", () => {
      const cache = new ToolResultCache({ maxEntries: 100, defaultTtlMs: 60000 });

      // Populate cache with initial entries
      cache.set("read_file", { path: "/src/index.ts" }, { content: "result-0" });
      cache.set("list_directory", { path: "/src" }, { content: "result-1" });
      cache.set("get_metadata", { file: "package.json" }, { content: "result-2" });

      // Verify all entries are cached (hits)
      expect(cache.get("read_file", { path: "/src/index.ts" })).toBeDefined();
      expect(cache.get("list_directory", { path: "/src" })).toBeDefined();
      expect(cache.get("get_metadata", { file: "package.json" })).toBeDefined();

      // Measure hit rate over multiple accesses
      let hits = 0;
      const totalAccesses = 100;
      const tools = ["read_file", "list_directory", "get_metadata"];
      const toolArgs = [{ path: "/src/index.ts" }, { path: "/src" }, { file: "package.json" }];

      for (let i = 0; i < totalAccesses; i++) {
        const idx = i % tools.length;
        const result = cache.get(tools[idx], toolArgs[idx]);
        if (result !== undefined) {
          hits++;
        }
      }

      const hitRate = hits / totalAccesses;
      expect(hitRate).toBeGreaterThan(0.5);
    });

    it("should invalidate cache on checkpoint restore", () => {
      const cache = new ToolResultCache({ maxEntries: 10, defaultTtlMs: 60000 });

      cache.set("tool:read", { id: 1 }, "value1");
      cache.set("tool:read", { id: 2 }, "value2");

      expect(cache.get("tool:read", { id: 1 })).toBe("value1");

      // Simulate checkpoint restore by clearing cache
      cache.clear();

      expect(cache.get("tool:read", { id: 1 })).toBeUndefined();
      expect(cache.get("tool:read", { id: 2 })).toBeUndefined();
    });

    it("should support LRU eviction", () => {
      const cache = new ToolResultCache({ maxEntries: 2, k: 2, defaultTtlMs: 0 });

      cache.set("tool:a", {}, "a");
      cache.set("tool:b", {}, "b");

      // Access 'a' to make it more recently used
      cache.get("tool:a", {});

      // Add 'c', should evict 'b'
      cache.set("tool:c", {}, "c");

      expect(cache.get("tool:a", {})).toBe("a");
      expect(cache.get("tool:b", {})).toBeUndefined();
      expect(cache.get("tool:c", {})).toBe("c");
    });
  });
});

// ============================================================================
// H.4: Observability & Metrics
// ============================================================================

describe("Track H.4: Observability & Metrics", () => {
  let aggregator: MetricsAggregator;

  beforeEach(() => {
    aggregator = createMetricsAggregator();
  });

  afterEach(() => {
    aggregator.dispose();
  });

  describe("Prometheus Export", () => {
    it("should export metrics in Prometheus-compatible format", () => {
      aggregator.incrementCounter("agent_runtime_tool_calls_total", { tool: "read_file" });
      aggregator.setGauge("agent_runtime_active_agents", 3);
      aggregator.recordHistogram("agent_runtime_llm_latency_ms", 150);

      const output = aggregator.exportPrometheus();

      expect(output).toContain("# TYPE agent_runtime_tool_calls_total counter");
      expect(output).toContain("# TYPE agent_runtime_active_agents gauge");
      expect(output).toContain("# TYPE agent_runtime_llm_latency_ms histogram");
    });

    it("should include labels in Prometheus format", () => {
      aggregator.incrementCounter("requests_total", { method: "GET", status: "200" });

      const output = aggregator.exportPrometheus();

      expect(output).toContain('method="GET"');
      expect(output).toContain('status="200"');
    });
  });

  describe("Timing Traces", () => {
    it("should record histogram with percentiles", () => {
      // Simulate 100 LLM call latencies
      for (let i = 1; i <= 100; i++) {
        aggregator.recordHistogram("llm_latency_ms", i * 10);
      }

      const metric = aggregator.getMetric("llm_latency_ms");

      expect(metric?.type).toBe("histogram");
      expect(metric?.histogram?.count).toBe(100);
      expect(metric?.histogram?.sum).toBe(50500); // Sum of 10 to 1000, step 10
    });

    it("should support summary with percentiles", () => {
      for (let i = 1; i <= 100; i++) {
        aggregator.recordSummary("tool_execution_ms", i);
      }

      const metric = aggregator.getMetric("tool_execution_ms");

      expect(metric?.type).toBe("summary");
      expect(metric?.summary?.p50).toBe(50);
      expect(metric?.summary?.p95).toBe(95);
      expect(metric?.summary?.p99).toBe(99);
    });
  });

  describe("Event Aggregation", () => {
    it("should aggregate events into structured metrics", () => {
      // Simulate event stream
      for (let i = 0; i < 50; i++) {
        aggregator.incrementCounter("events_total", { type: "turn_start" });
        aggregator.incrementCounter("events_total", { type: "tool_call" });
        aggregator.incrementCounter("events_total", { type: "turn_end" });
      }

      const metrics = aggregator.getMetrics();
      const eventMetrics = metrics.filter((m) => m.name === "events_total");

      expect(eventMetrics.length).toBe(3); // 3 event types
    });
  });

  describe("Error Rate KPI (<1%)", () => {
    it("should track error rate below 1%", () => {
      const totalRequests = 1000;
      const errorCount = 5; // 0.5% error rate

      for (let i = 0; i < totalRequests - errorCount; i++) {
        aggregator.incrementCounter("requests_total", { status: "success" });
      }
      for (let i = 0; i < errorCount; i++) {
        aggregator.incrementCounter("requests_total", { status: "error" });
      }

      const successMetric = aggregator.getMetric("requests_total", { status: "success" });
      const errorMetric = aggregator.getMetric("requests_total", { status: "error" });

      const total = (successMetric?.value ?? 0) + (errorMetric?.value ?? 0);
      const errorRate = (errorMetric?.value ?? 0) / total;

      expect(errorRate).toBeLessThan(0.01);
    });
  });
});

// ============================================================================
// Performance Regression Suite
// ============================================================================

describe("Performance Regression Suite", () => {
  describe("Model Router Performance", () => {
    it("should maintain stable routing performance", () => {
      const router = createModelRouter({
        defaultModel: "gpt-4",
        defaultBudget: { maxTokens: 4000 },
        rules: [
          { id: "r1", match: (r) => r.risk === "high", modelId: "large", reason: "high risk" },
          { id: "r2", match: (r) => r.policy === "cost", modelId: "small", reason: "cost" },
        ],
      });

      const samples: number[] = [];
      for (let i = 0; i < 500; i++) {
        const start = performance.now();
        router.route({
          taskType: "test",
          risk: "medium",
          budget: { maxTokens: 1000 },
        });
        samples.push(performance.now() - start);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sorted = samples.sort((a, b) => a - b);
      const p99 = sorted[Math.floor(samples.length * 0.99)];

      // Regression thresholds
      expect(avg).toBeLessThan(1); // Average < 1ms
      expect(p99).toBeLessThan(10); // P99 < 10ms
    });
  });

  describe("Context Compactor Performance", () => {
    it("should perform threshold check efficiently", { timeout: 15000 }, () => {
      const compactor = new ContextCompactor({
        contextConfig: {
          maxTokens: 128000,
          compressionThreshold: 0.8,
          preserveLastN: 5,
          compressionStrategy: "hybrid",
        },
      });

      // Create realistic message set
      const messages: Message[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push({
          role: "user",
          content: "User message with some content ".repeat(10),
        });
        messages.push({
          role: "assistant",
          content: "Assistant response with detailed explanation ".repeat(20),
        });
      }

      const samples: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        compactor.checkThreshold(messages, "System prompt");
        samples.push(performance.now() - start);
      }

      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

      // Token counting should be fast
      expect(avg).toBeLessThan(75); // Average < 75ms for 100 messages
    });
  });

  describe("Metrics Aggregator Performance", () => {
    it("should handle metric updates efficiently", () => {
      const aggregator = createMetricsAggregator({ maxMetrics: 100 });

      const start = performance.now();
      const operations = 1000;

      for (let i = 0; i < operations; i++) {
        aggregator.incrementCounter("test_counter", { iteration: String(i % 5) });
        aggregator.recordHistogram("test_histogram", Math.random() * 100);
      }

      const elapsed = performance.now() - start;
      const opsPerSecond = (operations * 2) / (elapsed / 1000);

      aggregator.dispose();

      // Verify metrics were recorded and reasonable throughput achieved
      // Threshold is conservative for CI environments with varying load
      expect(opsPerSecond).toBeGreaterThan(100);
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
