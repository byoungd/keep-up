/**
 * Model Router
 *
 * Selects models based on task class, risk, budget constraints, and policy.
 * Implements spec 5.7: Model Routing Contract.
 */

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
}

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  private readonly defaultPolicy: ModelRoutingPolicy;

  constructor(config: ModelRouterConfig) {
    this.config = config;
    this.defaultPolicy = config.defaultPolicy ?? "quality";
  }

  /**
   * Resolve model for a turn. Per spec 5.7:
   * - Resolve before each LLM call based on phase and policy
   * - Record decision via emitter
   * - Fallback to safe default on failure
   */
  resolveForTurn(request: ModelRoutingRequest): ModelRoutingDecision {
    const requestedModel = request.preferredModels?.[0] ?? this.config.defaultModel;
    const policy = request.policy ?? this.defaultPolicy;
    const defaultWithinBudget =
      this.config.defaultBudget.maxTokens <= (request.budget?.maxTokens ?? Number.MAX_SAFE_INTEGER);

    try {
      const decision = this.route(request);
      const routingDecision: ModelRoutingDecision = {
        requested: requestedModel,
        resolved: decision.modelId,
        reason: decision.reason,
        policy: decision.policy,
      };

      // Emit for observability
      this.config.onRoutingDecision?.(routingDecision);

      return routingDecision;
    } catch {
      // Fallback on routing failure per spec 5.7
      const resolvedModel = defaultWithinBudget ? this.config.defaultModel : requestedModel;
      const fallbackDecision: ModelRoutingDecision = {
        requested: requestedModel,
        resolved: resolvedModel,
        reason: defaultWithinBudget
          ? "fallback to default model after routing failure"
          : "fallback to requested model; default exceeded budget",
        policy,
      };

      this.config.onRoutingDecision?.(fallbackDecision);

      return fallbackDecision;
    }
  }

  route(request: ModelRoutingRequest): ModelRouteDecision {
    const policy = request.policy ?? this.defaultPolicy;
    const matchedRule = this.config.rules?.find((rule) => rule.match(request));

    if (matchedRule) {
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
      };
    }

    return {
      modelId: this.config.defaultModel,
      reason: "default model",
      fallbackModels:
        request.preferredModels?.filter((id) => id !== this.config.defaultModel) ?? [],
      budget: { ...this.config.defaultBudget, ...request.budget },
      policy,
    };
  }

  /**
   * Get the default model for fallback scenarios.
   */
  getDefaultModel(): string {
    return this.config.defaultModel;
  }
}

export function createModelRouter(config: ModelRouterConfig): ModelRouter {
  return new ModelRouter(config);
}
