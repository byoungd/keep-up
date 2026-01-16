/**
 * Context Management Module
 *
 * Exports for context window management, token estimation,
 * and document context building.
 */

// Types
export type {
  BuiltContext,
  ContextSegment,
  ContextSegmentType,
  ContextWindowConfig,
  DocumentContextOptions,
  HistoryEntry,
  ModelContextLimits,
  TokenBudget,
  TokenCounter,
} from "./types";

export {
  DEFAULT_CONTEXT_LIMITS,
  MODEL_CONTEXT_LIMITS,
  SEGMENT_PRIORITY,
} from "./types";

// Context Window Manager
export {
  ContextWindowManager,
  createContextManager,
} from "./contextWindowManager";

// Document Context Builder
export {
  DocumentContextBuilder,
  createDocumentContextBuilder,
  type DocumentContext,
  type DocumentContextBuilderConfig,
} from "./documentContextBuilder";

// Token Estimation
export {
  estimateTokens,
  estimateMessagesTokens,
  truncateToTokens,
  splitIntoChunks,
  type TokenEstimateOptions,
} from "./tokenEstimator";
