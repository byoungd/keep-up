/**
 * Model Capability Cache
 *
 * Caches model capabilities (context window, cost, latency) for efficient routing decisions.
 * Implements Track H.1: Model Routing Optimization.
 */

import { LRUCache } from "../utils/cache";

// ============================================================================
// Types
// ============================================================================

/**
 * Model capability information used for routing decisions.
 */
export interface ModelCapability {
  modelId: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Cost per 1K input tokens in USD */
  costPerInputKToken: number;
  /** Cost per 1K output tokens in USD */
  costPerOutputKToken: number;
  /** Average latency in milliseconds (P50) */
  avgLatencyMs: number;
  /** P95 latency in milliseconds */
  p95LatencyMs: number;
  /** Whether the model supports vision */
  supportsVision: boolean;
  /** Whether the model supports function calling */
  supportsFunctionCalling: boolean;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Latency observation for updating capability estimates.
 */
export interface LatencyObservation {
  modelId: string;
  latencyMs: number;
  timestamp: number;
}

/**
 * Cost/latency score for routing decisions.
 */
export interface ModelScore {
  modelId: string;
  /** Combined score (lower is better) */
  score: number;
  /** Cost component of the score */
  costScore: number;
  /** Latency component of the score */
  latencyScore: number;
  /** Quality component (based on model tier) */
  qualityScore: number;
  /** Whether this score came from cache */
  fromCache: boolean;
}

/**
 * Scoring weights for different optimization policies.
 */
export interface ScoringWeights {
  cost: number;
  latency: number;
  quality: number;
}

/**
 * Cache configuration options.
 */
export interface ModelCapabilityCacheOptions {
  /** TTL for cached capabilities in milliseconds (default: 1 hour) */
  ttlMs?: number;
  /** Maximum number of cached models (default: 100) */
  maxEntries?: number;
  /** Number of latency observations to keep for averaging (default: 10) */
  latencyWindowSize?: number;
  /** Scoring weights for different policies */
  weights?: {
    cost?: ScoringWeights;
    latency?: ScoringWeights;
    quality?: ScoringWeights;
  };
}

// ============================================================================
// Default Model Capabilities
// ============================================================================

const DEFAULT_CAPABILITIES: ModelCapability[] = [
  {
    modelId: "gpt-4o",
    contextWindow: 128000,
    costPerInputKToken: 0.005,
    costPerOutputKToken: 0.015,
    avgLatencyMs: 800,
    p95LatencyMs: 2000,
    supportsVision: true,
    supportsFunctionCalling: true,
    lastUpdated: Date.now(),
  },
  {
    modelId: "gpt-4o-mini",
    contextWindow: 128000,
    costPerInputKToken: 0.00015,
    costPerOutputKToken: 0.0006,
    avgLatencyMs: 400,
    p95LatencyMs: 1000,
    supportsVision: true,
    supportsFunctionCalling: true,
    lastUpdated: Date.now(),
  },
  {
    modelId: "claude-3-5-sonnet-20241022",
    contextWindow: 200000,
    costPerInputKToken: 0.003,
    costPerOutputKToken: 0.015,
    avgLatencyMs: 600,
    p95LatencyMs: 1500,
    supportsVision: true,
    supportsFunctionCalling: true,
    lastUpdated: Date.now(),
  },
  {
    modelId: "claude-3-5-haiku-20241022",
    contextWindow: 200000,
    costPerInputKToken: 0.0008,
    costPerOutputKToken: 0.004,
    avgLatencyMs: 300,
    p95LatencyMs: 800,
    supportsVision: true,
    supportsFunctionCalling: true,
    lastUpdated: Date.now(),
  },
  {
    modelId: "gemini-2.0-flash",
    contextWindow: 1000000,
    costPerInputKToken: 0.0001,
    costPerOutputKToken: 0.0004,
    avgLatencyMs: 350,
    p95LatencyMs: 900,
    supportsVision: true,
    supportsFunctionCalling: true,
    lastUpdated: Date.now(),
  },
];

// Default scoring weights by policy
const DEFAULT_WEIGHTS: Record<string, ScoringWeights> = {
  cost: { cost: 0.7, latency: 0.2, quality: 0.1 },
  latency: { cost: 0.1, latency: 0.7, quality: 0.2 },
  quality: { cost: 0.1, latency: 0.2, quality: 0.7 },
};

// Quality tiers (higher = better)
const MODEL_QUALITY_TIERS: Record<string, number> = {
  "gpt-4o": 0.95,
  "claude-3-5-sonnet-20241022": 0.95,
  "gpt-4o-mini": 0.75,
  "claude-3-5-haiku-20241022": 0.7,
  "gemini-2.0-flash": 0.8,
};

// ============================================================================
// Model Capability Cache
// ============================================================================

/**
 * Caches model capabilities with TTL and runtime latency updates.
 */
export class ModelCapabilityCache {
  private readonly cache: LRUCache<ModelCapability>;
  private readonly latencyObservations = new Map<string, number[]>();
  private readonly latencyWindowSize: number;
  private readonly weights: Record<string, ScoringWeights>;

