/**
 * AI Envelope Types
 *
 * Implements LFCC v0.9.1 AI Envelope specification for request/response handling.
 * Ensures causal consistency, precondition checking, and fail-closed behavior.
 */

import {
  DEFAULT_AI_ENVELOPE_RETRY_POLICY,
  createAIRequestEnvelope,
  is409Conflict,
  isSuccessResponse,
  isUnprocessableResponse,
  normalizeAIRequestEnvelope,
} from "@ku0/core";
import type {
  AIEnvelopeConflict,
  AIEnvelopeDiagnostic,
  AIEnvelopeError,
  AIEnvelopeOptions,
  AIEnvelopeResponse,
  AIEnvelopeSuccess,
  AIEnvelopeUnprocessable,
  AIOperationMeta,
  AIRequestEnvelope,
  EditIntent,
  SpanPrecondition,
} from "@ku0/core";

export type AIEnvelopeMeta = AIOperationMeta;
export type AIEnvelopeIntent = EditIntent;

export type AIResponseEnvelope = AIEnvelopeResponse;
export type AIResponseEnvelopeSuccess = AIEnvelopeSuccess;
export type AIResponseEnvelopeConflict = AIEnvelopeConflict & { status: 409 };
export type AIResponseEnvelopeUnprocessable = AIEnvelopeUnprocessable;
export type AIResponseEnvelopeError = AIEnvelopeError;
export type AIRequestOptions = AIEnvelopeOptions;
export type AIDiagnostic = AIEnvelopeDiagnostic;

export {
  DEFAULT_AI_ENVELOPE_RETRY_POLICY,
  createAIRequestEnvelope,
  isSuccessResponse,
  isUnprocessableResponse,
  normalizeAIRequestEnvelope,
};

/**
 * Checks if a response is a conflict (409).
 */
export function isConflictResponse(
  response: AIResponseEnvelope
): response is AIResponseEnvelopeConflict {
  return is409Conflict(response) && response.status === 409;
}

/**
 * Creates a span precondition from content.
 */
export function createSpanPrecondition(spanId: string, content: string): SpanPrecondition {
  return {
    span_id: spanId,
    if_match_context_hash: hashContent(content),
  };
}

/**
 * Hashes content for precondition checking.
 * Uses a simple hash for now; production should use a deterministic crypto hash.
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Validates an AI request envelope.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation covers many fields for safety
export function validateAIRequestEnvelope(envelope: AIRequestEnvelope): {
  valid: boolean;
  errors: string[];
} {
  const normalized = normalizeAIRequestEnvelope(envelope);
  const errors: string[] = [];

  if (!normalized.doc_frontier) {
    errors.push("Missing doc_frontier");
  }

  if (!normalized.request_id) {
    errors.push("Missing request_id");
  }

  if (!normalized.agent_id) {
    errors.push("Missing agent_id");
  }

  const hasIntent =
    typeof normalized.intent?.id === "string" && normalized.intent.id.trim().length > 0;
  const hasIntentId =
    typeof normalized.intent_id === "string" && normalized.intent_id.trim().length > 0;
  if (!hasIntent && !hasIntentId) {
    errors.push("Missing intent_id or intent");
  }

  if (!normalized.ops_xml) {
    errors.push("Missing ops_xml");
  }

  if (normalized.policy_context) {
    const { policy_context: context } = normalized;
    if (context && typeof context !== "object") {
      errors.push("policy_context must be an object");
    } else {
      if (context?.policy_id !== undefined && typeof context.policy_id !== "string") {
        errors.push("policy_id must be a string when provided");
      }
      if (
        context?.redaction_profile !== undefined &&
        typeof context.redaction_profile !== "string"
      ) {
        errors.push("redaction_profile must be a string when provided");
      }
      if (
        context?.data_access_profile !== undefined &&
        typeof context.data_access_profile !== "string"
      ) {
        errors.push("data_access_profile must be a string when provided");
      }
    }
  }

  if (normalized.ai_meta) {
    if (!normalized.ai_meta.op_code) {
      errors.push("AI meta missing op_code");
    }
    if (!normalized.ai_meta.agent_id) {
      errors.push("AI meta missing agent_id");
    }
    if (!normalized.ai_meta.provenance?.model_id) {
      errors.push("AI meta missing provenance.model_id");
    }
    const promptHash = normalized.ai_meta.provenance?.prompt_hash;
    if (promptHash !== undefined && (typeof promptHash !== "string" || promptHash.length === 0)) {
      errors.push("AI meta provenance.prompt_hash must be a non-empty string");
    }
    if (
      typeof normalized.ai_meta.confidence?.score !== "number" ||
      Number.isNaN(normalized.ai_meta.confidence.score)
    ) {
      errors.push("AI meta missing confidence.score");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
