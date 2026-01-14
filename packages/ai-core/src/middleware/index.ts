/**
 * Response Middleware
 *
 * Provides a middleware chain for processing LLM responses,
 * including citation extraction and grounding validation.
 *
 * @example
 * ```typescript
 * import { createMiddlewareChain, createCitationMiddleware } from '@ku0/ai-core';
 *
 * const chain = createMiddlewareChain({
 *   middlewares: [createCitationMiddleware()],
 *   minGroundingRatio: 0.5,
 * });
 *
 * const processed = await chain.process(llmResponse, {
 *   messages,
 *   options: { userId: 'user-123' },
 *   sources: [{ id: 'doc1', title: 'Source Document', content: '...' }],
 * });
 *
 * console.log(processed.grounding);
 * // { citationCount: 3, groundingRatio: 0.75, meetsRequirements: true, ... }
 * ```
 *
 * Track B: Intelligence & Grounding
 */

// Types
export type {
  ResponseMiddleware,
  MiddlewareResponse,
  MiddlewareContext,
  MiddlewareRequestOptions,
  ResponseMetadata,
  CitationRef,
  SourceContext,
  ResponseFlag,
  ResponseFlagType,
  FlagSeverity,
  ProcessedResponse,
  GroundingSummary,
  MiddlewareChainConfig,
  CitationMiddlewareConfig,
  MiddlewareLogger,
} from "./types";

// Middleware Chain
export {
  MiddlewareChain,
  createMiddlewareChain,
  createSimpleMiddleware,
} from "./middlewareChain";

// Citation Middleware
export {
  CitationMiddleware,
  createCitationMiddleware,
} from "./citationMiddleware";
