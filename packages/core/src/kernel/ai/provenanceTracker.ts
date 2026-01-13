/**
 * LFCC v0.9.1 — Provenance Tracker
 *
 * Service to manage provenance lifecycle for blocks in a document.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.3
 */

import type {
  AIBlockProvenance,
  AIGenerationRecord,
  ContentOrigin,
  ReviewStatus,
} from "./provenance.js";
import {
  addGenerationRecord,
  createHumanProvenance,
  setReviewStatus,
  transitionToMixed,
} from "./provenance.js";

// ============================================================================
// Provenance Tracker Interface
// ============================================================================

/**
 * Service for tracking content provenance across a document.
 */
export interface ProvenanceTracker {
  /**
   * Get provenance for a block
   */
  getProvenance(blockId: string): AIBlockProvenance | undefined;

  /**
   * Initialize provenance for a new block (defaults to human origin)
   */
  initializeBlock(blockId: string, origin?: ContentOrigin): void;

  /**
   * Record an AI generation event
   */
  recordGeneration(blockId: string, record: AIGenerationRecord): void;

  /**
   * Update origin (e.g., when human edits AI content)
   */
  updateOrigin(blockId: string, origin: ContentOrigin): void;

  /**
   * Mark content as human-edited (transitions to "mixed" if was AI)
   */
  markHumanEdited(blockId: string): void;

  /**
   * Set review status for a block
   */
  setReviewStatus(blockId: string, status: ReviewStatus, reviewerId?: string): void;

  /**
   * Merge provenance when blocks are joined
   */
  mergeProvenance(sourceBlockId: string, targetBlockId: string): void;

  /**
   * Split provenance when a block is split
   */
  splitProvenance(originalBlockId: string, newBlockId: string): void;

  /**
   * Delete provenance for a block
   */
  deleteBlock(blockId: string): void;

  /**
   * Get all blocks with unreviewed AI content
   */
  getUnreviewedBlocks(): string[];

  /**
   * Get statistics
   */
  getStats(): ProvenanceStats;

  /**
   * Clear all provenance data
   */
  clear(): void;
}

/**
 * Provenance statistics
 */
export interface ProvenanceStats {
  /** Total blocks tracked */
  totalBlocks: number;

  /** Breakdown by origin */
  byOrigin: Record<ContentOrigin, number>;

  /** Breakdown by review status */
  byReviewStatus: Record<string, number>;

  /** Blocks with unreviewed content */
  unreviewedCount: number;
}

// ============================================================================
// In-Memory Implementation
// ============================================================================

/**
 * In-memory ProvenanceTracker implementation.
 */
export class InMemoryProvenanceTracker implements ProvenanceTracker {
  private provenance = new Map<string, AIBlockProvenance>();

  getProvenance(blockId: string): AIBlockProvenance | undefined {
    const prov = this.provenance.get(blockId);
    return prov ? { ...prov } : undefined;
  }

  initializeBlock(blockId: string, origin: ContentOrigin = "human"): void {
    if (!this.provenance.has(blockId)) {
      this.provenance.set(blockId, { origin });
    }
  }

  recordGeneration(blockId: string, record: AIGenerationRecord): void {
    const existing = this.provenance.get(blockId) ?? createHumanProvenance();
    this.provenance.set(blockId, addGenerationRecord(existing, record));
  }

  updateOrigin(blockId: string, origin: ContentOrigin): void {
    const existing = this.provenance.get(blockId);
    if (existing) {
      this.provenance.set(blockId, { ...existing, origin });
    } else {
      this.provenance.set(blockId, { origin });
    }
  }

  markHumanEdited(blockId: string): void {
    const existing = this.provenance.get(blockId);
    if (existing) {
      this.provenance.set(blockId, transitionToMixed(existing));
    }
  }

  setReviewStatus(blockId: string, status: ReviewStatus, reviewerId?: string): void {
    const existing = this.provenance.get(blockId);
    if (existing) {
      this.provenance.set(blockId, setReviewStatus(existing, status, reviewerId));
    }
  }

  mergeProvenance(sourceBlockId: string, targetBlockId: string): void {
    const source = this.provenance.get(sourceBlockId);
    const target = this.provenance.get(targetBlockId);

    if (!source) {
      return;
    }

    if (!target) {
      // Move source to target
      this.provenance.set(targetBlockId, source);
      this.provenance.delete(sourceBlockId);
      return;
    }

    // Merge: combine generations, determine resulting origin
    const mergedGenerations = [
      ...(target.ai_generations ?? []),
      ...(source.ai_generations ?? []),
    ].sort((a, b) => a.timestamp - b.timestamp);

    const mergedOrigin = this.computeMergedOrigin(source.origin, target.origin);

    this.provenance.set(targetBlockId, {
      origin: mergedOrigin,
      ai_generations: mergedGenerations.length > 0 ? mergedGenerations : undefined,
      review_status:
        source.review_status === "pending" || target.review_status === "pending"
          ? "pending"
          : target.review_status,
    });

    this.provenance.delete(sourceBlockId);
  }

  private computeMergedOrigin(a: ContentOrigin, b: ContentOrigin): ContentOrigin {
    // If either is mixed, result is mixed
    if (a === "mixed" || b === "mixed") {
      return "mixed";
    }
    // If both human, result is human
    if (a === "human" && b === "human") {
      return "human";
    }
    // If both AI, result is AI
    if (a === "ai" && b === "ai") {
      return "ai";
    }
    // Otherwise, mixed
    return "mixed";
  }

  splitProvenance(originalBlockId: string, newBlockId: string): void {
    const original = this.provenance.get(originalBlockId);
    if (original) {
      // New block inherits provenance from original
      this.provenance.set(newBlockId, { ...original });
    }
  }

  deleteBlock(blockId: string): void {
    this.provenance.delete(blockId);
  }

  getUnreviewedBlocks(): string[] {
    const result: string[] = [];
    for (const [blockId, prov] of this.provenance) {
      if (prov.origin !== "human" && prov.review_status === "pending") {
        result.push(blockId);
      }
    }
    return result;
  }

  getStats(): ProvenanceStats {
    const byOrigin: Record<ContentOrigin, number> = {
      human: 0,
      ai: 0,
      ai_assisted: 0,
      mixed: 0,
    };
    const byReviewStatus: Record<string, number> = {};
    let unreviewedCount = 0;

    for (const prov of this.provenance.values()) {
      byOrigin[prov.origin]++;

      if (prov.review_status) {
        byReviewStatus[prov.review_status] = (byReviewStatus[prov.review_status] ?? 0) + 1;
      }

      if (prov.origin !== "human" && prov.review_status === "pending") {
        unreviewedCount++;
      }
    }

    return {
      totalBlocks: this.provenance.size,
      byOrigin,
      byReviewStatus,
      unreviewedCount,
    };
  }

  clear(): void {
    this.provenance.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an in-memory provenance tracker
 */
export function createProvenanceTracker(): ProvenanceTracker {
  return new InMemoryProvenanceTracker();
}