  private hits = 0;
  private misses = 0;

  constructor(options: ModelCapabilityCacheOptions = {}) {
    const ttlMs = options.ttlMs ?? 60 * 60 * 1000; // 1 hour
    const maxEntries = options.maxEntries ?? 100;

    this.cache = new LRUCache<ModelCapability>({
      maxEntries,
      defaultTtlMs: ttlMs,
    });

    this.latencyWindowSize = options.latencyWindowSize ?? 10;
    this.weights = {
      cost: options.weights?.cost ?? DEFAULT_WEIGHTS.cost,
      latency: options.weights?.latency ?? DEFAULT_WEIGHTS.latency,
      quality: options.weights?.quality ?? DEFAULT_WEIGHTS.quality,
    };

    // Preload default capabilities
    this.preloadDefaults();
  }

  /**
   * Preload default model capabilities into cache.
   */
  private preloadDefaults(): void {
    for (const cap of DEFAULT_CAPABILITIES) {
      this.cache.set(cap.modelId, cap);
    }
  }

  /**
   * Get capability for a model.
   */
  get(modelId: string): ModelCapability | undefined {
    const cached = this.cache.get(modelId);
    if (cached) {
      this.hits++;
      return cached;
    }
    this.misses++;
    return undefined;
  }

  /**
   * Set capability for a model.
   */
  set(capability: ModelCapability): void {
    this.cache.set(capability.modelId, {
      ...capability,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Record a latency observation for a model and update the average.
   */
  recordLatency(observation: LatencyObservation): void {
    const { modelId, latencyMs } = observation;

    // Get or create observation window
    let observations = this.latencyObservations.get(modelId);
    if (!observations) {
      observations = [];
      this.latencyObservations.set(modelId, observations);
    }

    // Add observation, maintaining window size
    observations.push(latencyMs);
    if (observations.length > this.latencyWindowSize) {
      observations.shift();
    }

    // Update cached capability with new average
    const capability = this.cache.get(modelId);
    if (capability) {
      const avgLatencyMs = observations.reduce((a, b) => a + b, 0) / observations.length;
      const sorted = [...observations].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95LatencyMs = sorted[p95Index] ?? avgLatencyMs;

      this.cache.set(modelId, {
        ...capability,
        avgLatencyMs,
        p95LatencyMs,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Calculate a score for a model based on the given policy.
   * Lower score = better.
   */
  score(
    modelId: string,
    policy: "cost" | "latency" | "quality" = "quality"
  ): ModelScore | undefined {
    const capability = this.get(modelId);
    if (!capability) {
      return undefined;
    }

    const weights = this.weights[policy];

    // Normalize scores to 0-1 range (lower original value = better = lower score)
    // Cost: normalize by max cost (assume max ~$0.02 per 1K tokens)
    const maxCost = 0.02;
    const avgCost = (capability.costPerInputKToken + capability.costPerOutputKToken) / 2;
    const costScore = avgCost / maxCost;

    // Latency: normalize by max latency (assume max ~3000ms)
    const maxLatency = 3000;
    const latencyScore = capability.avgLatencyMs / maxLatency;

    // Quality: invert (higher quality = lower score for "better")
    const qualityTier = MODEL_QUALITY_TIERS[modelId] ?? 0.5;
    const qualityScore = 1 - qualityTier;

    // Weighted sum
    const score =
      weights.cost * costScore + weights.latency * latencyScore + weights.quality * qualityScore;

    return {
      modelId,
      score,
      costScore,
      latencyScore,
      qualityScore,
      fromCache: true,
    };
  }

  /**
   * Rank multiple models by score for a given policy.
   * Returns models sorted by score (best first).
   */
  rank(modelIds: string[], policy: "cost" | "latency" | "quality" = "quality"): ModelScore[] {
    const scores: ModelScore[] = [];

    for (const modelId of modelIds) {
      const modelScore = this.score(modelId, policy);
      if (modelScore) {
        scores.push(modelScore);
      }
    }

    // Sort by score (lower is better)
    return scores.sort((a, b) => a.score - b.score);
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; hitRate: number; entries: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      entries: this.cache.getStats().entries,
    };
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
    this.latencyObservations.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Dispose the cache.
   */
  dispose(): void {
    this.cache.dispose();
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalCache: ModelCapabilityCache | undefined;

/**
 * Get the global model capability cache instance.
 */
export function getModelCapabilityCache(
  options?: ModelCapabilityCacheOptions
): ModelCapabilityCache {
  if (!globalCache) {
    globalCache = new ModelCapabilityCache(options);
  }
  return globalCache;
}

/**
 * Create a new model capability cache instance.
 */
export function createModelCapabilityCache(
  options?: ModelCapabilityCacheOptions
): ModelCapabilityCache {
  return new ModelCapabilityCache(options);
}

/**
 * Reset the global model capability cache instance.
 * Useful for test isolation.
 */
export function resetGlobalCapabilityCache(): void {
  globalCache?.dispose();
  globalCache = undefined;
}
