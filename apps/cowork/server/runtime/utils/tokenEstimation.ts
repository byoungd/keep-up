/**
 * Token estimation utilities
 *
 * Re-exports token estimation from @ku0/ai-core
 * to avoid duplicate implementations.
 */

import { estimateTokens as aiCoreEstimateTokens, truncateToTokens } from "@ku0/ai-core";

/**
 * Estimate token count for given text
 */
export function estimateTokens(text: string): number {
  return aiCoreEstimateTokens(text);
}

/**
 * Truncate content to approximate token budget
 */
export function truncateToTokenBudget(content: string, maxTokens: number): string {
  return truncateToTokens(content, maxTokens);
}
