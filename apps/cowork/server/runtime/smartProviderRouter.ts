import type { TaskType } from "@ku0/agent-runtime";
import { getModelCapability } from "@ku0/ai-core";

export type ProviderId = "openai" | "anthropic" | "gemini" | "deepseek" | "ollama";

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
  code_implementation: ["claude-sonnet-4-5", "gpt-5.2-auto", "gemini-3-pro-high"],
  refactoring: ["claude-sonnet-4-5", "gpt-5.2-auto", "gemini-3-pro-high"],
  debugging: ["claude-sonnet-4-5", "gpt-5.2-auto", "gemini-3-pro-high"],
  testing: ["gpt-5.2-auto", "claude-sonnet-4-5", "gemini-3-pro-high"],
  research: ["gpt-5.2-auto", "claude-opus-4-5", "gemini-3-pro-high"],
  documentation: ["gpt-5.2-instant", "gemini-3-flash", "claude-sonnet-4-5"],
  general: ["gpt-5.2-instant", "gemini-3-flash", "claude-sonnet-4-5"],
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
  if (capability?.provider === "deepseek") {
    return "deepseek";
  }
  if (capability?.provider === "ollama") {
    return "ollama";
  }

  const lower = modelId.toLowerCase();
  if (lower.includes("claude")) {
    return "anthropic";
  }
  if (lower.includes("gemini")) {
    return "gemini";
  }
  if (lower.includes("deepseek")) {
    return "deepseek";
  }
  if (lower.includes("llama") || lower.includes("mistral") || lower.includes("phi")) {
    return "ollama";
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
