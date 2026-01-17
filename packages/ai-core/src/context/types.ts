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
import { MODEL_CATALOG } from "../catalog/models";

/** Known model context limits - Derived from MODEL_CATALOG */
export const MODEL_CONTEXT_LIMITS: Record<string, ModelContextLimits> = {};

// Initialize with catalog data
for (const model of MODEL_CATALOG) {
  // Heuristics for output limits based on provider/capabilities
  let maxOutput = 4096;
  if (model.id.includes("claude-3-5")) {
    maxOutput = 8192;
  } else if (model.id.includes("gpt-4o")) {
    maxOutput = 16384;
  } else if (model.supports.thinking) {
    maxOutput = 32000; // Thinking models usually allow more output
  }

  MODEL_CONTEXT_LIMITS[model.id] = {
    model: model.id,
    maxContextTokens: model.contextWindow,
    maxOutputTokens: maxOutput,
    recommendedOutputReserve: Math.min(maxOutput, 4096),
  };
}

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
