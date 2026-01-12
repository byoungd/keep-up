/**
 * LFCC v0.9 RC - AI Gateway Module
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md
 *
 * AI Gateway for LFCC-compliant mutations:
 * - Request/Response envelope
 * - Dry-run pipeline (sanitize → normalize → schema validate)
 * - Conflict safety (pessimistic locking)
 * - Client retry playbook
 */

// Types
export * from "./types";

// Envelope
export {
  createGateway409,
  createGatewayError,
  createGatewayRequest,
  createGatewayResponse,
  createTargetSpan,
  isGateway409,
  isGatewayError,
  isGatewaySuccess,
  parseGatewayRequest,
  validateGatewayRequest,
  type ValidationError,
} from "./envelope";

// Conflict Safety
export {
  checkAllPreconditions,
  checkConflicts,
  checkFrontier,
  checkSpanPrecondition,
  createConflictMiddleware,
  createMockDocumentProvider,
  type ConflictCheckResult,
  type ConflictMiddleware,
  type MockProviderConfig,
} from "./conflict";

// Dry-Run Pipeline
export {
  DEFAULT_PIPELINE_CONFIG,
  PipelineBuilder,
  SIZE_LIMITS,
  createPipelineBuilder,
  detectMaliciousPayload,
  executePipeline,
  validatePayloadSize,
  type PipelineConfig,
  type PipelineResult,
  type PipelineStage,
} from "./pipeline";

// Retry Playbook
export {
  INITIAL_RETRY_STATE,
  createAggressiveRetryPolicy,
  createLenientRetryPolicy,
  createRetryState,
  createStrictRetryPolicy,
  executeRetryLoop,
  isRetryable,
  performRebase,
  relocateAllSpans,
  relocateSpan,
  updateRequestAfterRebase,
  updateRetryState,
  type RebaseProvider,
  type RebaseResult,
  type RelocationProvider,
  type RetryLoopResult,
} from "./retry";

// Gateway Controller
export {
  AIGateway,
  createAIGateway,
  createAIGatewayWithDefaults,
  createDefaultGatewayConfig,
  type GatewayConfig,
} from "./gateway";
