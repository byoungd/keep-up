/**
 * Context Management Module
 *
 * Exports for context window management, token estimation,
 * and document context building.
 */

// Context Window Manager
export {
  ContextWindowManager,
  createContextManager,
} from "./contextWindowManager";
// Document Context Builder
export {
  createDocumentContextBuilder,
  type DocumentContext,
  DocumentContextBuilder,
  type DocumentContextBuilderConfig,
} from "./documentContextBuilder";
// Token Estimation
export {
  estimateMessagesTokens,
  estimateTokens,
  splitIntoChunks,
  type TokenEstimateOptions,
  truncateToTokens,
} from "./tokenEstimator";
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
