/**
 * LFCC v0.9 RC - Error Code Registry
 * @see docs/product/Audit/enhance/stage3/agent_2_observability.md
 *
 * Standardized error codes for all LFCC kernel operations.
 * Provides structured error handling with deterministic codes for diagnostics.
 */

// ============================================================================
// Error Code Ranges
// ============================================================================

/**
 * LFCC Error Codes
 *
 * Ranges:
 * - 1000-1999: Anchor/Integrity errors
 * - 2000-2999: Policy/Negotiation errors
 * - 3000-3999: AI/Sanitizer errors
 * - 4000-4999: Canonicalizer errors
 * - 5000-5999: BlockMapping errors
 * - 6000-6999: Shadow/Sync errors
 */
export enum LFCCErrorCodes {
  // ============================================================================
  // 1000-1999: Anchor/Integrity
  // ============================================================================

  /** Anchor checksum validation failed */
  ANCHOR_CHECKSUM_MISMATCH = 1001,
  /** Anchor encoding version not supported */
  ANCHOR_VERSION_UNSUPPORTED = 1002,
  /** Anchor block ID not found in document */
  ANCHOR_BLOCK_NOT_FOUND = 1003,
  /** Anchor range is out of bounds */
  ANCHOR_RANGE_OUT_OF_BOUNDS = 1004,
  /** Anchor context hash mismatch */
  ANCHOR_CONTEXT_MISMATCH = 1005,
  /** Anchor decode failed (malformed payload) */
  ANCHOR_DECODE_FAILED = 1006,
  /** Integrity verification failed */
  INTEGRITY_VERIFICATION_FAILED = 1010,
  /** Chain hash mismatch */
  CHAIN_HASH_MISMATCH = 1011,
  /** Checkpoint verification failed */
  CHECKPOINT_VERIFICATION_FAILED = 1012,

  // ============================================================================
  // 2000-2999: Policy/Negotiation
  // ============================================================================

  /** Policy manifest version mismatch */
  NEGOTIATION_VERSION_MISMATCH = 2001,
  /** Coordinate kind mismatch (critical) */
  NEGOTIATION_COORDS_MISMATCH = 2002,
  /** Anchor encoding version mismatch (critical) */
  NEGOTIATION_ANCHOR_VERSION_MISMATCH = 2003,
  /** Canonicalizer policy mismatch (critical) */
  NEGOTIATION_CANONICALIZER_MISMATCH = 2004,
  /** History policy mismatch (critical) */
  NEGOTIATION_HISTORY_MISMATCH = 2005,
  /** Block ID policy mismatch (critical) */
  NEGOTIATION_BLOCK_ID_MISMATCH = 2006,
  /** Unknown top-level field in manifest */
  MANIFEST_UNKNOWN_FIELD = 2010,
  /** Invalid manifest schema */
  MANIFEST_INVALID_SCHEMA = 2011,
  /** Empty manifest list provided */
  NEGOTIATION_EMPTY_MANIFESTS = 2012,

  // ============================================================================
  // 3000-3999: AI/Sanitizer
  // ============================================================================

  /** AI payload exceeds max size limit */
  AI_PAYLOAD_SIZE_EXCEEDED = 3001,
  /** AI payload exceeds max nesting depth */
  AI_PAYLOAD_DEPTH_EXCEEDED = 3002,
  /** AI payload exceeds max attribute count */
  AI_PAYLOAD_ATTRS_EXCEEDED = 3003,
  /** AI payload contains disallowed block type */
  AI_BLOCK_TYPE_DISALLOWED = 3004,
  /** AI payload contains disallowed mark type */
  AI_MARK_TYPE_DISALLOWED = 3005,
  /** AI payload contains malicious content */
  AI_MALICIOUS_CONTENT = 3006,
  /** AI dry-run validation failed */
  AI_DRYRUN_FAILED = 3010,
  /** AI sanitization failed */
  AI_SANITIZATION_FAILED = 3011,

  // ============================================================================
  // 4000-4999: Canonicalizer
  // ============================================================================

  /** Invalid URL in href attribute */
  CANONICALIZER_INVALID_URL = 4001,
  /** Non-link mark has href attribute */
  CANONICALIZER_NONLINK_HREF = 4002,
  /** Invalid input node structure */
  CANONICALIZER_INVALID_INPUT = 4003,
  /** Canonicalization recursion limit exceeded */
  CANONICALIZER_DEPTH_EXCEEDED = 4004,

  // ============================================================================
  // 5000-5999: BlockMapping
  // ============================================================================

  /** BlockMapping determinism violation */
  BLOCKMAPPING_NONDETERMINISTIC = 5001,
  /** BlockMapping monotonicity violation */
  BLOCKMAPPING_NONMONOTONIC = 5002,
  /** BlockMapping coverage gap */
  BLOCKMAPPING_COVERAGE_GAP = 5003,
  /** Invalid block transform */
  BLOCKMAPPING_INVALID_TRANSFORM = 5004,

  // ============================================================================
  // 6000-6999: Shadow/Sync
  // ============================================================================

  /** Shadow-editor divergence detected */
  SHADOW_DIVERGENCE = 6001,
  /** Structural conflict detected */
  SHADOW_STRUCTURAL_CONFLICT = 6002,
  /** Operation rejected (fail-closed) */
  SHADOW_OP_REJECTED = 6003,
  /** Sync timeout */
  SYNC_TIMEOUT = 6010,
  /** Sync connection lost */
  SYNC_CONNECTION_LOST = 6011,
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * LFCC Error with structured code and metadata
 */
export class LFCCError extends Error {
  /** Error code from LFCCErrorCodes */
  readonly code: LFCCErrorCodes;

