/**
 * Token estimation utilities
 */

import { TokenTracker } from "@ku0/ai-core";

const tokenTracker = new TokenTracker();

/**
 * Estimate token count for given text
 */
export function estimateTokens(text: string): number {
  return tokenTracker.countTokens(text, "gpt-4o");
}

/**
 * Truncate content to approximate token budget
 * Uses rough estimate of 4 characters per token
 */
export function truncateToTokenBudget(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  // Truncate and add indicator
  return `${content.substring(0, maxChars - 50)}\n\n... (truncated for token budget)`;
}
