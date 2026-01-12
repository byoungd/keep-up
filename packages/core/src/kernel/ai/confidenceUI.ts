/**
 * LFCC v0.9.1+ — Confidence-Based UI Integration
 *
 * Types and utilities for rendering confidence indicators
 * and managing AI review queues.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

// ============================================================================
// Confidence Treatment
// ============================================================================

/**
 * Visual treatment based on confidence level.
 */
export type ConfidenceTreatment =
  | { type: "none" } // confidence >= 0.95
  | { type: "subtle_indicator" } // 0.85 <= confidence < 0.95
  | { type: "highlighted" } // 0.70 <= confidence < 0.85
  | { type: "warning" } // 0.50 <= confidence < 0.70
  | { type: "requires_review" }; // confidence < 0.50

/**
 * Review priority levels.
 */
export type ReviewPriority = "critical" | "high" | "normal" | "low";

// ============================================================================
// Confidence Render Hint
// ============================================================================

/**
 * Render hint for confidence-based UI.
 */
export interface ConfidenceRenderHint {
  /** Block ID */
  block_id: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Suggested visual treatment */
  treatment: ConfidenceTreatment;

  /** Review priority */
  review_priority: ReviewPriority;

  /** Agent that generated this content */
  agent_id?: string;

  /** When generated */
  generated_at?: number;
}

// ============================================================================
// Review Item
// ============================================================================

/**
 * Item in the review queue.
 */
export interface ReviewItem {
  /** Block ID */
  block_id: string;

  /** Confidence score */
  confidence: number;

  /** Priority */
  priority: ReviewPriority;

  /** Preview of content */
  content_preview: string;

  /** Agent that generated */
  agent_id?: string;

  /** Intent description */
  intent_summary?: string;

  /** Generation timestamp */
  generated_at: number;
}

// ============================================================================
// AI Review Queue Interface
// ============================================================================

/**
 * Queue for managing AI content reviews.
 */
export interface AIReviewQueue {
  /**
   * Get all pending reviews, sorted by priority.
   */
  getPendingReviews(): ReviewItem[];

  /**
   * Add a block to the review queue.
   */
  addToQueue(item: ReviewItem): void;

  /**
   * Remove a block from the queue (approved/rejected).
   */
  removeFromQueue(blockId: string): void;

  /**
   * Approve a block.
   */
  approve(blockId: string, reviewerId: string): void;

  /**
   * Reject a block.
   */
  reject(blockId: string, reviewerId: string, reason?: string): void;

  /**
   * Batch approve all items above a confidence threshold.
   */
  batchApprove(threshold: number, reviewerId: string): number;

  /**
   * Get blocks that need review (for focus mode).
   */
  getReviewFocusBlocks(): string[];

  /**
   * Get queue statistics.
   */
  getStats(): ReviewQueueStats;
}

/**
 * Review queue statistics.
 */
export interface ReviewQueueStats {
  /** Total items pending */
  total_pending: number;

  /** By priority */
  by_priority: Record<ReviewPriority, number>;

  /** Average confidence */
  avg_confidence: number;

  /** Oldest item age (ms) */
  oldest_age_ms: number;
}

// ============================================================================
// Confidence Utilities
// ============================================================================

/**
 * Determine visual treatment based on confidence.
 */
export function getTreatment(confidence: number): ConfidenceTreatment {
  if (confidence >= 0.95) {
    return { type: "none" };
  }
  if (confidence >= 0.85) {
    return { type: "subtle_indicator" };
  }
  if (confidence >= 0.7) {
    return { type: "highlighted" };
  }
  if (confidence >= 0.5) {
    return { type: "warning" };
  }
  return { type: "requires_review" };
}

/**
 * Determine review priority based on confidence.
 */
export function getPriority(confidence: number): ReviewPriority {
  if (confidence < 0.5) {
    return "critical";
  }
  if (confidence < 0.7) {
    return "high";
  }
  if (confidence < 0.85) {
    return "normal";
  }
  return "low";
}

/**
 * Create a confidence render hint.
 */
export function createRenderHint(
  blockId: string,
  confidence: number,
  options?: {
    agent_id?: string;
    generated_at?: number;
  }
): ConfidenceRenderHint {
  return {
    block_id: blockId,
    confidence,
    treatment: getTreatment(confidence),
    review_priority: getPriority(confidence),
    agent_id: options?.agent_id,
    generated_at: options?.generated_at ?? Date.now(),
  };
}

// ============================================================================
// Review Queue Implementation
// ============================================================================

/**
 * In-memory review queue implementation.
 */
export class InMemoryReviewQueue implements AIReviewQueue {
  private queue = new Map<string, ReviewItem>();
  private approvedBlocks = new Set<string>();
  private rejectedBlocks = new Map<string, string>();

  getPendingReviews(): ReviewItem[] {
    const items = Array.from(this.queue.values());

    // Sort by priority then by confidence (lowest first)
    const priorityOrder: Record<ReviewPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    return items.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.confidence - b.confidence;
    });
  }

  addToQueue(item: ReviewItem): void {
    this.queue.set(item.block_id, item);
  }

  removeFromQueue(blockId: string): void {
    this.queue.delete(blockId);
  }

  approve(blockId: string, _reviewerId: string): void {
    this.queue.delete(blockId);
    this.approvedBlocks.add(blockId);
    this.rejectedBlocks.delete(blockId);
  }

  reject(blockId: string, _reviewerId: string, reason?: string): void {
    this.queue.delete(blockId);
    this.approvedBlocks.delete(blockId);
    this.rejectedBlocks.set(blockId, reason ?? "");
  }

  batchApprove(threshold: number, reviewerId: string): number {
    let count = 0;
    for (const [blockId, item] of this.queue) {
      if (item.confidence >= threshold) {
        this.approve(blockId, reviewerId);
        count++;
      }
    }
    return count;
  }

  getReviewFocusBlocks(): string[] {
    return this.getPendingReviews().map((item) => item.block_id);
  }

  getStats(): ReviewQueueStats {
    const items = Array.from(this.queue.values());

    const byPriority: Record<ReviewPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    let totalConfidence = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const item of items) {
      byPriority[item.priority]++;
      totalConfidence += item.confidence;
      const age = now - item.generated_at;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      total_pending: items.length,
      by_priority: byPriority,
      avg_confidence: items.length > 0 ? totalConfidence / items.length : 0,
      oldest_age_ms: oldestAge,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a review queue.
 */
export function createReviewQueue(): AIReviewQueue {
  return new InMemoryReviewQueue();
}
