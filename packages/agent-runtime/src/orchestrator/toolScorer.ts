/**
 * Tool Scorer
 *
 * Context-aware tool scoring for intelligent tool selection.
 * Combines multiple signals to rank tools by relevance and reliability.
 */

import type { MCPTool, ToolContext } from "../types";
import type { ExecutionFeedbackTracker, ToolStats } from "./executionFeedback";

// ============================================================================
// Types
// ============================================================================

/**
 * Tool score with breakdown.
 */
export interface ToolScore {
  /** Tool name */
  toolName: string;
  /** Overall score (0-100) */
  overallScore: number;
  /** Relevance to current task (0-1) */
  relevanceScore: number;
  /** Historical success rate (0-1, or -1 if unknown) */
  successRate: number;
  /** Average latency in ms (-1 if unknown) */
  avgLatencyMs: number;
  /** Whether this tool is recommended */
  recommended: boolean;
  /** Reason for recommendation/non-recommendation */
  reason?: string;
}

/**
 * Scoring weights configuration.
 */
export interface ToolScorerWeights {
  /** Weight for task relevance (0-1) */
  relevance: number;
  /** Weight for historical success rate (0-1) */
  successRate: number;
  /** Weight for latency (0-1) */
  latency: number;
  /** Weight for recency of use (0-1) */
  recency: number;
}

/**
 * Tool scorer configuration.
 */
export interface ToolScorerConfig {
  /** Scoring weights */
  weights: ToolScorerWeights;
  /** Minimum score to be considered recommended */
  recommendationThreshold: number;
  /** Minimum success rate to be considered reliable */
  minSuccessRate: number;
  /** Maximum average latency to be considered fast (ms) */
  maxFastLatencyMs: number;
}

const DEFAULT_WEIGHTS: ToolScorerWeights = {
  relevance: 0.4,
  successRate: 0.3,
  latency: 0.15,
  recency: 0.15,
};

const DEFAULT_CONFIG: ToolScorerConfig = {
  weights: DEFAULT_WEIGHTS,
  recommendationThreshold: 60,
  minSuccessRate: 0.7,
  maxFastLatencyMs: 5000,
};

// ============================================================================
// Tool Scorer
// ============================================================================

/**
 * Context-aware tool scorer.
 */
export class ToolScorer {
  private readonly config: ToolScorerConfig;
  private readonly feedbackTracker?: ExecutionFeedbackTracker;

