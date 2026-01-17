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

// Citation Middleware
export {
  CitationMiddleware,
  createCitationMiddleware,
} from "./citationMiddleware";

// Middleware Chain
export {
  createMiddlewareChain,
  createSimpleMiddleware,
  MiddlewareChain,
} from "./middlewareChain";
// Types
export type {
  CitationMiddlewareConfig,
  CitationRef,
  FlagSeverity,
  GroundingSummary,
  MiddlewareChainConfig,
  MiddlewareContext,
  MiddlewareLogger,
  MiddlewareRequestOptions,
  MiddlewareResponse,
  ProcessedResponse,
  ResponseFlag,
  ResponseFlagType,
  ResponseMetadata,
  ResponseMiddleware,
  SourceContext,
} from "./types";
