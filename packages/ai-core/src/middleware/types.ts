/**
 * Response Middleware Types
 *
 * Defines the middleware chain for processing LLM responses,
 * including citation extraction and confidence flagging.
 *
 * Track B: Intelligence & Grounding
 */

import type { Message, TokenUsage } from "../providers/types";

// ============================================================================
// Core Middleware Types
// ============================================================================

/**
 * Middleware for processing LLM responses.
 * Middlewares are executed in priority order (lower = earlier).
 */
export interface ResponseMiddleware {
  /** Unique middleware name */
  name: string;
  /** Execution priority (lower runs first) */
  priority: number;
  /** Whether this middleware is enabled */
  enabled?: boolean;
  /**
   * Process the response.
   * Can modify the response or add flags/citations.
   */
  process(response: MiddlewareResponse, context: MiddlewareContext): Promise<MiddlewareResponse>;
}

/**
 * Response being processed through middleware chain.
 */
export interface MiddlewareResponse {
  /** Generated content (may be modified by middleware) */
  content: string;
  /** Extracted citations */
  citations: CitationRef[];
  /** Overall confidence score (0-1) */
  confidence: number;
  /** Flags for issues found */
  flags: ResponseFlag[];
  /** Original response metadata */
  metadata: ResponseMetadata;
}

/**
 * Context available to middleware during processing.
 */
export interface MiddlewareContext {
  /** Original messages sent to LLM */
  messages: Message[];
  /** Request options */
  options: MiddlewareRequestOptions;
  /** Source documents available for citation validation */
  sources?: SourceContext[];
  /** Trace ID for debugging */
  traceId?: string;
  /** Request ID */
  requestId?: string;
}

/**
 * Request options passed through middleware.
 */
export interface MiddlewareRequestOptions {
  /** User ID */
  userId?: string;
  /** Document ID */
  docId?: string;
  /** Model used */
  model?: string;
  /** Temperature */
  temperature?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Original response metadata preserved through middleware.
 */
export interface ResponseMetadata {
  /** Model that generated the response */
  model: string;
  /** Provider name */
  provider: string;
  /** Token usage */
  usage: TokenUsage;
  /** Latency in ms */
  latencyMs: number;
  /** Finish reason */
  finishReason: string;
}

// ============================================================================
// Citation Types
// ============================================================================

/**
 * Reference to a source document.
 */
export interface CitationRef {
  /** Source identifier (matches [sourceId] in content) */
  sourceId: string;
  /** Optional URL for the source */
  url?: string;
  /** Excerpt from the source that supports the claim */
  excerpt?: string;
  /** Confidence in this citation (0-1) */
  confidence: number;
  /** Position in content where citation appears */
  position?: {
    startOffset: number;
    endOffset: number;
  };
  /** Whether this citation was validated against sources */
  validated?: boolean;
}

/**
 * Source document context for citation validation.
 */
export interface SourceContext {
  /** Source identifier */
  id: string;
  /** Source title */
  title?: string;
  /** Source URL */
  url?: string;
  /** Source content (for validation) */
  content?: string;
  /** Key excerpts from source */
  excerpts?: string[];
  /** Source type */
  type?: "document" | "web" | "feed" | "user";
}

// ============================================================================
// Flag Types
// ============================================================================

/**
 * Flag indicating an issue with part of the response.
 */
export interface ResponseFlag {
  /** Type of issue */
  type: ResponseFlagType;
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: FlagSeverity;
  /** Text that triggered the flag */
  text?: string;
  /** Position in content */
  startOffset?: number;
  endOffset?: number;
  /** Suggested action */
  suggestion?: string;
}

/**
 * Types of response flags.
 */
export type ResponseFlagType =
  | "low_confidence" // Claim without strong support
  | "missing_citation" // Factual claim without citation
  | "unverified_claim" // Citation exists but couldn't be verified
  | "invalid_citation" // Citation references non-existent source
  | "hallucination_risk" // Content likely not from sources
  | "outdated_source" // Citation to potentially outdated source
  | "conflicting_sources"; // Multiple sources disagree

/**
 * Severity levels for flags.
 */
export type FlagSeverity = "info" | "warning" | "error";

// ============================================================================
// Processed Response Types
// ============================================================================

/**
 * Final processed response after middleware chain.
 */
export interface ProcessedResponse {
  /** Final content */
  content: string;
  /** All extracted citations */
  citations: CitationRef[];
  /** Overall confidence score */
  confidence: number;
  /** All flags from all middlewares */
  flags: ResponseFlag[];
  /** Grounding summary */
  grounding: GroundingSummary;
  /** Original response metadata */
  metadata: ResponseMetadata;
}

/**
 * Summary of how well the response is grounded in sources.
 */
export interface GroundingSummary {
  /** Number of citations found */
  citationCount: number;
  /** Number of citations validated */
  validatedCount: number;
  /** Number of sentences with citations */
  citedSentences: number;
  /** Total sentences in response */
  totalSentences: number;
  /** Grounding ratio (citedSentences / totalSentences) */
  groundingRatio: number;
  /** Whether response meets grounding requirements */
  meetsRequirements: boolean;
  /** Issues summary */
  issues: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for the middleware chain.
 */
export interface MiddlewareChainConfig {
  /** Middlewares to register */
  middlewares?: ResponseMiddleware[];
  /** Whether to fail on middleware errors (default: false) */
  failOnError?: boolean;
  /** Default confidence when not specified (default: 0.5) */
  defaultConfidence?: number;
  /** Minimum grounding ratio required (default: 0) */
  minGroundingRatio?: number;
  /** Logger for debugging */
  logger?: MiddlewareLogger;
}

/**
 * Configuration for citation middleware.
 */
export interface CitationMiddlewareConfig {
  /** Pattern for inline citations (default: /\[([^\]]+)\]/g) */
  citationPattern?: RegExp;
  /** Minimum confidence for uncited sentences (default: 0.3) */
  uncitedConfidence?: number;
  /** Keywords that indicate factual claims */
  factualKeywords?: string[];
  /** Whether to validate citations against sources (default: true) */
  validateCitations?: boolean;
  /** Whether to flag sentences without citations (default: true) */
  flagUncited?: boolean;
  /** Sentences with fewer words than this are not flagged (default: 5) */
  minSentenceWords?: number;
}

/**
 * Logger interface for middleware.
 */
export interface MiddlewareLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