  constructor(config: Partial<ToolScorerConfig> = {}, feedbackTracker?: ExecutionFeedbackTracker) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      weights: { ...DEFAULT_WEIGHTS, ...config.weights },
    };
    this.feedbackTracker = feedbackTracker;
  }

  /**
   * Score a list of tools based on context.
   */
  scoreTools(context: ToolContext, candidates: MCPTool[]): ToolScore[] {
    const scores = candidates.map((tool) => this.scoreTool(tool, context));
    return scores.sort((a, b) => b.overallScore - a.overallScore);
  }

  /**
   * Score a single tool.
   */
  scoreTool(tool: MCPTool, context: ToolContext): ToolScore {
    const toolName = tool.name;

    // Get feedback stats if available
    const stats = this.feedbackTracker?.getStats(toolName);

    // Calculate individual scores
    const relevanceScore = this.calculateRelevanceScore(tool, context);
    const successRateValue = stats?.successRate ?? -1;
    const avgLatencyMs = stats?.averageDurationMs ?? -1;
    const recencyScore = this.calculateRecencyScore(stats);

    // Calculate overall score
    const weights = this.config.weights;
    let overallScore = 0;
    let totalWeight = 0;

    // Relevance (always available)
    overallScore += relevanceScore * 100 * weights.relevance;
    totalWeight += weights.relevance;

    // Success rate (if available)
    if (successRateValue >= 0) {
      overallScore += successRateValue * 100 * weights.successRate;
      totalWeight += weights.successRate;
    }

    // Latency (if available)
    if (avgLatencyMs >= 0) {
      const latencyScore = this.calculateLatencyScore(avgLatencyMs);
      overallScore += latencyScore * 100 * weights.latency;
      totalWeight += weights.latency;
    }

    // Recency (if available)
    if (recencyScore >= 0) {
      overallScore += recencyScore * 100 * weights.recency;
      totalWeight += weights.recency;
    }

    // Normalize
    if (totalWeight > 0) {
      overallScore = overallScore / totalWeight;
    }

    // Determine recommendation
    const recommended = this.isRecommended(overallScore, successRateValue);
    const reason = this.getRecommendationReason(
      recommended,
      relevanceScore,
      successRateValue,
      avgLatencyMs
    );

    return {
      toolName,
      overallScore: Math.round(overallScore),
      relevanceScore,
      successRate: successRateValue,
      avgLatencyMs,
      recommended,
      reason,
    };
  }

  /**
   * Filter tools by minimum score.
   */
  filterByThreshold(scores: ToolScore[], minScore?: number): ToolScore[] {
    const threshold = minScore ?? this.config.recommendationThreshold;
    return scores.filter((s) => s.overallScore >= threshold);
  }

  /**
   * Get only recommended tools.
   */
  getRecommended(scores: ToolScore[]): ToolScore[] {
    return scores.filter((s) => s.recommended);
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private calculateRelevanceScore(tool: MCPTool, _context: ToolContext): number {
    // Simple relevance based on tool category heuristics
    let score = 0.5; // Base score

    // Check if tool description matches common patterns
    const description = tool.description?.toLowerCase() ?? "";
    const name = tool.name?.toLowerCase() ?? "";

    // Boost for common high-value tools
    if (
      name.includes("read") ||
      name.includes("write") ||
      name.includes("edit") ||
      name.includes("search")
    ) {
      score += 0.2;
    }

    // Boost for code-related tools
    if (
      description.includes("code") ||
      description.includes("file") ||
      description.includes("source")
    ) {
      score += 0.15;
    }

    // Boost for git tools
    if (description.includes("git") || name.includes("git")) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  private calculateLatencyScore(avgLatencyMs: number): number {
    // Fast tools get higher scores
    const maxFast = this.config.maxFastLatencyMs;
    if (avgLatencyMs <= maxFast) {
      return 1 - (avgLatencyMs / maxFast) * 0.5; // 0.5 - 1.0
    }
    // Slow tools get lower scores but not zero
    return Math.max(0.2, 0.5 - ((avgLatencyMs - maxFast) / maxFast) * 0.3);
  }

  private calculateRecencyScore(stats: ToolStats | undefined): number {
    if (!stats || stats.lastExecutedAt === 0) {
      return -1; // Unknown
    }

    const hoursSinceUse = (Date.now() - stats.lastExecutedAt) / 3600_000;

    // Recent use is good (suggests relevance)
    if (hoursSinceUse < 1) {
      return 0.9;
    }
    if (hoursSinceUse < 6) {
      return 0.7;
    }
    if (hoursSinceUse < 24) {
      return 0.5;
    }
    return 0.3;
  }

  private isRecommended(overallScore: number, successRate: number): boolean {
    // Must meet threshold
    if (overallScore < this.config.recommendationThreshold) {
      return false;
    }

    // If we have success rate data, it must be acceptable
    if (successRate >= 0 && successRate < this.config.minSuccessRate) {
      return false;
    }

    return true;
  }

  private getRecommendationReason(
    recommended: boolean,
    relevance: number,
    successRate: number,
    _latency: number
  ): string {
    if (!recommended) {
      if (successRate >= 0 && successRate < this.config.minSuccessRate) {
        return `Low success rate (${(successRate * 100).toFixed(0)}%)`;
      }
      if (relevance < 0.4) {
        return "Low relevance to current context";
      }
      return "Score below threshold";
    }

    if (successRate >= 0.9) {
      return "High reliability";
    }
    if (relevance >= 0.8) {
      return "Highly relevant";
    }
    return "Good overall fit";
  }
}

/**
 * Create a tool scorer instance.
 */
export function createToolScorer(
  config?: Partial<ToolScorerConfig>,
  feedbackTracker?: ExecutionFeedbackTracker
): ToolScorer {
  return new ToolScorer(config, feedbackTracker);
}
