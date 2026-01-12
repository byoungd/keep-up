/**
 * AI Envelope Types
 *
 * Implements LFCC v0.9.1 AI Envelope specification for request/response handling.
 * Ensures causal consistency, precondition checking, and fail-closed behavior.
 */

import type { AIOperationMeta, EditIntent } from "@keepup/core";

// ============================================================================
// Frontier and Preconditions
// ============================================================================

/**
 * Document frontier representing CRDT state.
 * Opaque string encoding the version vector.
 */
export type DocFrontier = string;

/**
 * Span-level precondition for AI operations.
 */
export interface SpanPrecondition {
  /** Target span ID */
  span_id: string;
  /** Expected context hash (SHA-256) */
  if_match_context_hash: string;
}

/**
 * Block-level precondition for AI operations.
 */
export interface BlockPrecondition {
  /** Target block ID */
  block_id: string;
  /** Expected content hash */
  if_match_content_hash: string;
}

// ============================================================================
// AI Request Envelope
// ============================================================================

/**
 * AI operation metadata following LFCC v0.9.1.
 */
export type AIEnvelopeMeta = AIOperationMeta;

/**
 * Edit intent for tracking purpose.
 */
export type AIEnvelopeIntent = EditIntent;

/**
 * AI request envelope following LFCC v0.9.1 spec.
 */
export interface AIRequestEnvelope {
  /** Document frontier for causal consistency */
  doc_frontier: DocFrontier;
  /** Request ID for idempotency */
  request_id: string;
  /** Agent identifier */
  agent_id: string;
  /** Operations in XML format */
  ops_xml: string;
  /** Span-level preconditions */
  preconditions: SpanPrecondition[];
  /** Request options */
  options?: AIRequestOptions;
  /** AI operation metadata (v0.9.1 extension) */
  ai_meta?: AIEnvelopeMeta;
  /** Edit intent (v0.9.1 extension) */
  intent?: AIEnvelopeIntent;
  /** Optional intent reference when intent is stored separately */
  intent_id?: string;
  /** Optional policy context */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
  /** Legacy client request ID (deprecated) */
  client_request_id?: string;
}

/**
 * Request options for AI envelope.
 */
export interface AIRequestOptions {
  /** Whether to return canonical tree representation */
  return_canonical_tree?: boolean;
  /** Dry-run mode (validate without applying) */
  dry_run?: boolean;
  /** Maximum payload size in bytes */
  max_payload_bytes?: number;
}

// ============================================================================
// AI Response Envelope
// ============================================================================

/**
 * Diagnostic entry for AI operations.
 */
export interface AIDiagnostic {
  /** Diagnostic kind */
  kind: "sanitized_drop" | "normalized" | "warning" | "info";
  /** Diagnostic detail */
  detail: string;
  /** Location in the document */
  location?: {
    block_id?: string;
    span_id?: string;
    offset?: number;
  };
}

/**
 * Canonical tree node for response.
 */
export interface CanonicalNode {
  /** Node type */
  type: string;
  /** Node ID */
  id: string;
  /** Node attributes */
  attrs?: Record<string, unknown>;
  /** Child nodes */
  children?: CanonicalNode[];
  /** Leaf text content */
  text?: string;
  /** Marks for text */
  marks?: string[];
  /** Whether this is a leaf node */
  is_leaf?: boolean;
}

/**
 * Successful AI response envelope (200).
 */
export interface AIResponseEnvelopeSuccess {
  /** Response status */
  status: "ok";
  /** Frontier after applying the operation */
  applied_frontier: DocFrontier;
  /** Canonical tree representation (if requested) */
  canon_root?: CanonicalNode;
  /** Diagnostics from processing */
  diagnostics: AIDiagnostic[];
  /** Applied operation ID */
  operation_id?: string;
}

/**
 * Failed precondition in conflict response.
 */
export interface FailedPrecondition {
  /** Span ID that failed */
  span_id: string;
  /** Failure reason */
  reason: "hash_mismatch" | "span_deleted" | "span_modified" | "concurrent_edit";
}

/**
 * Conflict AI response envelope (409).
 */
export interface AIResponseEnvelopeConflict {
  /** Response code */
  code: "CONFLICT";
  /** Current document frontier */
  current_frontier: DocFrontier;
  /** List of failed preconditions */
  failed_preconditions: FailedPrecondition[];
}

