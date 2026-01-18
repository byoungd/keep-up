import type { TokenUsageStats } from "@ku0/agent-runtime";
import { getModelCapability } from "@ku0/ai-core";

export type TokenUsageSnapshot = TokenUsageStats & {
  costUsd?: number | null;
  modelId?: string;
  providerId?: string;
};

export function normalizeTokenUsage(usage: TokenUsageStats, modelId?: string): TokenUsageStats {
  const capability = modelId ? getModelCapability(modelId) : undefined;
  const contextWindow = usage.contextWindow ?? capability?.contextWindow;
  const utilization =
    contextWindow && contextWindow > 0
      ? (usage.totalTokens / contextWindow) * 100
      : usage.utilization;

  return {
    ...usage,
    ...(contextWindow ? { contextWindow } : {}),
    ...(utilization !== undefined ? { utilization } : {}),
  };
}

export function calculateUsageCostUsd(usage: TokenUsageStats, modelId?: string): number | null {
  if (!modelId) {
    return null;
  }
  const pricing = getModelCapability(modelId)?.pricing;
  if (!pricing) {
    return null;
  }
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputTokensPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputTokensPer1M;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

export function mergeTokenUsage(
  current: TokenUsageStats | undefined,
  delta: TokenUsageStats
): TokenUsageStats {
  const next: TokenUsageStats = {
    inputTokens: (current?.inputTokens ?? 0) + delta.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + delta.outputTokens,
    totalTokens: (current?.totalTokens ?? 0) + delta.totalTokens,
  };
  const contextWindow = delta.contextWindow ?? current?.contextWindow;
  if (contextWindow) {
    next.contextWindow = contextWindow;
    next.utilization = (next.totalTokens / contextWindow) * 100;
  }
  return next;
}

export function buildTokenUsageSnapshot(input: {
  usage: TokenUsageStats;
  modelId?: string;
  providerId?: string;
}): TokenUsageSnapshot {
  const normalized = normalizeTokenUsage(input.usage, input.modelId);
  return {
    ...normalized,
    costUsd: calculateUsageCostUsd(normalized, input.modelId),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
  };
}
