/**
 * LFCC v0.9 RC - AI Envelope Utilities
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/06_AI_Envelope_Specification.md
 */

import type { AI409Conflict, AIRequestEnvelope, DocFrontier, SpanPrecondition } from "./types";

/**
 * Create an AI request envelope
 */
export function createAIRequestEnvelope(params: {
  docFrontier: DocFrontier;
  opsXml: string;
  preconditions: SpanPrecondition[];
  agentId: string;
  intent?: AIRequestEnvelope["intent"];
  intentId?: AIRequestEnvelope["intent_id"];
  requestId?: string;
  clientRequestId?: string;
  returnCanonicalTree?: boolean;
  policyContext?: AIRequestEnvelope["policy_context"];
}): AIRequestEnvelope {
  const requestId = params.requestId ?? params.clientRequestId ?? generateRequestId();
  return normalizeAIRequestEnvelope({
    doc_frontier: params.docFrontier,
    request_id: requestId,
    agent_id: params.agentId,
    ops_xml: params.opsXml,
    preconditions: params.preconditions,
    intent: params.intent,
    intent_id: params.intentId ?? params.intent?.id,
    client_request_id: params.clientRequestId,
    options: params.returnCanonicalTree ? { return_canonical_tree: true } : undefined,
    policy_context: params.policyContext,
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
}): AI409Conflict {
  return {
    code: "CONFLICT",
    current_frontier: params.currentFrontier,
    failed_preconditions: params.failedPreconditions.map((p) => ({
      span_id: p.spanId,
      reason: p.reason,
    })),
  };
}

/**
 * Check if a response is a 409 Conflict
 */
export function is409Conflict(response: unknown): response is AI409Conflict {
  return (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    (response as AI409Conflict).code === "CONFLICT"
  );
}

/**
 * Normalize envelope fields to ensure canonical id/frontier presence.
 */
export function normalizeAIRequestEnvelope(envelope: AIRequestEnvelope): AIRequestEnvelope {
  return {
    ...envelope,
    request_id: envelope.request_id ?? envelope.client_request_id ?? generateRequestId(),
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

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
