/**
 * Model Router
 *
 * Selects models based on task class, risk, budget constraints, and policy.
 * Implements spec 5.7: Model Routing Contract.
 * Enhanced with capability caching and cost/latency scoring (Track H.1).
 */

import {
  getModelCapabilityCache,
  type ModelCapability,
  type ModelCapabilityCache,
  type ModelScore,
} from "./modelCapabilityCache";

export type ModelRiskLevel = "low" | "medium" | "high";

/**
 * Routing policy determines optimization priority.
 */
export type ModelRoutingPolicy = "cost" | "latency" | "quality";

export interface ModelBudget {
  maxTokens: number;
  maxCostUsd?: number;
}

export interface ModelRoutingRequest {
  taskType: string;
  risk: ModelRiskLevel;
  budget: ModelBudget;
  preferredModels?: string[];
  /** Routing policy for this request */
  policy?: ModelRoutingPolicy;
  /** Current SOP phase context for phase-aware routing */
  phaseContext?: string;
  /** Turn number for per-turn tracking */
  turn?: number;
}

/**
 * Model routing decision per spec 5.7.
 */
export interface ModelRoutingDecision {
  requested: string;
  resolved: string;
  reason: string;
  policy: ModelRoutingPolicy;
  /** Routing metrics for observability (Track H.1) */
  metrics?: RoutingMetrics;
}

/**
 * Routing metrics for observability.
 */
export interface RoutingMetrics {
  /** Time taken to make routing decision in ms */
  routingLatencyMs: number;
  /** Whether capability cache was hit */
  cacheHit: boolean;
  /** Model scores considered */
  scores?: ModelScore[];
  /** Capability of selected model */
  capability?: ModelCapability;
}

/**
 * Extended route decision with budget info.
 */
export interface ModelRouteDecision {
  modelId: string;
  reason: string;
  fallbackModels: string[];
  budget: ModelBudget;
  /** Policy used for this decision */
  policy: ModelRoutingPolicy;
  /** Routing metrics (Track H.1) */
  metrics?: RoutingMetrics;
}

export interface ModelRouteRule {
  id: string;
  match(request: ModelRoutingRequest): boolean;
  modelId: string;
  fallbackModels?: string[];
  budgetOverride?: Partial<ModelBudget>;
  reason: string;
  /** Policy this rule optimizes for */
  policy?: ModelRoutingPolicy;
}

/**
 * Callback for emitting routing decisions.
 */
export type RoutingDecisionEmitter = (decision: ModelRoutingDecision) => void;

