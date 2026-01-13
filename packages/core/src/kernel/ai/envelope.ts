/**
 * LFCC v0.9.1 - AI Envelope Utilities (v2)
 * @see docs/specs/engineering/06_AI_Envelope_Specification.md
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { CanonNode } from "../canonicalizer/types.js";
import type { EditIntent } from "./intent.js";
import type { AIOperationMeta } from "./opcodes.js";
import type { AI409Conflict, AIRequestEnvelope, DocFrontier, SpanPrecondition } from "./types.js";

/**
 * Policy context carried with AI envelopes to enforce redaction/governance.
 */
export type AIEnvelopePolicyContext = {
  policy_id?: string;
  redaction_profile?: string;
  data_access_profile?: string;
};

/**
 * Envelope options.
 */
export type AIEnvelopeOptions = {
  return_canonical_tree?: boolean;
  dry_run?: boolean;
};

/**
 * Diagnostic emitted during envelope processing.
 */
export type AIEnvelopeDiagnostic = {
  kind: string;
  detail: string;
  severity?: "info" | "warning" | "error";
};

/**
 * Successful envelope response.
 */
export type AIEnvelopeSuccess = {
  status: 200;
  applied_frontier?: DocFrontier;
  canon_root?: CanonNode;
  diagnostics: AIEnvelopeDiagnostic[];
  request_id?: string;
  agent_id?: string;
  intent_id?: string;
  policy_context?: AIEnvelopePolicyContext;
};

/**
 * Conflict response (409).
 */
export type AIEnvelopeConflict = AI409Conflict & {
  status?: 409;
  diagnostics?: AIEnvelopeDiagnostic[];
};

/**
 * Unprocessable/dry-run rejection (422).
 */
export type AIEnvelopeUnprocessable = {
  status: 422;
  code: "UNPROCESSABLE" | "DRYRUN_REJECTED";
  diagnostics: AIEnvelopeDiagnostic[];
  request_id?: string;
  failed_preconditions?: AI409Conflict["failed_preconditions"];
};

/**
 * Generic envelope error (4xx/5xx).
 */
export type AIEnvelopeError = {
  status: 400 | 401 | 403 | 500 | 503;
  code: string;
  message: string;
  request_id?: string;
  diagnostics?: AIEnvelopeDiagnostic[];
};

/**
 * Union of all envelope responses.
 */
export type AIEnvelopeResponse =
  | AIEnvelopeSuccess
  | (AIEnvelopeConflict & { status: 409 })
  | AIEnvelopeUnprocessable
  | AIEnvelopeError;

/**
 * Shared retry policy for envelope-aware clients.
 */
export type AIEnvelopeRetryPolicy = {
  max_retries: number;
  relocation_level: 1 | 2 | 3;
  backoff_base_ms: number;
  backoff_multiplier: number;
  max_backoff_ms: number;
};

export const DEFAULT_AI_ENVELOPE_RETRY_POLICY: AIEnvelopeRetryPolicy = {
  max_retries: 3,
  relocation_level: 1,
  backoff_base_ms: 100,
  backoff_multiplier: 2,
  max_backoff_ms: 5000,
};

type RequestIdentifierFields = {
  request_id?: string;
  client_request_id?: string;
};

type FrontierFields = {
  doc_frontier?: DocFrontier;
  doc_frontier_tag?: DocFrontier;
};

/**
 * Normalize request/client ids to enforce idempotency semantics.
 * Ensures `request_id` is always present and mirrors legacy `client_request_id`.
 */
export function normalizeRequestIdentifiers<T extends RequestIdentifierFields>(
  envelope: T
): T & { request_id: string; client_request_id?: string } {
  const requestId = envelope.request_id ?? envelope.client_request_id ?? generateRequestId();
  const clientRequestId = envelope.client_request_id ?? envelope.request_id;
  return {
    ...envelope,
    request_id: requestId,
    client_request_id: clientRequestId,
  };
}

/**
 * Normalize frontier aliases to keep canonical `doc_frontier` populated.
 */
export function normalizeDocFrontier<T extends FrontierFields>(
  envelope: T
): T & { doc_frontier: DocFrontier; doc_frontier_tag?: DocFrontier } {
  const frontier = envelope.doc_frontier ?? envelope.doc_frontier_tag;
  return {
    ...envelope,
    doc_frontier: frontier ?? "",
    doc_frontier_tag: envelope.doc_frontier_tag ?? frontier,
  };
}

/**
 * Create an AI request envelope (v2) with alias/backward-compatibility handling.
 */
