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
export * from "./opcodes";
export * from "./intent";
export * from "./intentRegistry";

// Phase 2: Provenance
export * from "./provenance";
export * from "./provenanceTracker";
export * from "./provenanceMark";

// Phase 3: Multi-Agent Coordination
export * from "./agentIdentity";
export * from "./agentCoordinator";

// Phase 4: Semantic Conflict Resolution
export * from "./semanticMerge";
export * from "./semanticMergeEngine";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P0)
// ============================================================================
export * from "./streaming";
export * from "./speculation";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P1)
// ============================================================================
export * from "./documentContext";
export * from "./confidenceUI";

// ============================================================================
// v0.9.1+ Advanced AI-Native (P2)
// ============================================================================
export * from "./crossDocument";
export * from "./dynamicSafety";

// ============================================================================
// v0.9.1+ Infrastructure
// ============================================================================
export * from "./constants";
export * from "./validation";

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
} from "./dryRun";
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
} from "./envelope";
export { createSanitizer } from "./sanitizer";
export * from "./types";
export * from "./context";

// Killer Features
export * from "./liquidRefactoring";
export * from "./ghostCollaborator";
export * from "./semanticTimeTravel";
