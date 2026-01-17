/**
 * Context Window Manager
 *
 * Intelligently manages LLM context windows by:
 * - Allocating token budgets across segment types
 * - Prioritizing and selecting context segments
 * - Truncating content to fit within limits
 * - Optimizing for relevance around cursor position
 */

import { estimateTokens, truncateToTokens } from "./tokenEstimator";
import {
  type BuiltContext,
  type ContextSegment,
  type ContextSegmentType,
  type ContextWindowConfig,
  DEFAULT_CONTEXT_LIMITS,
  MODEL_CONTEXT_LIMITS,
  SEGMENT_PRIORITY,
  type TokenBudget,
  type TokenCounter,
} from "./types";

/** Default segment budget percentages (of available context) */
const DEFAULT_SEGMENT_BUDGETS: Record<ContextSegmentType, number> = {
  system: 0.1, // 10% for system prompt
  instructions: 0.1, // 10% for user instructions
  selection: 0.15, // 15% for selected text
  document: 0.35, // 35% for document content
  history: 0.15, // 15% for conversation history
  reference: 0.1, // 10% for references
  metadata: 0.05, // 5% for metadata
};

/**
 * Context Window Manager
 *
 * Handles intelligent context allocation and prioritization
 * for LLM requests with limited context windows.
 */
export class ContextWindowManager {
  private readonly config: Omit<Required<ContextWindowConfig>, "tokenCounter">;
  private readonly segmentBudgets: Record<ContextSegmentType, number>;
  private readonly tokenCounter: TokenCounter;

  constructor(config: ContextWindowConfig) {
    const modelLimits = MODEL_CONTEXT_LIMITS[config.model] ?? DEFAULT_CONTEXT_LIMITS;

    this.config = {
      model: config.model,
      maxTokens: config.maxTokens ?? modelLimits.maxContextTokens,
      outputReserve: config.outputReserve ?? modelLimits.recommendedOutputReserve,
      segmentBudgets: config.segmentBudgets ?? {},
    };

    this.tokenCounter = config.tokenCounter ?? { countTokens: estimateTokens };

    // Merge custom budgets with defaults
    this.segmentBudgets = {
      ...DEFAULT_SEGMENT_BUDGETS,
      ...config.segmentBudgets,
    };
  }

  /**
   * Calculate token budget for the current configuration.
   */
  calculateBudget(): TokenBudget {
    const total = this.config.maxTokens;
    const outputReserve = this.config.outputReserve;
    const contextAvailable = total - outputReserve;

    const allocated: Record<ContextSegmentType, number> = {} as Record<ContextSegmentType, number>;

    let totalAllocated = 0;
    for (const [type, percentage] of Object.entries(this.segmentBudgets)) {
      const tokens = Math.floor(contextAvailable * percentage);
      allocated[type as ContextSegmentType] = tokens;
      totalAllocated += tokens;
    }

    return {
      total,
      outputReserve,
      contextAvailable,
      allocated,
      remaining: contextAvailable - totalAllocated,
    };
  }

  /**
   * Build context from segments, respecting token limits.
   *
   * @param segments - Context segments to include
   * @returns Built context with segments fitted to budget
   */
  buildContext(segments: ContextSegment[]): BuiltContext {
    const budget = this.calculateBudget();
    const result = this.createEmptyContext(budget);

    // Sort segments by priority (highest first)
    const sortedSegments = [...segments].sort((a, b) => b.priority - a.priority);

    // Track usage per type
    const usedByType = this.createUsageMap();

    // First pass: allocate within type budgets
    const pending: ContextSegment[] = [];

    for (const segment of sortedSegments) {
      const allocated = this.allocateWithinType(segment, budget, usedByType, result);
      if (!allocated) {
        // Try to use remaining budget from other types
        pending.push(segment);
      }
    }

    // Second pass: use remaining budget for pending segments
    this.allocatePendingSegments(pending, budget, result);

    // Sort final segments by original priority for output
    result.segments.sort((a, b) => b.priority - a.priority);

    return result;
  }

  private createEmptyContext(budget: TokenBudget): BuiltContext {
    return {
      segments: [],
      totalTokens: 0,
      budget,
      truncatedSegments: [],
      droppedSegments: [],
    };
  }

  private createUsageMap(): Record<ContextSegmentType, number> {
    const usedByType: Record<ContextSegmentType, number> = {} as Record<ContextSegmentType, number>;
    for (const type of Object.keys(this.segmentBudgets)) {
      usedByType[type as ContextSegmentType] = 0;
    }
    return usedByType;
  }

