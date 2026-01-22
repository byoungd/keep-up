import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createModelCapabilityCache,
  type ModelCapabilityCache,
} from "../routing/modelCapabilityCache";

describe("ModelCapabilityCache", () => {
  let cache: ModelCapabilityCache;

  beforeEach(() => {
    cache = createModelCapabilityCache();
  });

  afterEach(() => {
    cache.dispose();
  });

  describe("preloaded defaults", () => {
    it("should have preloaded default models", () => {
      expect(cache.get("gpt-4o")).toBeDefined();
      expect(cache.get("gpt-4o-mini")).toBeDefined();
      expect(cache.get("claude-3-5-sonnet-20241022")).toBeDefined();
      expect(cache.get("gemini-2.0-flash")).toBeDefined();
    });

    it("should return undefined for unknown models", () => {
      expect(cache.get("unknown-model")).toBeUndefined();
    });
  });

  describe("capability scoring", () => {
    it("should score models by cost policy", () => {
      const score = cache.score("gpt-4o-mini", "cost");
      expect(score).toBeDefined();
      expect(score?.costScore).toBeLessThan(1);
      expect(score?.fromCache).toBe(true);
    });

    it("should score models by latency policy", () => {
      const score = cache.score("gemini-2.0-flash", "latency");
      expect(score).toBeDefined();
      expect(score?.latencyScore).toBeLessThan(1);
    });

    it("should score models by quality policy", () => {
      const score = cache.score("gpt-4o", "quality");
      expect(score).toBeDefined();
      // High quality model should have low quality score (inverted)
      expect(score?.qualityScore).toBeLessThan(0.2);
    });

    it("should return undefined for unknown models", () => {
      const score = cache.score("unknown-model", "quality");
      expect(score).toBeUndefined();
    });
  });

  describe("ranking", () => {
    it("should rank models by cost policy", () => {
      const models = ["gpt-4o", "gpt-4o-mini", "gemini-2.0-flash"];
      const ranked = cache.rank(models, "cost");

      expect(ranked.length).toBe(3);
      // gemini-2.0-flash should be cheapest
      expect(ranked[0].modelId).toBe("gemini-2.0-flash");
    });

    it("should rank models by latency policy", () => {
      const models = ["gpt-4o", "claude-3-5-haiku-20241022", "gemini-2.0-flash"];
      const ranked = cache.rank(models, "latency");

      expect(ranked.length).toBe(3);
      // Gemini has lowest latency in defaults (350ms vs 300ms for Haiku)
      // But latency policy weights: latency 0.7, cost 0.1, quality 0.2
      // Gemini wins due to lower cost and competitive latency
      expect(ranked[0].modelId).toBe("gemini-2.0-flash");
    });

    it("should rank models by quality policy", () => {
      const models = ["gpt-4o", "gpt-4o-mini", "gemini-2.0-flash"];
      const ranked = cache.rank(models, "quality");

      expect(ranked.length).toBe(3);
      // gpt-4o should be highest quality
      expect(ranked[0].modelId).toBe("gpt-4o");
    });

    it("should skip unknown models in ranking", () => {
      const models = ["gpt-4o", "unknown-model", "gpt-4o-mini"];
      const ranked = cache.rank(models, "quality");

      expect(ranked.length).toBe(2);
      expect(ranked.find((s) => s.modelId === "unknown-model")).toBeUndefined();
    });
  });

  describe("latency recording", () => {
    it("should update average latency from observations", () => {
      const initialCapability = cache.get("gpt-4o");
      const initialLatency = initialCapability?.avgLatencyMs;

      // Record lower latency observations
      cache.recordLatency({ modelId: "gpt-4o", latencyMs: 100, timestamp: Date.now() });
      cache.recordLatency({ modelId: "gpt-4o", latencyMs: 100, timestamp: Date.now() });
      cache.recordLatency({ modelId: "gpt-4o", latencyMs: 100, timestamp: Date.now() });

      const updatedCapability = cache.get("gpt-4o");
      expect(updatedCapability?.avgLatencyMs).toBeLessThan(initialLatency);
    });
  });

  describe("cache statistics", () => {
    it("should track hits and misses", () => {
      // Initial state
      const initialStats = cache.getStats();
      expect(initialStats.entries).toBeGreaterThan(0);

      // Cache hit
      cache.get("gpt-4o");
      const afterHit = cache.getStats();
      expect(afterHit.hits).toBe(1);

      // Cache miss
      cache.get("unknown-model");
      const afterMiss = cache.getStats();
      expect(afterMiss.misses).toBe(1);

      // Hit rate
      expect(afterMiss.hitRate).toBe(0.5);
    });
  });

  describe("custom capabilities", () => {
    it("should allow setting custom capabilities", () => {
      cache.set({
        modelId: "custom-model",
        contextWindow: 32000,
        costPerInputKToken: 0.001,
        costPerOutputKToken: 0.002,
        avgLatencyMs: 200,
        p95LatencyMs: 500,
        supportsVision: false,
        supportsFunctionCalling: true,
        lastUpdated: Date.now(),
      });

      const capability = cache.get("custom-model");
      expect(capability).toBeDefined();
      expect(capability?.contextWindow).toBe(32000);
    });
  });
});
