/**
 * LFCC v0.9.1 — Edit Intent System
 *
 * Intent tracking for AI operations, enabling explainable edit chains
 * with full traceability and semantic understanding.
 *
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md §3.2
 */

// ============================================================================
// Intent Categories
// ============================================================================

/**
 * High-level categorization of editing intent.
 */
export type EditIntentCategory =
  | "content_creation" // Creating new content
  | "content_modification" // Modifying existing content
  | "structure_change" // Structural adjustments
  | "quality_improvement" // Quality enhancement
  | "review_feedback" // Review and feedback
  | "collaboration"; // Collaboration-related

// ============================================================================
// Intent Description
// ============================================================================

/**
 * Human-readable description of an intent.
 */
export interface IntentDescription {
  /** Short description (e.g., "Improve paragraph clarity") */
  short: string;

  /** Detailed explanation */
  detailed?: string;

  /** Locale code (e.g., "en-US", "zh-CN") */
  locale: string;
}

// ============================================================================
// Structured Intent
// ============================================================================

/**
 * Machine-readable structured intent for semantic analysis.
 */
export interface StructuredIntent {
  /** Action verb (e.g., "rewrite", "expand", "fix_grammar") */
  action: string;

  /** Target aspect (e.g., "clarity", "tone", "accuracy") */
  target_aspect?: string;

  /** Additional constraints */
  constraints?: Record<string, unknown>;
}

// ============================================================================
// User Context
// ============================================================================

/**
 * Optional context from user interaction.
 */
export interface UserContext {
  /** Original user request text */
  original_request?: string;

  /** Conversation ID for context */
  conversation_id?: string;

  /** Session ID */
  session_id?: string;
}

// ============================================================================
// Intent Chain
// ============================================================================

/**
 * Chain information for multi-step editing.
 */
export interface IntentChain {
  /** Parent intent ID in the chain */
  parent_intent_id?: string;

  /** Current step index (0-based) */
  step_index?: number;

  /** Total steps in the chain */
  total_steps?: number;
}

// ============================================================================
// Edit Intent
// ============================================================================

/**
 * Complete EditIntent structure.
 *
 * @requirement INTENT-001: Every AI operation MUST be associated with an EditIntent
 * @requirement INTENT-002: Intent description MUST provide at least the `short` field
 * @requirement INTENT-003: Multi-step edits MUST use the `chain` field
 */
export interface EditIntent {
  /** Unique intent identifier */
  id: string;

  /** Intent category */
  category: EditIntentCategory;

  /** Human-readable description */
  description: IntentDescription;

  /** Machine-readable structured intent */
  structured: StructuredIntent;

  /** User request context (optional) */
  user_context?: UserContext;

  /** Intent chain for multi-step edits */
  chain?: IntentChain;

  /** Agent ID that created this intent */
  agent_id?: string;

  /** Timestamp when created */
  created_at?: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

let intentCounter = 0;

/**
 * Generate a unique intent ID
 */
export function generateIntentId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (intentCounter++).toString(36).padStart(4, "0");
  const random = Math.random().toString(36).substring(2, 6);
  return `intent_${timestamp}_${counter}_${random}`;
}

/**
 * Create a minimal EditIntent
 */
export function createEditIntent(
  category: EditIntentCategory,
  shortDescription: string,
  action: string,
  options?: {
    detailed?: string;
    locale?: string;
    target_aspect?: string;
    constraints?: Record<string, unknown>;
    user_context?: UserContext;
    chain?: IntentChain;
    agent_id?: string;
  }
): EditIntent {
  return {
    id: generateIntentId(),
    category,
    description: {
      short: shortDescription,
      detailed: options?.detailed,
      locale: options?.locale ?? "en-US",
    },
    structured: {
      action,
      target_aspect: options?.target_aspect,
      constraints: options?.constraints,
    },
    user_context: options?.user_context,
    chain: options?.chain,
    agent_id: options?.agent_id,
    created_at: Date.now(),
  };
}

/**
 * Create a child intent in a chain
 */
export function createChainedIntent(
  parentIntent: EditIntent,
  category: EditIntentCategory,
  shortDescription: string,
  action: string,
  stepIndex: number,
  totalSteps: number,
  options?: Parameters<typeof createEditIntent>[3]
): EditIntent {
  return createEditIntent(category, shortDescription, action, {
    ...options,
    agent_id: options?.agent_id ?? parentIntent.agent_id,
    user_context: options?.user_context ?? parentIntent.user_context,
    chain: {
      parent_intent_id: parentIntent.id,
      step_index: stepIndex,
      total_steps: totalSteps,
    },
  });
}

// ============================================================================
// Intent Validation
// ============================================================================

/**
 * Validate an EditIntent structure
 */
export function validateIntent(intent: unknown): intent is EditIntent {
  if (typeof intent !== "object" || intent === null) {
    return false;
  }

  const obj = intent as Record<string, unknown>;

  // Required fields
  if (typeof obj.id !== "string") {
    return false;
  }
  if (typeof obj.category !== "string") {
    return false;
  }
  if (typeof obj.description !== "object" || obj.description === null) {
    return false;
  }
  if (typeof obj.structured !== "object" || obj.structured === null) {
    return false;
  }

  // Description validation
  const desc = obj.description as Record<string, unknown>;
  if (typeof desc.short !== "string") {
    return false;
  }
  if (typeof desc.locale !== "string") {
    return false;
  }

  // Structured validation
  const structured = obj.structured as Record<string, unknown>;
  if (typeof structured.action !== "string") {
    return false;
  }

  return true;
}

// ============================================================================
// Intent Category Utilities
// ============================================================================

/**
 * Get all valid intent categories
 */
export const ALL_INTENT_CATEGORIES: readonly EditIntentCategory[] = [
  "content_creation",
  "content_modification",
  "structure_change",
  "quality_improvement",
  "review_feedback",
  "collaboration",
] as const;

/**
 * Type guard for EditIntentCategory
 */
export function isIntentCategory(value: unknown): value is EditIntentCategory {
  return typeof value === "string" && ALL_INTENT_CATEGORIES.includes(value as EditIntentCategory);
}
