/**
 * LFCC v0.9.1+ — AI-Native Constants
 *
 * Shared constants and configuration values for the AI-Native infrastructure.
 * Centralizes magic numbers and default values.
 */

// ============================================================================
// Confidence Thresholds
// ============================================================================

/** Confidence level considered "high" (auto-approve eligible) */
export const CONFIDENCE_HIGH = 0.85;

/** Confidence level considered "medium" (review suggested) */
export const CONFIDENCE_MEDIUM = 0.7;

/** Confidence level considered "low" (requires human review) */
export const CONFIDENCE_LOW = 0.5;

/** Default confidence for new operations */
export const CONFIDENCE_DEFAULT = 0.75;

// ============================================================================
// Streaming Defaults
// ============================================================================

/** Default character threshold for streaming commits */
export const STREAM_CHAR_THRESHOLD = 50;

/** Maximum buffer size before forced commit */
export const STREAM_MAX_BUFFER = 1000;

/** Default commit interval in milliseconds */
export const STREAM_COMMIT_INTERVAL_MS = 500;

/** Sentence-ending patterns for commit boundaries */
export const SENTENCE_ENDINGS_PATTERN = /[.!?。！？]\s*/g;

// ============================================================================
// Review Queue Limits
// ============================================================================

/** Maximum items in review queue */
export const REVIEW_QUEUE_MAX_ITEMS = 1000;

/** Maximum age of review items before escalation (ms) */
export const REVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// Audit Log Limits
// ============================================================================

/** Maximum audit log entries */
export const AUDIT_LOG_MAX_ENTRIES = 10000;

/** Audit log trim target (when max exceeded) */
export const AUDIT_LOG_TRIM_TARGET = 5000;

// ============================================================================
// Cross-Document Limits
// ============================================================================

/** Maximum documents in a single cross-doc operation */
export const CROSS_DOC_MAX_DOCUMENTS = 10;

/** Maximum references per document */
export const CROSS_DOC_MAX_REFS_PER_DOC = 100;

// ============================================================================
// ID Generation Prefixes
// ============================================================================

export const ID_PREFIX_INTENT = "intent_";
export const ID_PREFIX_STREAM = "stream_";
export const ID_PREFIX_SPECULATION = "spec_";
export const ID_PREFIX_CONFLICT = "conflict_";
export const ID_PREFIX_REFERENCE = "ref_";
export const ID_PREFIX_CROSS_DOC_OP = "xdoc_";
export const ID_PREFIX_AGENT_SESSION = "session_";

// ============================================================================
// Model ID Standards
// ============================================================================

/** Standardized model ID patterns */
export const MODEL_ID_PATTERNS = {
  anthropic: /^claude-\d+(-\w+)?$/,
  openai: /^gpt-\d+(-\w+)?$/,
  google: /^gemini-\d+(\.\d+)?(-\w+)?$/,
} as const;

/**
 * Validate model ID format
 */
export function isValidModelId(modelId: string): boolean {
  return Object.values(MODEL_ID_PATTERNS).some((pattern) => pattern.test(modelId));
}

// ============================================================================
// Version Constants
// ============================================================================

/** Current LFCC AI-Native protocol version */
export const LFCC_AI_NATIVE_VERSION = "0.9.1";

/** Minimum compatible version */
export const LFCC_AI_NATIVE_MIN_VERSION = "0.9.0";
