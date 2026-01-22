/**
 * Context Frame Builder
 *
 * Builds structured context frames with source attribution and token budgets.
 */

import type { ContextFrame } from "../types";
import {
  type ContextBudget,
  type ContextItem,
  type ContextSourceType,
  TieredContextBuilder,
} from "./contextBuilder";

export interface ContextFrameOutput {
  frame: ContextFrame;
  content: string;
  truncated: boolean;
}

export interface ContextFrameBuilderConfig {
  maxTokens: number;
  estimateTokens?: (text: string) => number;
  frameIdFactory?: () => string;
}

export class ContextFrameBuilder {
  private readonly builder: TieredContextBuilder;
  private readonly maxTokens: number;
  private readonly frameIdFactory: () => string;

  constructor(config: ContextFrameBuilderConfig) {
    this.builder = new TieredContextBuilder({
      maxTokens: config.maxTokens,
      estimateTokens: config.estimateTokens,
    });
    this.maxTokens = config.maxTokens;
    this.frameIdFactory = config.frameIdFactory ?? (() => generateFrameId());
  }

  build(items: ContextItem[], budget?: ContextBudget): ContextFrameOutput {
    const result = this.builder.build(items, budget);
    const sources = {
      shortTerm: [] as string[],
      project: [] as string[],
      memory: [] as string[],
      tools: [] as string[],
    };
    const redactions: string[] = [];

    for (const item of result.items) {
      const bucket = resolveSourceType(item);
      const label = item.source ?? item.id;
      sources[bucket].push(label);
      if (item.redacted) {
        redactions.push(item.id);
      }
    }

    const frame: ContextFrame = {
      frameId: this.frameIdFactory(),
      sources,
      redactions,
      tokenBudget: {
        maxTokens: budget?.maxTokens ?? this.maxTokens,
        usedTokens: result.tokens,
      },
    };

    return {
      frame,
      content: result.content,
      truncated: result.truncated,
    };
  }
}

function resolveSourceType(item: ContextItem): ContextSourceType {
  if (item.sourceType) {
    return item.sourceType;
  }
  if (item.tier === "short_term") {
    return "shortTerm";
  }
  if (item.tier === "project") {
    return "project";
  }
  return "memory";
}

function generateFrameId(): string {
  return `frame_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