/**
 * Validation error in unprocessable response.
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Location of the error */
  location?: string;
}

/**
 * Unprocessable AI response envelope (422).
 */
export interface AIResponseEnvelopeUnprocessable {
  /** Response code */
  code: "UNPROCESSABLE";
  /** Validation errors */
  errors: ValidationError[];
  /** Diagnostics from dry-run */
  diagnostics: AIDiagnostic[];
}

/**
 * Union of all AI response envelope types.
 */
export type AIResponseEnvelope =
  | AIResponseEnvelopeSuccess
  | AIResponseEnvelopeConflict
  | AIResponseEnvelopeUnprocessable;

// ============================================================================
// Envelope Helpers
// ============================================================================

/**
 * Creates a new AI request envelope.
 */
export function createAIRequestEnvelope(params: {
  docFrontier: DocFrontier;
  opsXml: string;
  preconditions?: SpanPrecondition[];
  aiMeta?: AIEnvelopeMeta;
  intent?: AIEnvelopeIntent;
  intentId?: string;
  agentId: string;
  requestId?: string;
  clientRequestId?: string;
  options?: AIRequestOptions;
  policyContext?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
}): AIRequestEnvelope {
  const requestId = params.requestId ?? params.clientRequestId ?? generateRequestId();
  return {
    doc_frontier: params.docFrontier,
    request_id: requestId,
    agent_id: params.agentId,
    ops_xml: params.opsXml,
    preconditions: params.preconditions ?? [],
    options: params.options,
    ai_meta: params.aiMeta,
    intent: params.intent,
    intent_id: params.intentId ?? params.intent?.id,
    policy_context: params.policyContext,
    client_request_id: params.clientRequestId,
  };
}

/**
 * Checks if a response is successful.
 */
export function isSuccessResponse(
  response: AIResponseEnvelope
): response is AIResponseEnvelopeSuccess {
  return "status" in response && response.status === "ok";
}

/**
 * Checks if a response is a conflict.
 */
export function isConflictResponse(
  response: AIResponseEnvelope
): response is AIResponseEnvelopeConflict {
  return "code" in response && response.code === "CONFLICT";
}

/**
 * Checks if a response is unprocessable.
 */
export function isUnprocessableResponse(
  response: AIResponseEnvelope
): response is AIResponseEnvelopeUnprocessable {
  return "code" in response && response.code === "UNPROCESSABLE";
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
 * Generates a unique request ID.
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Hashes content for precondition checking.
 * Uses a simple hash for now; in production would use SHA-256.
 */
function hashContent(content: string): string {
  // Simple hash for development; production should use crypto.subtle.digest
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
  const errors: string[] = [];

  if (!envelope.doc_frontier) {
    errors.push("Missing doc_frontier");
  }

  const requestId = envelope.request_id ?? envelope.client_request_id;
  if (!requestId) {
    errors.push("Missing request_id");
  }

  if (!envelope.agent_id) {
    errors.push("Missing agent_id");
  }

  const hasIntent =
    Boolean(envelope.intent) &&
    typeof envelope.intent?.id === "string" &&
    envelope.intent.id !== "";
  const hasIntentId =
    typeof envelope.intent_id === "string" && envelope.intent_id.trim().length > 0;
  if (!hasIntent && !hasIntentId) {
    errors.push("Missing intent_id or intent");
  }

  if (!envelope.ops_xml) {
    errors.push("Missing ops_xml");
  }

  if (envelope.ai_meta) {
    if (!envelope.ai_meta.op_code) {
      errors.push("AI meta missing op_code");
    }
    if (!envelope.ai_meta.agent_id) {
      errors.push("AI meta missing agent_id");
    }
    if (!envelope.ai_meta.provenance?.model_id) {
      errors.push("AI meta missing provenance.model_id");
    }
    const promptHash = envelope.ai_meta.provenance?.prompt_hash;
    if (promptHash !== undefined && (typeof promptHash !== "string" || promptHash.length === 0)) {
      errors.push("AI meta provenance.prompt_hash must be a non-empty string");
    }
    if (
      typeof envelope.ai_meta.confidence?.score !== "number" ||
      Number.isNaN(envelope.ai_meta.confidence.score)
    ) {
      errors.push("AI meta missing confidence.score");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
