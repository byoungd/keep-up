/**
 * LFCC v0.9.1 - AI Module
 *
 * Re-exports all AI-related types and utilities:
 * - v0.9: Gateway, DryRun, Sanitization
 * - v0.9.1: OpCodes, Intent, Provenance
 */

// ============================================================================
// v0.9.1 AI-Native Enhancements
// ============================================================================
// Phase 1: OpCodes & Intent
export * from "./opcodes.js";
export * from "./intent.js";
export * from "./intentRegistry.js";

// Phase 2: Provenance
export * from "./provenance.js";
export * from "./provenanceTracker.js";
export * from "./provenanceMark.js";

// Phase 3: Multi-Agent Coordination
export * from "./agentIdentity.js";
export * from "./agentCoordinator.js";

// Phase 4: Semantic Conflict Resolution
export * from "./semanticMerge.js";
export * from "./semanticMergeEngine.js";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P0)
// ============================================================================
export * from "./streaming.js";
export * from "./speculation.js";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P1)
// ============================================================================
export * from "./documentContext.js";
export * from "./confidenceUI.js";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P2)
// ============================================================================
export * from "./crossDocument.js";
export * from "./dynamicSafety.js";

// ============================================================================
// v0.9.1+ Infrastructure
// ============================================================================
export * from "./constants.js";
export * from "./validation.js";

// ============================================================================
// v0.9 AI Gateway & Validation
// ============================================================================
export {
  createPassThroughValidator,
  createPatternRejectValidator,
  dryRunAIPayload,
  dryRunStructural,
  type StructuralOp,
  type StructuralPreview,
} from "./dryRun.js";
export {
  create409Conflict,
  createAIRequestEnvelope,
  DEFAULT_AI_ENVELOPE_RETRY_POLICY,
  generateRequestId,
  is409Conflict,
  isSuccessResponse,
  isUnprocessableResponse,
  normalizeAIRequestEnvelope,
  normalizeDocFrontier,
  normalizeRequestIdentifiers,
  validatePreconditions,
  type AIEnvelopeConflict,
  type AIEnvelopeDiagnostic,
  type AIEnvelopeError,
  type AIEnvelopeOptions,
  type AIEnvelopePolicyContext,
  type AIEnvelopeResponse,
  type AIEnvelopeRetryPolicy,
  type AIEnvelopeSuccess,
  type AIEnvelopeUnprocessable,
} from "./envelope.js";
export { createSanitizer } from "./sanitizer.js";
export * from "./types.js";
export * from "./context.js";

// Killer Features
export * from "./liquidRefactoring.js";
export * from "./ghostCollaborator.js";
export * from "./semanticTimeTravel.js";