  /** Error category derived from code range */
  readonly category: LFCCErrorCategory;

  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;

  /** Timestamp of error creation */
  readonly timestamp: number;

  constructor(code: LFCCErrorCodes, message: string, context?: Record<string, unknown>) {
    super(`[LFCC-${code}] ${message}`);
    this.name = "LFCCError";
    this.code = code;
    this.category = getErrorCategory(code);
    this.context = context;
    this.timestamp = Date.now();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LFCCError);
    }
  }

  /**
   * Convert to JSON for logging/telemetry
   */
  toJSON(): LFCCErrorJSON {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

export interface LFCCErrorJSON {
  name: string;
  code: LFCCErrorCodes;
  category: LFCCErrorCategory;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// Error Categories
// ============================================================================

export type LFCCErrorCategory =
  | "anchor"
  | "negotiation"
  | "ai"
  | "canonicalizer"
  | "blockmapping"
  | "shadow"
  | "unknown";

function getErrorCategory(code: LFCCErrorCodes): LFCCErrorCategory {
  if (code >= 1000 && code < 2000) {
    return "anchor";
  }
  if (code >= 2000 && code < 3000) {
    return "negotiation";
  }
  if (code >= 3000 && code < 4000) {
    return "ai";
  }
  if (code >= 4000 && code < 5000) {
    return "canonicalizer";
  }
  if (code >= 5000 && code < 6000) {
    return "blockmapping";
  }
  if (code >= 6000 && code < 7000) {
    return "shadow";
  }
  return "unknown";
}

// ============================================================================
// Error Factory
// ============================================================================

/**
 * Create a new LFCC error with the given code and message.
 * Use this factory for all error creation to ensure consistency.
 */
export function createLFCCError(
  code: LFCCErrorCodes,
  message: string,
  context?: Record<string, unknown>
): LFCCError {
  return new LFCCError(code, message, context);
}

// ============================================================================
// Convenience Factories
// ============================================================================

export const LFCCErrors = {
  // Anchor errors
  anchorChecksumMismatch: (blockId: string) =>
    createLFCCError(LFCCErrorCodes.ANCHOR_CHECKSUM_MISMATCH, "Anchor checksum mismatch", {
      blockId,
    }),

  anchorDecodeFailed: (reason: string) =>
    createLFCCError(LFCCErrorCodes.ANCHOR_DECODE_FAILED, `Anchor decode failed: ${reason}`),

  anchorBlockNotFound: (blockId: string) =>
    createLFCCError(LFCCErrorCodes.ANCHOR_BLOCK_NOT_FOUND, `Block not found: ${blockId}`, {
      blockId,
    }),

  // Negotiation errors
  negotiationVersionMismatch: (expected: string, actual: string) =>
    createLFCCError(
      LFCCErrorCodes.NEGOTIATION_VERSION_MISMATCH,
      `Version mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    ),

  negotiationCriticalMismatch: (field: string, values: string[]) =>
    createLFCCError(
      LFCCErrorCodes.NEGOTIATION_COORDS_MISMATCH,
      `Critical field mismatch: ${field}`,
      { field, values }
    ),

  manifestUnknownField: (field: string) =>
    createLFCCError(LFCCErrorCodes.MANIFEST_UNKNOWN_FIELD, `Unknown top-level field: ${field}`, {
      field,
    }),

  // AI errors
  aiPayloadSizeExceeded: (size: number, limit: number) =>
    createLFCCError(
      LFCCErrorCodes.AI_PAYLOAD_SIZE_EXCEEDED,
      `Payload size ${size} exceeds limit ${limit}`,
      { size, limit }
    ),

  aiPayloadDepthExceeded: (depth: number, limit: number) =>
    createLFCCError(
      LFCCErrorCodes.AI_PAYLOAD_DEPTH_EXCEEDED,
      `Nesting depth ${depth} exceeds limit ${limit}`,
      { depth, limit }
    ),

  aiPayloadAttrsExceeded: (count: number, limit: number) =>
    createLFCCError(
      LFCCErrorCodes.AI_PAYLOAD_ATTRS_EXCEEDED,
      `Attribute count ${count} exceeds limit ${limit}`,
      { count, limit }
    ),

  // Canonicalizer errors
  canonicalizerInvalidUrl: (url: string) =>
    createLFCCError(LFCCErrorCodes.CANONICALIZER_INVALID_URL, `Invalid URL: ${url}`, { url }),

  // Shadow errors
  shadowDivergence: (details: string) =>
    createLFCCError(LFCCErrorCodes.SHADOW_DIVERGENCE, `Shadow-editor divergence: ${details}`),

  structuralConflict: (blockId: string, opType: string) =>
    createLFCCError(
      LFCCErrorCodes.SHADOW_STRUCTURAL_CONFLICT,
      `Structural conflict on ${blockId}: ${opType}`,
      { blockId, opType }
    ),
} as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is an LFCCError
 */
export function isLFCCError(error: unknown): error is LFCCError {
  return error instanceof LFCCError;
}

/**
 * Check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: LFCCErrorCodes): boolean {
  return isLFCCError(error) && error.code === code;
}

/**
 * Check if an error is in a specific category
 */
export function hasErrorCategory(error: unknown, category: LFCCErrorCategory): boolean {
  return isLFCCError(error) && error.category === category;
}