export function createAIRequestEnvelope(params: {
  docFrontier: DocFrontier;
  opsXml: string;
  preconditions?: SpanPrecondition[];
  agentId: string;
  intent?: EditIntent;
  intentId?: AIRequestEnvelope["intent_id"];
  requestId?: string;
  clientRequestId?: string;
  returnCanonicalTree?: boolean;
  policyContext?: AIEnvelopePolicyContext;
  aiMeta?: AIOperationMeta;
  docFrontierTag?: DocFrontier;
  options?: AIEnvelopeOptions;
}): AIRequestEnvelope {
  const frontier = normalizeDocFrontier({
    doc_frontier: params.docFrontier,
    doc_frontier_tag: params.docFrontierTag,
  });
  if (!frontier.doc_frontier) {
    throw new Error("docFrontier is required to build an AI envelope");
  }
  const identifiers = normalizeRequestIdentifiers({
    request_id: params.requestId,
    client_request_id: params.clientRequestId,
  });

  return normalizeAIRequestEnvelope({
    doc_frontier: frontier.doc_frontier,
    doc_frontier_tag: frontier.doc_frontier_tag,
    request_id: identifiers.request_id,
    agent_id: params.agentId,
    ops_xml: params.opsXml,
    preconditions: params.preconditions ?? [],
    intent: params.intent,
    intent_id: params.intentId ?? params.intent?.id,
    client_request_id: identifiers.client_request_id,
    options:
      params.options ?? (params.returnCanonicalTree ? { return_canonical_tree: true } : undefined),
    policy_context: params.policyContext,
    ai_meta: params.aiMeta,
  });
}

/**
 * Create a 409 Conflict response
 */
export function create409Conflict(params: {
  currentFrontier: DocFrontier;
  failedPreconditions: Array<{
    spanId: string;
    reason: "hash_mismatch" | "span_missing" | "unverified";
  }>;
  requestId?: string;
  diagnostics?: AIEnvelopeDiagnostic[];
}): AIEnvelopeConflict {
  return {
    status: 409,
    code: "CONFLICT",
    current_frontier: params.currentFrontier,
    failed_preconditions: params.failedPreconditions.map((p) => ({
      span_id: p.spanId,
      reason: p.reason,
    })),
    request_id: params.requestId,
    diagnostics: params.diagnostics,
  };
}

/**
 * Check if a response is a 409 Conflict
 */
export function is409Conflict(response: unknown): response is AIEnvelopeConflict {
  return (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    (response as AIEnvelopeConflict).code === "CONFLICT"
  );
}

/**
 * Check if a response is a 422 dry-run rejection/unprocessable payload.
 */
export function isUnprocessableResponse(response: unknown): response is AIEnvelopeUnprocessable {
  return (
    typeof response === "object" &&
    response !== null &&
    "status" in response &&
    (response as AIEnvelopeUnprocessable).status === 422
  );
}

/**
 * Check if a response is a successful 200 envelope.
 */
export function isSuccessResponse(response: unknown): response is AIEnvelopeSuccess {
  return (
    typeof response === "object" &&
    response !== null &&
    "status" in response &&
    (response as AIEnvelopeSuccess).status === 200
  );
}

/**
 * Normalize envelope fields to ensure canonical id/frontier presence.
 */
export function normalizeAIRequestEnvelope(envelope: AIRequestEnvelope): AIRequestEnvelope {
  const withFrontier = normalizeDocFrontier(envelope);
  const withIds = normalizeRequestIdentifiers(withFrontier);
  return {
    ...withFrontier,
    ...withIds,
    intent_id: withFrontier.intent_id ?? withFrontier.intent?.id,
    preconditions: withFrontier.preconditions ?? [],
  };
}

/**
 * Validate preconditions against current document state
 */
export function validatePreconditions(
  preconditions: SpanPrecondition[],
  getSpanHash: (spanId: string) => string | null
): Array<{ span_id: string; reason: "hash_mismatch" | "span_missing" }> {
  const failures: Array<{ span_id: string; reason: "hash_mismatch" | "span_missing" }> = [];

  for (const pre of preconditions) {
    const currentHash = getSpanHash(pre.span_id);

    if (currentHash === null) {
      failures.push({ span_id: pre.span_id, reason: "span_missing" });
    } else if (currentHash !== pre.if_match_context_hash) {
      failures.push({ span_id: pre.span_id, reason: "hash_mismatch" });
    }
  }

  return failures;
}

export function generateRequestId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : undefined;
  if (uuid) {
    return uuid.startsWith("req_") ? uuid : `req_${uuid}`;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
