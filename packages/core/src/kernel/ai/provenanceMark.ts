/**
 * LFCC v0.9.1 — Provenance Mark Types
 *
 * Inline provenance marks for fine-grained content tracking within blocks.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.3
 */

import type { CanonMark } from "../canonicalizer/types";

// ============================================================================
// Extended Mark Types
// ============================================================================

/**
 * Extended CanonMark type including AI provenance marks.
 *
 * v0.9.1 adds three new mark types:
 * - ai_generated: Content was AI-generated
 * - ai_suggested: Content is an AI suggestion (pending acceptance)
 * - ai_reviewed: Content has been reviewed
 */
export type CanonMarkV2 = CanonMark | "ai_generated" | "ai_suggested" | "ai_reviewed";

// ============================================================================
// AI Provenance Mark
// ============================================================================

/**
 * Attributes for AI provenance marks.
 */
export interface AIProvenanceMarkAttrs {
  /** Reference to the generation record */
  generation_id: string;

  /** Agent that generated this content */
  agent_id: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Review status */
  review_status: "pending" | "approved" | "rejected";
}

/**
 * AI Generated mark - indicates inline content was AI-generated.
 */
export interface AIGeneratedMark {
  type: "ai_generated";
  attrs: AIProvenanceMarkAttrs;
}

/**
 * AI Suggested mark - indicates inline content is an AI suggestion.
 */
export interface AISuggestedMark {
  type: "ai_suggested";
  attrs: AIProvenanceMarkAttrs & {
    /** Original content being replaced (for diff display) */
    original_text?: string;
  };
}

/**
 * AI Reviewed mark - indicates inline content has been reviewed.
 */
export interface AIReviewedMark {
  type: "ai_reviewed";
  attrs: {
    /** Reviewer identifier */
    reviewed_by: string;

    /** Review timestamp */
    reviewed_at: number;

    /** Review decision */
    decision: "approved" | "rejected";
  };
}

/**
 * Union of all AI provenance mark types.
 */
export type AIProvenanceMark = AIGeneratedMark | AISuggestedMark | AIReviewedMark;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an AI generated mark
 */
export function createAIGeneratedMark(
  generationId: string,
  agentId: string,
  confidence: number
): AIGeneratedMark {
  return {
    type: "ai_generated",
    attrs: {
      generation_id: generationId,
      agent_id: agentId,
      confidence,
      review_status: "pending",
    },
  };
}

/**
 * Create an AI suggested mark
 */
export function createAISuggestedMark(
  generationId: string,
  agentId: string,
  confidence: number,
  originalText?: string
): AISuggestedMark {
  return {
    type: "ai_suggested",
    attrs: {
      generation_id: generationId,
      agent_id: agentId,
      confidence,
      review_status: "pending",
      original_text: originalText,
    },
  };
}

/**
 * Create an AI reviewed mark
 */
export function createAIReviewedMark(
  reviewedBy: string,
  decision: "approved" | "rejected"
): AIReviewedMark {
  return {
    type: "ai_reviewed",
    attrs: {
      reviewed_by: reviewedBy,
      reviewed_at: Date.now(),
      decision,
    },
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a mark is an AI provenance mark
 */
export function isAIProvenanceMark(mark: { type: string }): mark is AIProvenanceMark {
  return (
    mark.type === "ai_generated" || mark.type === "ai_suggested" || mark.type === "ai_reviewed"
  );
}

/**
 * Check if a mark type is an AI provenance type
 */
export function isAIProvenanceMarkType(type: string): type is AIProvenanceMark["type"] {
  return type === "ai_generated" || type === "ai_suggested" || type === "ai_reviewed";
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter AI provenance marks from a list of marks
 */
export function filterAIMarks<T extends { type: string }>(marks: T[]): T[] {
  return marks.filter((m) => isAIProvenanceMark(m));
}

/**
 * Check if any mark indicates unreviewed AI content
 */
export function hasUnreviewedAIMark<T extends { type: string; attrs?: { review_status?: string } }>(
  marks: T[]
): boolean {
  return marks.some(
    (m) =>
      (m.type === "ai_generated" || m.type === "ai_suggested") &&
      m.attrs?.review_status === "pending"
  );
}