export interface ModelRouterConfig {
  defaultModel: string;
  defaultBudget: ModelBudget;
  defaultPolicy?: ModelRoutingPolicy;
  rules?: ModelRouteRule[];
  /** Optional callback to emit routing decisions for observability */
  onRoutingDecision?: RoutingDecisionEmitter;
  /** Enable capability-based scoring (Track H.1) */
  enableCapabilityScoring?: boolean;
  /** Optional custom capability cache */
  capabilityCache?: ModelCapabilityCache;
}

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly defaultPolicy: ModelRoutingPolicy;
  private readonly capabilityCache: ModelCapabilityCache;
  private readonly enableScoring: boolean;

  constructor(config: ModelRouterConfig) {
    this.config = config;
    this.defaultPolicy = config.defaultPolicy ?? "quality";
    this.enableScoring = config.enableCapabilityScoring ?? true;
    this.capabilityCache = config.capabilityCache ?? getModelCapabilityCache();
  }

  /**
   * Resolve model for a turn. Per spec 5.7:
   * - Resolve before each LLM call based on phase and policy
   * - Record decision via emitter
   * - Fallback to safe default on failure
   */
  resolveForTurn(request: ModelRoutingRequest): ModelRoutingDecision {
    const startTime = performance.now();
    const requestedModel = request.preferredModels?.[0] ?? this.config.defaultModel;
    const policy = request.policy ?? this.defaultPolicy;
    const defaultWithinBudget =
      this.config.defaultBudget.maxTokens <= (request.budget?.maxTokens ?? Number.MAX_SAFE_INTEGER);

    try {
      const decision = this.route(request);
      const routingLatencyMs = performance.now() - startTime;

      const routingDecision: ModelRoutingDecision = {
        requested: requestedModel,
        resolved: decision.modelId,
        reason: decision.reason,
        policy: decision.policy,
        metrics: {
          routingLatencyMs,
          cacheHit: decision.metrics?.cacheHit ?? false,
          scores: decision.metrics?.scores,
          capability: decision.metrics?.capability,
        },
      };

      // Emit for observability
      this.config.onRoutingDecision?.(routingDecision);

      return routingDecision;
    } catch {
      const routingLatencyMs = performance.now() - startTime;

      // Fallback on routing failure per spec 5.7
      const resolvedModel = defaultWithinBudget ? this.config.defaultModel : requestedModel;
      const fallbackDecision: ModelRoutingDecision = {
        requested: requestedModel,
        resolved: resolvedModel,
        reason: defaultWithinBudget
          ? "fallback to default model after routing failure"
          : "fallback to requested model; default exceeded budget",
        policy,
        metrics: {
          routingLatencyMs,
          cacheHit: false,
        },
      };

      this.config.onRoutingDecision?.(fallbackDecision);

      return fallbackDecision;
    }
  }

  route(request: ModelRoutingRequest): ModelRouteDecision {
    const startTime = performance.now();
    const policy = request.policy ?? this.defaultPolicy;
    const matchedRule = this.config.rules?.find((rule) => rule.match(request));

    if (matchedRule) {
      const capability = this.capabilityCache.get(matchedRule.modelId);
      return {
        modelId: matchedRule.modelId,
        reason: matchedRule.reason,
        fallbackModels: matchedRule.fallbackModels ?? [],
        budget: {
          ...this.config.defaultBudget,
          ...request.budget,
          ...matchedRule.budgetOverride,
        },
        policy: matchedRule.policy ?? policy,
        metrics: {
          routingLatencyMs: performance.now() - startTime,
          cacheHit: !!capability,
          capability,
        },
      };
    }

    // Use capability-based scoring if enabled and preferred models specified
    if (this.enableScoring && request.preferredModels && request.preferredModels.length > 1) {
      const scores = this.capabilityCache.rank(request.preferredModels, policy);

      if (scores.length > 0) {
        const best = scores[0];
        const capability = this.capabilityCache.get(best.modelId);

        return {
          modelId: best.modelId,
          reason: `selected by ${policy} scoring (score: ${best.score.toFixed(3)})`,
          fallbackModels: scores.slice(1).map((s) => s.modelId),
          budget: { ...this.config.defaultBudget, ...request.budget },
          policy,
          metrics: {
            routingLatencyMs: performance.now() - startTime,
            cacheHit: best.fromCache,
            scores,
            capability,
          },
        };
      }
    }

    const capability = this.capabilityCache.get(this.config.defaultModel);
    return {
      modelId: this.config.defaultModel,
      reason: "default model",
      fallbackModels:
        request.preferredModels?.filter((id) => id !== this.config.defaultModel) ?? [],
      budget: { ...this.config.defaultBudget, ...request.budget },
      policy,
      metrics: {
        routingLatencyMs: performance.now() - startTime,
        cacheHit: !!capability,
        capability,
      },
    };
  }

  /**
   * Record a latency observation for a model.
   * This updates the capability cache for future routing decisions.
   */
  recordLatency(modelId: string, latencyMs: number): void {
    this.capabilityCache.recordLatency({
      modelId,
      latencyMs,
      timestamp: Date.now(),
    });
  }

  /**
   * Get the default model for fallback scenarios.
   */
  getDefaultModel(): string {
    return this.config.defaultModel;
  }

  /**
   * Get routing cache statistics.
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number; entries: number } {
    return this.capabilityCache.getStats();
  }
}

export function createModelRouter(config: ModelRouterConfig): ModelRouter {
  return new ModelRouter(config);
}
