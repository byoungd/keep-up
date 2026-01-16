/**
 * Tiered Context Builder
 *
 * Builds prioritized context frames under a token budget.
 */

import { countTokens } from "../utils/tokenCounter";

export type ContextTier = "short_term" | "project" | "redacted";
export type ContextSourceType = "shortTerm" | "project" | "memory" | "tools";

export interface ContextItem {
  id: string;
  tier: ContextTier;
  content: string;
  priority?: number;
  tokens?: number;
  source?: string;
  sourceType?: ContextSourceType;
  redacted?: boolean;
}

export interface ContextBudget {
  maxTokens: number;
}

export interface ContextBuildResult {
  content: string;
  tokens: number;
  items: ContextItem[];
  truncated: boolean;
}

export interface TieredContextConfig {
  maxTokens: number;
  estimateTokens?: (text: string) => number;
}

const DEFAULT_TIER_ORDER: Record<ContextTier, number> = {
  short_term: 0,
  project: 1,
  redacted: 2,
};

export class TieredContextBuilder {
  private readonly maxTokens: number;
  private readonly estimateTokens: (text: string) => number;

  constructor(config: TieredContextConfig) {
    this.maxTokens = config.maxTokens;
    this.estimateTokens = config.estimateTokens ?? ((text) => countTokens(text));
  }

  build(items: ContextItem[], budget?: ContextBudget): ContextBuildResult {
    const maxTokens = budget?.maxTokens ?? this.maxTokens;
    const sorted = [...items].sort((a, b) => {
      const tierDelta = DEFAULT_TIER_ORDER[a.tier] - DEFAULT_TIER_ORDER[b.tier];
      if (tierDelta !== 0) {
        return tierDelta;
      }
      return (b.priority ?? 0) - (a.priority ?? 0);
    });

    const selected: ContextItem[] = [];
    let tokensUsed = 0;
    let truncated = false;

    for (const item of sorted) {
      const tokens = item.tokens ?? this.estimateTokens(item.content);
      if (tokensUsed + tokens > maxTokens) {
        truncated = true;
        continue;
      }
      tokensUsed += tokens;
      selected.push({ ...item, tokens });
    }

    return {
      content: selected.map((item) => item.content).join("\n\n"),
      tokens: tokensUsed,
      items: selected,
      truncated,
    };
  }
}
