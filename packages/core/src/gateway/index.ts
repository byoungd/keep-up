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

// Conflict Safety
export {
  type ConflictCheckResult,
  type ConflictMiddleware,
  checkAllPreconditions,
  checkConflicts,
  checkFrontier,
  checkSpanPrecondition,
  createConflictMiddleware,
  createMockDocumentProvider,
  type MockProviderConfig,
} from "./conflict.js";

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
  type ValidationError,
  validateGatewayRequest,
} from "./envelope.js";
// Gateway Controller
export {
  AIGateway,
  createAIGateway,
  createAIGatewayWithDefaults,
  createDefaultGatewayConfig,
  type GatewayConfig,
} from "./gateway.js";

// Dry-Run Pipeline
export {
  createPipelineBuilder,
  DEFAULT_PIPELINE_CONFIG,
  detectMaliciousPayload,
  executePipeline,
  PipelineBuilder,
  type PipelineConfig,
  type PipelineResult,
  type PipelineStage,
  SIZE_LIMITS,
  validatePayloadSize,
} from "./pipeline.js";

// Retry Playbook
export {
  createAggressiveRetryPolicy,
  createLenientRetryPolicy,
  createRetryState,
  createStrictRetryPolicy,
  executeRetryLoop,
  INITIAL_RETRY_STATE,
  isRetryable,
  performRebase,
  type RebaseProvider,
  type RebaseResult,
  type RelocationProvider,
  type RetryLoopResult,
  relocateAllSpans,
  relocateSpan,
  updateRequestAfterRebase,
  updateRetryState,
} from "./retry.js";
// Types
export * from "./types.js";
