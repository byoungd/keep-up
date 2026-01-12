/**
 * LFCC v0.9.1 — AI Operation Codes (OpCodes)
 *
 * Dedicated operation types for AI-assisted editing with semantic metadata.
 * These OpCodes enable intent tracking, provenance, and semantic conflict resolution.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.1
 */

import type { EditIntent } from "./intent";

// ============================================================================
// AI OpCode Taxonomy
// ============================================================================

/** Content Generation OpCodes */
export type AIOpCodeGenerate =
  | "OP_AI_GENERATE" // Generate new content
  | "OP_AI_EXPAND" // Expand existing content
  | "OP_AI_SUMMARIZE"; // Summarize/compress content

/** Content Modification OpCodes */
export type AIOpCodeModify =
  | "OP_AI_REWRITE" // Rewrite/rephrase
  | "OP_AI_TRANSLATE" // Translate content
  | "OP_AI_REFINE" // Polish/optimize
  | "OP_AI_CORRECT"; // Fix errors (grammar/spelling)

/** Structural Operation OpCodes */
export type AIOpCodeStructure =
  | "OP_AI_RESTRUCTURE" // Reorganize structure
  | "OP_AI_FORMAT" // Format content
  | "OP_AI_SPLIT_MERGE"; // Intelligent split/merge

/** Review Operation OpCodes */
export type AIOpCodeReview =
  | "OP_AI_REVIEW" // Review/comment
  | "OP_AI_SUGGEST" // Suggestion (accept/reject)
  | "OP_AI_VALIDATE"; // Validate/confirm

/** Collaboration Operation OpCodes */
export type AIOpCodeCollaboration =
  | "OP_AI_HANDOFF" // Inter-agent handoff
  | "OP_AI_DELEGATE" // Delegate subtask
  | "OP_AI_MERGE_RESOLVE"; // Intelligent conflict resolution

/**
 * Complete AI Operation Code type.
 * All AI operations MUST be classified with one of these codes.
 */
export type AIOpCode =
  | AIOpCodeGenerate
  | AIOpCodeModify
  | AIOpCodeStructure
  | AIOpCodeReview
  | AIOpCodeCollaboration;

// ============================================================================
// OpCode Utilities
// ============================================================================

/** All valid AI OpCodes */
export const ALL_AI_OPCODES: readonly AIOpCode[] = [
  // Generation
  "OP_AI_GENERATE",
  "OP_AI_EXPAND",
  "OP_AI_SUMMARIZE",
  // Modification
  "OP_AI_REWRITE",
  "OP_AI_TRANSLATE",
  "OP_AI_REFINE",
  "OP_AI_CORRECT",
  // Structural
  "OP_AI_RESTRUCTURE",
  "OP_AI_FORMAT",
  "OP_AI_SPLIT_MERGE",
  // Review
  "OP_AI_REVIEW",
  "OP_AI_SUGGEST",
  "OP_AI_VALIDATE",
  // Collaboration
  "OP_AI_HANDOFF",
  "OP_AI_DELEGATE",
  "OP_AI_MERGE_RESOLVE",
] as const;

/** OpCodes that require human approval by default */
export const APPROVAL_REQUIRED_OPCODES: readonly AIOpCode[] = [
  "OP_AI_RESTRUCTURE",
  "OP_AI_SPLIT_MERGE",
  "OP_AI_MERGE_RESOLVE",
] as const;

/** OpCodes that are read-only (no document mutation) */
export const READONLY_OPCODES: readonly AIOpCode[] = ["OP_AI_REVIEW", "OP_AI_VALIDATE"] as const;

/**
 * Type guard for AIOpCode
 */
export function isAIOpCode(value: unknown): value is AIOpCode {
  return typeof value === "string" && ALL_AI_OPCODES.includes(value as AIOpCode);
}

/**
 * Check if an OpCode requires human approval
 */
export function requiresApproval(opCode: AIOpCode): boolean {
  return APPROVAL_REQUIRED_OPCODES.includes(opCode);
}

/**
 * Check if an OpCode is read-only
 */
