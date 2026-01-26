/**
 * Model Router
 *
 * Selects models based on task class, risk, budget constraints, and policy.
 * Implements spec 5.7: Model Routing Contract.
 * Enhanced with capability caching and cost/latency scoring (Track H.1).
 */

import type { TelemetryContext } from "@ku0/agent-runtime-telemetry/telemetry";
import { METRIC_NAMES } from "@ku0/agent-runtime-telemetry/telemetry";
import {
  getModelCapabilityCache,
  type ModelCapability,
  type ModelCapabilityCache,
  type ModelScore,
} from "./modelCapabilityCache";
import {
  type ModelHealthConfig,
  type ModelHealthObservation,
  type ModelHealthSnapshot,
  type ModelHealthStatus,
  ModelHealthTracker,
} from "./modelHealthTracker";

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
  fallbackModels?: string[];
  /** Routing metrics for observability (Track H.1) */
  metrics?: RoutingMetrics;
}

export interface RoutingFallbackInfo {
  used: boolean;
  from: string;
  to: string;
  reason: string;
  healthStatus?: ModelHealthStatus;
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
  /** Health metrics for selected model */
  health?: ModelHealthSnapshot;
  /** Fallback details when a health downgrade occurs */
  fallback?: RoutingFallbackInfo;
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
  /** Optional telemetry context for routing metrics */
  telemetry?: TelemetryContext;
  /** Enable capability-based scoring (Track H.1) */
  enableCapabilityScoring?: boolean;
  /** Optional custom capability cache */
  capabilityCache?: ModelCapabilityCache;
  /** Optional model health tracker for fallback routing (Track M5) */
  healthTracker?: ModelHealthTracker;
  /** Optional health tracker configuration */
  healthConfig?: ModelHealthConfig;
  /** Enable health-aware fallback routing */
  enableHealthFallback?: boolean;
}

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly defaultPolicy: ModelRoutingPolicy;
  private readonly capabilityCache: ModelCapabilityCache;
  private readonly enableScoring: boolean;
  private readonly healthTracker?: ModelHealthTracker;
  private readonly enableHealthFallback: boolean;
  private readonly telemetry?: TelemetryContext;

  constructor(config: ModelRouterConfig) {
    this.config = config;
    this.defaultPolicy = config.defaultPolicy ?? "quality";
    this.enableScoring = config.enableCapabilityScoring ?? true;
    this.capabilityCache = config.capabilityCache ?? getModelCapabilityCache();
    this.enableHealthFallback = config.enableHealthFallback ?? true;
    this.healthTracker =
      config.healthTracker ??
      (this.enableHealthFallback ? new ModelHealthTracker(config.healthConfig) : undefined);
    this.telemetry = config.telemetry;
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
        fallbackModels: decision.fallbackModels,
        metrics: {
          routingLatencyMs,
          cacheHit: decision.metrics?.cacheHit ?? false,
          scores: decision.metrics?.scores,
          capability: decision.metrics?.capability,
          health: decision.metrics?.health,
          fallback: decision.metrics?.fallback,
        },
      };

      // Emit for observability
      this.config.onRoutingDecision?.(routingDecision);
      this.recordTelemetry(routingDecision);

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
        fallbackModels:
          request.preferredModels?.filter((modelId) => modelId !== resolvedModel) ?? [],
        metrics: {
          routingLatencyMs,
          cacheHit: false,
          fallback: {
            used: true,
            from: requestedModel,
            to: resolvedModel,
            reason: "routing failure",
          },
        },
      };

      this.config.onRoutingDecision?.(fallbackDecision);
      this.recordTelemetry(fallbackDecision);

      return fallbackDecision;
    }
  }

  route(request: ModelRoutingRequest): ModelRouteDecision {
    const startTime = performance.now();
    const policy = request.policy ?? this.defaultPolicy;
    const matchedRule = this.config.rules?.find((rule) => rule.match(request));

    let decision: ModelRouteDecision;
    if (matchedRule) {
      const capability = this.capabilityCache.get(matchedRule.modelId);
      decision = {
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
          routingLatencyMs: 0,
          cacheHit: !!capability,
          capability,
        },
      };
    } else if (
      this.enableScoring &&
      request.preferredModels &&
      request.preferredModels.length > 1
    ) {
      const scores = this.capabilityCache.rank(request.preferredModels, policy);

      if (scores.length > 0) {
        const best = scores[0];
        const capability = this.capabilityCache.get(best.modelId);
        decision = {
          modelId: best.modelId,
          reason: `selected by ${policy} scoring (score: ${best.score.toFixed(3)})`,
          fallbackModels: scores.slice(1).map((s) => s.modelId),
          budget: { ...this.config.defaultBudget, ...request.budget },
          policy,
          metrics: {
            routingLatencyMs: 0,
            cacheHit: best.fromCache,
            scores,
            capability,
          },
        };
      } else {
        const capability = this.capabilityCache.get(this.config.defaultModel);
        decision = {
          modelId: this.config.defaultModel,
          reason: "default model",
          fallbackModels:
            request.preferredModels?.filter((id) => id !== this.config.defaultModel) ?? [],
          budget: { ...this.config.defaultBudget, ...request.budget },
          policy,
          metrics: {
            routingLatencyMs: 0,
            cacheHit: !!capability,
            capability,
          },
        };
      }
    } else {
      const capability = this.capabilityCache.get(this.config.defaultModel);
      decision = {
        modelId: this.config.defaultModel,
        reason: "default model",
        fallbackModels:
          request.preferredModels?.filter((id) => id !== this.config.defaultModel) ?? [],
        budget: { ...this.config.defaultBudget, ...request.budget },
        policy,
        metrics: {
          routingLatencyMs: 0,
          cacheHit: !!capability,
          capability,
        },
      };
    }

    const healthAdjusted = this.applyHealthFallback(decision);
    if (healthAdjusted.metrics) {
      healthAdjusted.metrics.routingLatencyMs = performance.now() - startTime;
    }
    return healthAdjusted;
  }

  /**
   * Record a latency observation for a model.
   * This updates the capability cache and health tracker for future routing decisions.
   */
  recordLatency(modelId: string, latencyMs: number): void {
    this.capabilityCache.recordLatency({
      modelId,
      latencyMs,
      timestamp: Date.now(),
    });
    this.healthTracker?.recordObservation({ modelId, outcome: "success", latencyMs });
  }

  recordSuccess(modelId: string, latencyMs?: number): void {
    this.healthTracker?.recordObservation({ modelId, outcome: "success", latencyMs });
  }

  recordError(modelId: string, latencyMs?: number): void {
    this.healthTracker?.recordObservation({ modelId, outcome: "error", latencyMs });
  }

  recordTimeout(modelId: string, latencyMs?: number): void {
    this.healthTracker?.recordObservation({ modelId, outcome: "timeout", latencyMs });
  }

  recordHealthObservation(observation: ModelHealthObservation): void {
    this.healthTracker?.recordObservation(observation);
  }

  getModelHealth(modelId: string): ModelHealthSnapshot | undefined {
    return this.healthTracker?.getHealth(modelId);
  }

  private applyHealthFallback(decision: ModelRouteDecision): ModelRouteDecision {
    if (!this.enableHealthFallback || !this.healthTracker) {
      return decision;
    }

    const candidates = this.buildCandidateList(decision.modelId, decision.fallbackModels);
    if (candidates.length === 0) {
      return decision;
    }

    const healthByModel = new Map<string, ModelHealthSnapshot | undefined>();
    const candidatesWithStatus = candidates.map((modelId) => {
      const health = this.healthTracker?.getHealth(modelId);
      healthByModel.set(modelId, health);
      return { modelId, status: health?.status ?? "healthy" };
    });

    const primary = candidatesWithStatus[0];
    let selected = primary;
    let fallbackReason: string | undefined;

    if (primary.status === "unhealthy") {
      const fallbackCandidate = candidatesWithStatus.find(
        (candidate) => candidate.status !== "unhealthy"
      );
      if (fallbackCandidate) {
        selected = fallbackCandidate;
        fallbackReason = "primary unhealthy";
      }
    } else if (primary.status === "degraded") {
      const fallbackCandidate = candidatesWithStatus.find(
        (candidate) => candidate.status === "healthy"
      );
      if (fallbackCandidate) {
        selected = fallbackCandidate;
        fallbackReason = "primary degraded";
      }
    }

    const fallbackUsed = selected.modelId !== primary.modelId;
    const fallbackModels = candidatesWithStatus
      .filter((candidate) => candidate.modelId !== selected.modelId)
      .filter((candidate) => candidate.status !== "unhealthy")
      .map((candidate) => candidate.modelId);

    const selectedHealth = healthByModel.get(selected.modelId);
    const baseMetrics: RoutingMetrics = decision.metrics ?? {
      routingLatencyMs: 0,
      cacheHit: false,
    };
    let metrics: RoutingMetrics = { ...baseMetrics, health: selectedHealth };

    if (fallbackUsed) {
      const capability = this.capabilityCache.get(selected.modelId);
      metrics = {
        ...metrics,
        cacheHit: !!capability,
        capability,
        health: selectedHealth,
        fallback: {
          used: true,
          from: primary.modelId,
          to: selected.modelId,
          reason: fallbackReason ?? "health fallback",
          healthStatus: primary.status,
        },
      };
    }

    return {
      ...decision,
      modelId: selected.modelId,
      reason: fallbackUsed
        ? `${decision.reason}; health fallback from ${primary.modelId} (${primary.status})`
        : decision.reason,
      fallbackModels,
      metrics,
    };
  }

  private buildCandidateList(primary: string, fallbacks: string[]): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const modelId of [primary, ...fallbacks]) {
      if (seen.has(modelId)) {
        continue;
      }
      seen.add(modelId);
      candidates.push(modelId);
    }

    return candidates;
  }

  private recordTelemetry(decision: ModelRoutingDecision): void {
    if (!this.telemetry || !decision.metrics) {
      return;
    }

    const fallbackUsed = decision.metrics.fallback?.used ?? false;
    const labels: Record<string, string> = {
      policy: decision.policy,
      fallback: fallbackUsed ? "true" : "false",
    };

    if (decision.metrics.health?.status) {
      labels.health = decision.metrics.health.status;
    }

    this.telemetry.metrics.observe(
      METRIC_NAMES.ROUTING_LATENCY_MS,
      decision.metrics.routingLatencyMs,
      labels
    );

    if (decision.metrics.cacheHit) {
      this.telemetry.metrics.increment(METRIC_NAMES.ROUTING_CACHE_HITS, labels);
    } else {
      this.telemetry.metrics.increment(METRIC_NAMES.ROUTING_CACHE_MISSES, labels);
    }
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
