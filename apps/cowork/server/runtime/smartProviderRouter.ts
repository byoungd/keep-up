import type { TaskType } from "@ku0/agent-runtime";
import { getModelCapability } from "@ku0/ai-core";

export type ProviderId = "openai" | "anthropic" | "gemini";

export interface SmartRouterConfig {
  costOptimizationLevel: 0 | 1 | 2;
  taskModelPreferences: Record<TaskType, string[]>;
  modelCosts: Record<
    string,
    {
      inputTokenCostPer1M: number;
      outputTokenCostPer1M: number;
      contextWindow: number;
    }
  >;
}

export interface ProviderSelectionRequest {
  taskType: TaskType;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  requiredCapabilities?: string[];
}

export interface ProviderSelection {
  providerId: ProviderId;
  modelId: string;
  estimatedCost: number;
}

const DEFAULT_TASK_PREFERENCES: Record<TaskType, string[]> = {
  code_implementation: ["claude-3-5-sonnet", "gpt-4o", "gemini-1.5-pro"],
  refactoring: ["claude-3-5-sonnet", "gpt-4o", "gemini-1.5-pro"],
  debugging: ["claude-3-5-sonnet", "gpt-4o", "gemini-1.5-pro"],
  testing: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
  research: ["gpt-4o", "gemini-1.5-pro", "claude-3-5-sonnet"],
  documentation: ["gpt-4o-mini", "gemini-1.5-flash", "claude-3-haiku"],
  general: ["gpt-4o-mini", "gemini-1.5-flash", "claude-3-haiku"],
};

export class SmartProviderRouter {
  private readonly providers: Array<{ providerId: ProviderId; defaultModel: string }>;
  private readonly config: SmartRouterConfig;

  constructor(
    providers: Array<{ providerId: ProviderId; defaultModel: string }>,
    config?: Partial<SmartRouterConfig>
  ) {
    this.providers = providers;
    this.config = {
      costOptimizationLevel: config?.costOptimizationLevel ?? 1,
      taskModelPreferences: config?.taskModelPreferences ?? DEFAULT_TASK_PREFERENCES,
      modelCosts: config?.modelCosts ?? {},
    };
  }

  selectProvider(request: ProviderSelectionRequest): ProviderSelection {
    const preferredModels = this.config.taskModelPreferences[request.taskType] ?? [];
    const candidates = this.resolveCandidates(preferredModels, request);

    if (candidates.length === 0) {
      const fallback = this.providers[0];
      return {
        providerId: fallback.providerId,
        modelId: fallback.defaultModel,
        estimatedCost: this.estimateCost(fallback.defaultModel, request),
      };
    }

    if (this.config.costOptimizationLevel === 0) {
      return candidates[0];
    }

    const sortedByCost = [...candidates].sort((a, b) => a.estimatedCost - b.estimatedCost);
    return sortedByCost[0];
  }

  private resolveCandidates(
    models: string[],
    request: ProviderSelectionRequest
  ): ProviderSelection[] {
    const candidates: ProviderSelection[] = [];

    for (const modelId of models) {
      const providerId = resolveProviderFromModel(modelId);
      if (!providerId) {
        continue;
      }
      const provider = this.providers.find((entry) => entry.providerId === providerId);
      if (!provider) {
        continue;
      }

      candidates.push({
        providerId,
        modelId,
        estimatedCost: this.estimateCost(modelId, request),
      });
    }

    if (candidates.length === 0) {
      for (const provider of this.providers) {
        candidates.push({
          providerId: provider.providerId,
          modelId: provider.defaultModel,
          estimatedCost: 0,
        });
      }
    }

    return candidates;
  }

  private estimateCost(modelId: string, request: ProviderSelectionRequest): number {
    const cost = this.config.modelCosts[modelId];
    if (!cost) {
      return 0;
    }
    const inputCost = (request.estimatedInputTokens * cost.inputTokenCostPer1M) / 1_000_000;
    const outputCost = (request.estimatedOutputTokens * cost.outputTokenCostPer1M) / 1_000_000;
    return inputCost + outputCost;
  }
}

function resolveProviderFromModel(modelId: string): ProviderId | null {
  const capability = getModelCapability(modelId);
  if (capability?.provider === "openai") {
    return "openai";
  }
  if (capability?.provider === "gemini") {
    return "gemini";
  }
  if (capability?.provider === "claude") {
    return "anthropic";
  }

  const lower = modelId.toLowerCase();
  if (lower.includes("claude")) {
    return "anthropic";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  if (
    lower.includes("gpt") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("o4")
  ) {
    return "openai";
  }
  return null;
}
