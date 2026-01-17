import type { CoworkTokenUsage } from "@ku0/agent-runtime";
import { getModelCapability } from "@ku0/ai-core";

export class CostTrackerService {
  /**
   * Calculate estimated cost for a token usage event
   */
  calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    // Find model capabilities in catalog
    const model = getModelCapability(modelId);
    if (model && model.pricing) {
      const inputCost = (inputTokens / 1_000_000) * model.pricing.inputTokensPer1M;
      const outputCost = (outputTokens / 1_000_000) * model.pricing.outputTokensPer1M;
      return inputCost + outputCost;
    }

    // Default to 0 if no pricing found (or log warning)
    return 0;
  }

  /**
   * Create a usage record
   */
  createUsageRecord(
    sessionId: string,
    modelId: string,
    providerId: string,
    inputTokens: number,
    outputTokens: number,
    messageId?: string
  ): CoworkTokenUsage & { sessionId: string } {
    const cost = this.calculateCost(modelId, inputTokens, outputTokens);

    return {
      sessionId,
      messageId,
      modelId,
      providerId,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: cost,
      timestamp: Date.now(),
    };
  }
}