export function isReadOnlyOpCode(opCode: AIOpCode): boolean {
  return READONLY_OPCODES.includes(opCode);
}

/**
 * Get the category of an AIOpCode
 */
export function getOpCodeCategory(
  opCode: AIOpCode
): "generation" | "modification" | "structure" | "review" | "collaboration" {
  switch (opCode) {
    case "OP_AI_GENERATE":
    case "OP_AI_EXPAND":
    case "OP_AI_SUMMARIZE":
      return "generation";
    case "OP_AI_REWRITE":
    case "OP_AI_TRANSLATE":
    case "OP_AI_REFINE":
    case "OP_AI_CORRECT":
      return "modification";
    case "OP_AI_RESTRUCTURE":
    case "OP_AI_FORMAT":
    case "OP_AI_SPLIT_MERGE":
      return "structure";
    case "OP_AI_REVIEW":
    case "OP_AI_SUGGEST":
    case "OP_AI_VALIDATE":
      return "review";
    case "OP_AI_HANDOFF":
    case "OP_AI_DELEGATE":
    case "OP_AI_MERGE_RESOLVE":
      return "collaboration";
  }
}

// ============================================================================
// AI Provenance
// ============================================================================

/**
 * Provenance information for an AI operation.
 * Tracks the model, prompt, and rationale that produced the operation.
 */
export interface AIProvenance {
  /** Model identifier (e.g., "claude-3-opus", "gpt-4") */
  model_id: string;

  /** Model version string */
  model_version?: string;

  /** SHA-256 hash of the prompt (original prompt not stored for privacy) */
  prompt_hash?: string;

  /** Identifier for the prompt template */
  prompt_template_id?: string;

  /** Temperature setting used */
  temperature?: number;

  /** Hashes of input context slices */
  input_context_hashes?: string[];

  /** Short rationale summary (no chain-of-thought) */
  rationale_summary?: string;

  /** Timestamp when generated */
  generated_at?: number;
}

// ============================================================================
// AI Operation Metadata
// ============================================================================

/**
 * Confidence scoring for AI operations.
 */
export interface AIConfidence {
  /** Confidence score (0-1) */
  score: number;

  /** Source of calibration */
  calibration_source?: string;
}

/**
 * Complete metadata for an AI operation.
 * Every AI operation MUST carry valid AIOperationMeta.
 *
 * @requirement AI-OP-001: AI operations MUST carry valid AIOperationMeta
 * @requirement AI-OP-002: agent_id MUST uniquely identify the Agent instance
 * @requirement AI-OP-003: provenance.model_id MUST use standardized identifiers
 */
export interface AIOperationMeta {
  /** The operation code */
  op_code: AIOpCode;

  /** Unique agent identifier */
  agent_id: string;

  /** Reference to the EditIntent (optional for backward compatibility) */
  intent_id?: string;

  /** Inline intent payload (optional) */
  intent?: EditIntent;

  /** Provenance information */
  provenance: AIProvenance;

  /** Confidence scoring */
  confidence: AIConfidence;

  /** IDs of prior operations this depends on */
  depends_on?: string[];

  /** IDs of prior operations this replaces */
  supersedes?: string[];

  /** Unique operation ID */
  operation_id?: string;

  /** Timestamp */
  timestamp?: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a minimal AIProvenance object
 */
export function createProvenance(
  modelId: string,
  promptHash?: string,
  options?: Partial<Omit<AIProvenance, "model_id" | "prompt_hash">>
): AIProvenance {
  return {
    model_id: modelId,
    ...(promptHash ? { prompt_hash: promptHash } : {}),
    generated_at: Date.now(),
    ...options,
  };
}

/**
 * Create a minimal AIOperationMeta object
 */
export function createOperationMeta(
  opCode: AIOpCode,
  agentId: string,
  provenance: AIProvenance,
  confidence: number,
  options?: Partial<Omit<AIOperationMeta, "op_code" | "agent_id" | "provenance" | "confidence">>
): AIOperationMeta {
  return {
    op_code: opCode,
    agent_id: agentId,
    provenance,
    confidence: { score: confidence },
    timestamp: Date.now(),
    ...options,
  };
}
