/**
 * Context Management Types
 *
 * Type definitions for context window management, including
 * token budgeting, context prioritization, and document context building.
 */

/** Context segment types with priority levels */
export type ContextSegmentType =
  | "system" // System prompt (highest priority)
  | "instructions" // User instructions
  | "document" // Current document content
  | "selection" // Selected text
  | "history" // Conversation history
  | "reference" // Referenced documents/sources
  | "metadata"; // Document metadata

/** Priority levels for context segments */
export const SEGMENT_PRIORITY: Record<ContextSegmentType, number> = {
  system: 100,
  instructions: 90,
  selection: 80,
  document: 70,
  history: 60,
  reference: 50,
  metadata: 40,
};

/** A segment of context to include in the prompt */
export interface ContextSegment {
  /** Segment type */
  type: ContextSegmentType;
  /** Content text */
  content: string;
  /** Estimated token count */
  tokenCount: number;
  /** Priority (higher = more important) */
  priority: number;
  /** Whether this segment can be truncated */
  canTruncate: boolean;
  /** Minimum tokens to keep if truncated */
  minTokens?: number;
  /** Metadata for tracking */
  metadata?: Record<string, unknown>;
}

/** Model context limits */
export interface ModelContextLimits {
  /** Model identifier */
  model: string;
  /** Maximum context tokens */
  maxContextTokens: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Recommended reserve for output */
  recommendedOutputReserve: number;
}

/** Known model context limits */
export const MODEL_CONTEXT_LIMITS: Record<string, ModelContextLimits> = {
  // OpenAI
  "gpt-4o": {
    model: "gpt-4o",
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    recommendedOutputReserve: 4096,
  },
  "gpt-4o-mini": {
    model: "gpt-4o-mini",
    maxContextTokens: 128000,
    maxOutputTokens: 16384,
    recommendedOutputReserve: 4096,
  },
  "gpt-4-turbo": {
    model: "gpt-4-turbo",
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
    recommendedOutputReserve: 2048,
  },
  "gpt-4": {
    model: "gpt-4",
    maxContextTokens: 8192,
    maxOutputTokens: 4096,
    recommendedOutputReserve: 2048,
  },
  "gpt-3.5-turbo": {
    model: "gpt-3.5-turbo",
    maxContextTokens: 16385,
    maxOutputTokens: 4096,
    recommendedOutputReserve: 2048,
  },
  // Anthropic
  "claude-opus-4-20250514": {
    model: "claude-opus-4-20250514",
    maxContextTokens: 200000,
    maxOutputTokens: 32000,
    recommendedOutputReserve: 8192,
  },
  "claude-sonnet-4-20250514": {
    model: "claude-sonnet-4-20250514",
    maxContextTokens: 200000,
    maxOutputTokens: 64000,
    recommendedOutputReserve: 8192,
  },
  "claude-3-5-sonnet-20241022": {
    model: "claude-3-5-sonnet-20241022",
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    recommendedOutputReserve: 4096,
  },
  "claude-3-5-haiku-20241022": {
    model: "claude-3-5-haiku-20241022",
    maxContextTokens: 200000,
    maxOutputTokens: 8192,
    recommendedOutputReserve: 4096,
  },
  "claude-3-opus-20240229": {
    model: "claude-3-opus-20240229",
    maxContextTokens: 200000,
    maxOutputTokens: 4096,
    recommendedOutputReserve: 2048,
  },
};

/** Default context limits for unknown models */
export const DEFAULT_CONTEXT_LIMITS: ModelContextLimits = {
  model: "default",
  maxContextTokens: 8192,
  maxOutputTokens: 2048,
  recommendedOutputReserve: 1024,
};

/** Token budget allocation */
export interface TokenBudget {
  /** Total available tokens */
  total: number;
  /** Reserved for output */
  outputReserve: number;
  /** Available for context */
  contextAvailable: number;
  /** Allocated by segment type */
  allocated: Record<ContextSegmentType, number>;
  /** Remaining unallocated */
  remaining: number;
}

/** Token counter interface for accurate token estimation */
export interface TokenCounter {
  /** Count tokens for a text payload */
  countTokens: (text: string) => number;
}

/** Context window configuration */
export interface ContextWindowConfig {
  /** Model to use */
  model: string;
  /** Custom max tokens (overrides model default) */
  maxTokens?: number;
  /** Custom output reserve */
  outputReserve?: number;
  /** Segment budget overrides (as percentage of available) */
  segmentBudgets?: Partial<Record<ContextSegmentType, number>>;
  /** Optional token counter override */
  tokenCounter?: TokenCounter;
}

/** Built context ready for LLM */
export interface BuiltContext {
  /** Ordered segments included in context */
  segments: ContextSegment[];
  /** Total token count */
  totalTokens: number;
  /** Token budget used */
  budget: TokenBudget;
  /** Segments that were truncated */
  truncatedSegments: string[];
  /** Segments that were dropped */
  droppedSegments: string[];
}

/** Document context options */
export interface DocumentContextOptions {
  /** Document ID */
  docId: string;
  /** Full document content */
  content: string;
  /** Current cursor position (UTF-16 offset) */
  cursorPosition?: number;
  /** Current selection range */
  selection?: { start: number; end: number };
  /** Document title */
  title?: string;
  /** Document metadata */
  metadata?: Record<string, unknown>;
  /** Maximum tokens for document context */
  maxTokens?: number;
  /** Whether to prioritize around cursor */
  prioritizeCursor?: boolean;
}

/** Conversation history entry */
export interface HistoryEntry {
  /** Role */
  role: "user" | "assistant";
  /** Content */
  content: string;
  /** Timestamp */
  timestamp: number;
  /** Token count */
  tokenCount?: number;
}
