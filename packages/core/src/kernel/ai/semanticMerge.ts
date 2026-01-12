/**
 * LFCC v0.9.1 — Semantic Conflict Resolution Types
 *
 * Types for AI-assisted intelligent merge strategies that understand
 * edit intent and semantic compatibility.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.5
 */

import type { EditIntent } from "./intent";
import type { AIOpCode } from "./opcodes";

// ============================================================================
// Conflict Types
// ============================================================================

/**
 * Classification of conflict types.
 */
export type ConflictType =
  | "concurrent_edit" // Concurrent edits to same region
  | "structural_conflict" // Structural conflicts (e.g., split vs merge)
  | "semantic_conflict" // Semantic conflicts (contradictory intents)
  | "dependency_conflict"; // Dependency conflicts (task ordering issues)

// ============================================================================
// Conflict Parties
// ============================================================================

/**
 * Source of the conflicting operation.
 */
export type ConflictSource = "human" | "agent";

/**
 * Information about one party in a conflict.
 */
export interface ConflictParty {
  /** Source type */
  source: ConflictSource;

  /** Agent ID (if source is agent) */
  agent_id?: string;

  /** The operation that caused the conflict */
  operation: ConflictOperation;

  /** The intent behind the operation (if available) */
  intent?: EditIntent;

  /** Timestamp of the operation */
  timestamp: number;
}

/**
 * Operation information for conflict analysis.
 */
export interface ConflictOperation {
  /** Operation ID */
  operation_id: string;

  /** Operation code (for AI operations) */
  op_code?: AIOpCode;

  /** Operation type (for human operations) */
  op_type?: string;

  /** Affected content summary */
  affected_content?: string;
}

// ============================================================================
// Semantic Analysis
// ============================================================================

/**
 * Intent compatibility assessment.
 */
export type IntentCompatibility = "compatible" | "neutral" | "conflicting";

/**
 * Semantic analysis of a conflict.
 */
export interface SemanticAnalysis {
  /** How compatible are the intents */
  intent_compatibility: IntentCompatibility;

  /** Suggested resolution strategy */
  resolution_suggestion?: ResolutionStrategy;

  /** Confidence in the analysis */
  confidence: number;
}

// ============================================================================
// Semantic Conflict
// ============================================================================

/**
 * Complete semantic conflict representation.
 *
 * @requirement MERGE-001: Detection MUST consider EditIntent compatibility
 */
export interface SemanticConflict {
  /** Unique conflict identifier */
  conflict_id: string;

  /** Type of conflict */
  type: ConflictType;

  /** Parties involved in the conflict */
  parties: ConflictParty[];

  /** Blocks affected by the conflict */
  affected_blocks: string[];

  /** Affected character range (if applicable) */
  affected_range?: {
    start: number;
    end: number;
  };

  /** Semantic analysis (if performed) */
  semantic_analysis?: SemanticAnalysis;

  /** When the conflict was detected */
  detected_at: number;
}

// ============================================================================
// Resolution Strategies
// ============================================================================

/**
 * Strategy for resolving a conflict.
 */
export type ResolutionStrategy =
  | { type: "accept_left"; reason: string }
  | { type: "accept_right"; reason: string }
  | { type: "merge_both"; merged_content: string; explanation: string }
  | { type: "require_human"; reason: string }
  | { type: "defer"; until: string };

/**
 * Result of executing a merge.
 */
export interface MergeResult {
  /** Whether merge was successful */
  success: boolean;

  /** The strategy that was applied */
  strategy: ResolutionStrategy;

  /** Resulting content (if applicable) */
  result_content?: string;

  /** Affected blocks after merge */
  affected_blocks: string[];

  /** Error message (if not successful) */
  error?: string;

  /** Timestamp */
  merged_at: number;
}

/**
 * Result of validating a merge.
 */
export interface MergeValidationResult {
  /** Whether the merge is valid */
  valid: boolean;

  /** Validation issues */
  issues: Array<{
    severity: "error" | "warning";
    message: string;
  }>;
}

// ============================================================================
// Conflict Analysis
// ============================================================================

/**
 * Merge complexity levels.
 */
export type MergeComplexity = "trivial" | "simple" | "complex" | "impossible";

/**
 * Risk levels.
 */
export type RiskLevel = "none" | "low" | "medium" | "high";

/**
 * Complete analysis of a conflict.
 */
export interface ConflictAnalysis {
  /** Compatibility assessment */
  compatibility: {
    /** Can this be auto-merged */
    can_auto_merge: boolean;

    /** Complexity of the merge */
    merge_complexity: MergeComplexity;
  };

  /** Intent analysis */
  intent_analysis: {
    /** Are the intents aligned */
    intents_aligned: boolean;

    /** Combined intent (if compatible) */
    combined_intent?: EditIntent;
  };

  /** Risk assessment */
  risk_assessment: {
    /** Risk of data loss */
    data_loss_risk: RiskLevel;

    /** Risk of semantic drift */
    semantic_drift_risk: RiskLevel;
  };
}

// ============================================================================
// Merge Preferences
// ============================================================================

/**
 * Priority preference for merge resolution.
 */
export type MergePriority = "prefer_human" | "prefer_ai" | "prefer_recent" | "prefer_intent_match";

/**
 * AI autonomy level for merge resolution.
 */
export type AIAutonomy = "full" | "suggest_only" | "disabled";

/**
 * User preferences for merge resolution.
 *
 * @requirement MERGE-002: Auto merge MUST only execute when confidence >= threshold
 */
export interface MergePreferences {
  /** Priority setting */
  priority: MergePriority;

  /** AI autonomy level */
  ai_autonomy: AIAutonomy;

  /** Confidence threshold for auto-merge */
  confidence_threshold: number;
}

/**
 * Default merge preferences.
 */
export const DEFAULT_MERGE_PREFERENCES: MergePreferences = {
  priority: "prefer_human",
  ai_autonomy: "suggest_only",
  confidence_threshold: 0.85,
};

// ============================================================================
// Factory Functions
// ============================================================================

let conflictCounter = 0;

/**
 * Generate a unique conflict ID
 */
export function generateConflictId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (conflictCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `conflict_${timestamp}_${counter}_${random}`;
}

/**
 * Create a semantic conflict
 */
export function createSemanticConflict(
  type: ConflictType,
  parties: ConflictParty[],
  affectedBlocks: string[],
  options?: {
    affected_range?: { start: number; end: number };
    semantic_analysis?: SemanticAnalysis;
  }
): SemanticConflict {
  return {
    conflict_id: generateConflictId(),
    type,
    parties,
    affected_blocks: affectedBlocks,
    affected_range: options?.affected_range,
    semantic_analysis: options?.semantic_analysis,
    detected_at: Date.now(),
  };
}

/**
 * Create a "require human" resolution strategy
 */
export function requireHumanResolution(reason: string): ResolutionStrategy {
  return { type: "require_human", reason };
}

/**
 * Check if a resolution requires human intervention
 *
 * @requirement MERGE-003: Unresolvable conflicts MUST request human decision
 */
export function requiresHumanIntervention(strategy: ResolutionStrategy): boolean {
  return strategy.type === "require_human";
}
