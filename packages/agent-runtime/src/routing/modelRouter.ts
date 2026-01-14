/**
 * Model Router
 *
 * Selects models based on task class, risk, and budget constraints.
 */

export type ModelRiskLevel = "low" | "medium" | "high";

export interface ModelBudget {
  maxTokens: number;
  maxCostUsd?: number;
}

export interface ModelRoutingRequest {
  taskType: string;
  risk: ModelRiskLevel;
  budget: ModelBudget;
  preferredModels?: string[];
}

export interface ModelRouteDecision {
  modelId: string;
  reason: string;
  fallbackModels: string[];
  budget: ModelBudget;
}

export interface ModelRouteRule {
  id: string;
  match(request: ModelRoutingRequest): boolean;
  modelId: string;
  fallbackModels?: string[];
  budgetOverride?: Partial<ModelBudget>;
  reason: string;
}

export interface ModelRouterConfig {
  defaultModel: string;
  defaultBudget: ModelBudget;
  rules?: ModelRouteRule[];
}

export class ModelRouter {
  private readonly config: ModelRouterConfig;

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  route(request: ModelRoutingRequest): ModelRouteDecision {
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
      };
    }

    return {
      modelId: this.config.defaultModel,
      reason: "default model",
      fallbackModels:
        request.preferredModels?.filter((id) => id !== this.config.defaultModel) ?? [],
      budget: { ...this.config.defaultBudget, ...request.budget },
    };
  }
}

export function createModelRouter(config: ModelRouterConfig): ModelRouter {
  return new ModelRouter(config);
}
