/**
 * LFCC v0.9.1 — Content Provenance Types
 *
 * Track AI-generated content origin at block and inline levels.
 * Enables complete audit trail for AI-assisted editing.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.3
 */

import type { AIOpCode } from "./opcodes.js";

// ============================================================================
// Content Origin
// ============================================================================

/**
 * Classification of content origin.
 */
export type ContentOrigin =
  | "human" // Entirely human-authored
  | "ai" // Entirely AI-generated
  | "ai_assisted" // Human-initiated, AI-refined
  | "mixed"; // Contains both human and AI content

// ============================================================================
// Review Status
// ============================================================================

/**
 * Review status for AI-generated content.
 */
export type ReviewStatus =
  | "pending" // Not yet reviewed
  | "approved" // Reviewed and approved
  | "rejected" // Reviewed and rejected
  | "modified"; // Reviewed and modified

// ============================================================================
// AI Generation Record
// ============================================================================

/**
 * Agent information for a generation event.
 */
export interface GenerationAgent {
  /** Unique agent identifier */
  agent_id: string;

  /** Agent type (writer, editor, translator, etc.) */
  agent_type: string;

  /** Model identifier */
  model_id: string;
}

/**
 * Operation information for a generation event.
 */
export interface GenerationOperation {
  /** The operation code used */
  op_code: AIOpCode;

  /** Reference to the EditIntent */
  intent_id: string;
}

/**
 * Quality signals for generated content.
 */
export interface QualitySignals {
  /** Confidence score (0-1) */
  confidence: number;

  /** Factuality check result */
  factuality_check?: "passed" | "failed" | "uncertain";

  /** Style match score (0-1) */
  style_match?: number;
}

/**
 * Record of a single AI generation event.
 *
 * @requirement PROV-001: AI-generated content MUST carry ai_provenance information
 */
export interface AIGenerationRecord {
  /** Unique generation identifier */
  generation_id: string;

  /** Timestamp when generated */
  timestamp: number;

  /** Agent that generated this content */
  agent: GenerationAgent;

  /** Operation information */
  operation: GenerationOperation;

  /** Affected range within the block (relative offsets) */
  affected_range?: {
    start: number;
    end: number;
  };

  /** Quality signals */
  quality_signals?: QualitySignals;
}

// ============================================================================
// Block-Level Provenance
// ============================================================================

/**
 * Provenance information for a block.
 *
 * @requirement PROV-002: Provenance MUST remain consistent across CRDT sync
 * @requirement PROV-003: Human edits to AI content MUST update origin to "mixed"
 */
export interface AIBlockProvenance {
  /** Content origin classification */
  origin: ContentOrigin;

  /** List of AI generation events (most recent last) */
  ai_generations?: AIGenerationRecord[];

  /** Current review status */
  review_status?: ReviewStatus;

  /** Reviewer identifier */
  reviewed_by?: string;

  /** Review timestamp */
  reviewed_at?: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

let generationCounter = 0;

/**
 * Generate a unique generation ID
 */
export function generateGenerationId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (generationCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `gen_${timestamp}_${counter}_${random}`;
}

/**
 * Create a new AIGenerationRecord
 */
export function createGenerationRecord(
  agentId: string,
  agentType: string,
  modelId: string,
  opCode: AIOpCode,
  intentId: string,
  options?: {
    affected_range?: { start: number; end: number };
    quality_signals?: QualitySignals;
  }
): AIGenerationRecord {
  return {
    generation_id: generateGenerationId(),
    timestamp: Date.now(),
    agent: {
      agent_id: agentId,
      agent_type: agentType,
      model_id: modelId,
    },
    operation: {
      op_code: opCode,
      intent_id: intentId,
    },
    affected_range: options?.affected_range,
    quality_signals: options?.quality_signals,
  };
}

/**
 * Create initial human provenance
 */
export function createHumanProvenance(): AIBlockProvenance {
  return {
    origin: "human",
  };
}

/**
 * Create AI provenance from a generation record
 */
export function createAIProvenance(record: AIGenerationRecord): AIBlockProvenance {
  return {
    origin: "ai",
    ai_generations: [record],
    review_status: "pending",
  };
}

/**
 * Transition origin when human edits AI content
 */
export function transitionToMixed(provenance: AIBlockProvenance): AIBlockProvenance {
  if (provenance.origin === "human") {
    return provenance;
  }
  return {
    ...provenance,
    origin: "mixed",
  };
}

/**
 * Add a generation record to existing provenance
 */
export function addGenerationRecord(
  provenance: AIBlockProvenance,
  record: AIGenerationRecord
): AIBlockProvenance {
  const generations = [...(provenance.ai_generations ?? []), record];

  // If was human, now becomes ai_assisted
  let origin = provenance.origin;
  if (origin === "human") {
    origin = "ai_assisted";
  }

  return {
    ...provenance,
    origin,
    ai_generations: generations,
    review_status: "pending", // Reset review status on new generation
  };
}

/**
 * Set review status
 */
export function setReviewStatus(
  provenance: AIBlockProvenance,
  status: ReviewStatus,
  reviewerId?: string
): AIBlockProvenance {
  return {
    ...provenance,
    review_status: status,
    reviewed_by: reviewerId,
    reviewed_at: Date.now(),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if provenance has unreviewed AI generations
 */
export function hasUnreviewedContent(provenance: AIBlockProvenance): boolean {
  if (provenance.origin === "human") {
    return false;
  }
  return provenance.review_status === "pending";
}

/**
 * Get the most recent generation record
 */
export function getLatestGeneration(provenance: AIBlockProvenance): AIGenerationRecord | undefined {
  const generations = provenance.ai_generations;
  if (!generations || generations.length === 0) {
    return undefined;
  }
  return generations[generations.length - 1];
}

/**
 * Count total AI generations
 */
export function countGenerations(provenance: AIBlockProvenance): number {
  return provenance.ai_generations?.length ?? 0;
}