  private allocateWithinType(
    segment: ContextSegment,
    budget: TokenBudget,
    usedByType: Record<ContextSegmentType, number>,
    result: BuiltContext
  ): boolean {
    const typeBudget = budget.allocated[segment.type] ?? 0;
    const typeUsed = usedByType[segment.type] ?? 0;
    const typeRemaining = typeBudget - typeUsed;

    if (segment.tokenCount <= typeRemaining) {
      this.appendSegment(result, segment);
      usedByType[segment.type] = typeUsed + segment.tokenCount;
      return true;
    }

    if (segment.canTruncate && typeRemaining > this.minimumTokens(segment)) {
      const truncated = this.truncateSegment(segment, typeRemaining);
      this.appendSegment(result, truncated);
      usedByType[segment.type] = typeUsed + truncated.tokenCount;
      this.recordTruncation(result, segment, truncated);
      return true;
    }

    return false;
  }

  private allocatePendingSegments(
    pending: ContextSegment[],
    budget: TokenBudget,
    result: BuiltContext
  ): void {
    for (const segment of pending) {
      this.tryAddPendingSegment(segment, budget, result);
    }
  }

  private tryAddPendingSegment(
    segment: ContextSegment,
    budget: TokenBudget,
    result: BuiltContext
  ): void {
    const available = budget.contextAvailable - result.totalTokens;
    if (available <= 0) {
      this.recordDropped(result, segment);
      return;
    }

    if (segment.tokenCount <= available) {
      this.appendSegment(result, segment);
      return;
    }

    if (segment.canTruncate && available > this.minimumTokens(segment)) {
      const truncated = this.truncateSegment(segment, available);
      this.appendSegment(result, truncated);
      this.recordTruncation(result, segment, truncated);
      return;
    }

    this.recordDropped(result, segment);
  }

  private appendSegment(result: BuiltContext, segment: ContextSegment): void {
    result.segments.push(segment);
    result.totalTokens += segment.tokenCount;
  }

  private recordTruncation(
    result: BuiltContext,
    original: ContextSegment,
    truncated: ContextSegment
  ): void {
    result.truncatedSegments.push(
      `${original.type}:${original.tokenCount}->${truncated.tokenCount}`
    );
  }

  private recordDropped(result: BuiltContext, segment: ContextSegment): void {
    result.droppedSegments.push(segment.type);
  }

  private minimumTokens(segment: ContextSegment): number {
    return segment.minTokens ?? 50;
  }

  /**
   * Create a context segment with automatic token estimation.
   */
  createSegment(
    type: ContextSegmentType,
    content: string,
    options: {
      canTruncate?: boolean;
      minTokens?: number;
      priority?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): ContextSegment {
    return {
      type,
      content,
      tokenCount: this.tokenCounter.countTokens(content),
      priority: options.priority ?? SEGMENT_PRIORITY[type],
      canTruncate: options.canTruncate ?? true,
      minTokens: options.minTokens,
      metadata: options.metadata,
    };
  }

  /**
   * Truncate a segment to fit within token limit.
   */
  private truncateSegment(segment: ContextSegment, maxTokens: number): ContextSegment {
    const truncatedContent = truncateToTokens(segment.content, maxTokens, {
      from: "end",
      ellipsis: "\n[...truncated...]",
      tokenCounter: this.tokenCounter,
    });

    return {
      ...segment,
      content: truncatedContent,
      tokenCount: this.tokenCounter.countTokens(truncatedContent),
    };
  }

  /**
   * Get model context limits.
   */
  getModelLimits() {
    return MODEL_CONTEXT_LIMITS[this.config.model] ?? DEFAULT_CONTEXT_LIMITS;
  }

  /**
   * Check if content would fit in remaining budget.
   */
  wouldFit(tokenCount: number, currentUsage: number): boolean {
    return currentUsage + tokenCount <= this.config.maxTokens - this.config.outputReserve;
  }

  /**
   * Get remaining tokens after current usage.
   */
  getRemainingTokens(currentUsage: number): number {
    return Math.max(0, this.config.maxTokens - this.config.outputReserve - currentUsage);
  }
}

/**
 * Create a context window manager with sensible defaults.
 */
export function createContextManager(
  model: string,
  options: Partial<ContextWindowConfig> = {}
): ContextWindowManager {
  return new ContextWindowManager({
    model,
    ...options,
  });
}
