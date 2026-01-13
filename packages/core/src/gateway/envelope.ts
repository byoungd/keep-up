/**
 * LFCC v0.9 RC - AI Gateway Envelope
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md Section A
 */

import { normalizeDocFrontier, normalizeRequestIdentifiers } from "../kernel/ai/envelope.js";
import type { AISanitizationPolicyV1 } from "../kernel/ai/types.js";
import type { CanonNode } from "../kernel/canonicalizer/types.js";
import type {
  AIGateway409Response,
  AIGatewayErrorResponse,
  AIGatewayRequest,
  AIGatewayResponse,
  AIGatewayResult,
  AIRequestFormat,
  ApplyPlan,
  ConflictReason,
  DocFrontierTag,
  FailedPrecondition,
  GatewayDiagnostic,
  TargetSpan,
} from "./types.js";

// ============================================================================
// Request Envelope Creation
// ============================================================================

/**
 * Create an AI Gateway request envelope
 */
export function createGatewayRequest(params: {
  docId: string;
  docFrontierTag?: DocFrontierTag;
  docFrontier?: DocFrontierTag;
  targetSpans: TargetSpan[];
  instructions: string;
  format: AIRequestFormat;
  model?: string;
  payload?: string;
  requestId?: string;
  clientRequestId?: string;
  agentId?: string;
  intentId?: string;
  intent?: unknown;
  aiMeta?: AIGatewayRequest["ai_meta"];
  policyContext?: AIGatewayRequest["policy_context"];
  returnCanonicalTree?: boolean;
  sanitizationPolicy?: AISanitizationPolicyV1;
}): AIGatewayRequest {
  const frontier = normalizeDocFrontier({
    doc_frontier: params.docFrontier,
    doc_frontier_tag: params.docFrontierTag,
  });
  if (!frontier.doc_frontier) {
    throw new Error("docFrontier is required to build a gateway request");
  }
  const identifiers = normalizeRequestIdentifiers({
    request_id: params.requestId,
    client_request_id: params.clientRequestId,
  });
  return {
    doc_id: params.docId,
    doc_frontier_tag: frontier.doc_frontier_tag ?? frontier.doc_frontier,
    doc_frontier: frontier.doc_frontier,
    agent_id: params.agentId,
    intent_id: params.intentId,
    intent: params.intent,
    ai_meta: params.aiMeta,
    target_spans: params.targetSpans,
    instructions: params.instructions,
    format: params.format,
    request_id: identifiers.request_id,
    client_request_id: identifiers.client_request_id,
    model: params.model,
    payload: params.payload,
    options: {
      return_canonical_tree: params.returnCanonicalTree,
      sanitization_policy: params.sanitizationPolicy,
    },
    policy_context: params.policyContext,
  };
}

/**
 * Create a target span with precondition
 */
export function createTargetSpan(
  annotationId: string,
  spanId: string,
  contextHash: string
): TargetSpan {
  return {
    annotation_id: annotationId,
    span_id: spanId,
    if_match_context_hash: contextHash,
  };
}

// ============================================================================
// Response Envelope Creation
// ============================================================================

/**
 * Create a successful gateway response (200)
 */
export function createGatewayResponse(params: {
  serverFrontierTag: DocFrontierTag;
  serverDocFrontier?: DocFrontierTag;
  canonFragment?: CanonNode;
  applyPlan?: ApplyPlan;
  requestId?: string;
  clientRequestId?: string;
  diagnostics?: GatewayDiagnostic[];
  policyContext?: AIGatewayRequest["policy_context"];
}): AIGatewayResponse {
  const identifiers = normalizeRequestIdentifiers({
    request_id: params.requestId,
    client_request_id: params.clientRequestId,
  });
  return {
    status: 200,
    server_frontier_tag: params.serverFrontierTag,
    server_doc_frontier: params.serverDocFrontier ?? params.serverFrontierTag,
    canon_fragment: params.canonFragment,
    apply_plan: params.applyPlan,
    request_id: identifiers.request_id,
    client_request_id: identifiers.client_request_id,
    policy_context: params.policyContext,
    diagnostics: params.diagnostics ?? [],
  };
}

/**
 * Create a 409 Conflict response
 */
export function createGateway409(params: {
  reason: ConflictReason;
  serverFrontierTag: DocFrontierTag;
  serverDocFrontier?: DocFrontierTag;
  failedPreconditions: FailedPrecondition[];
  message: string;
  requestId?: string;
  clientRequestId?: string;
  policyContext?: AIGatewayRequest["policy_context"];
}): AIGateway409Response {
  const identifiers = normalizeRequestIdentifiers({
    request_id: params.requestId,
    client_request_id: params.clientRequestId,
  });
  return {
    status: 409,
    reason: params.reason,
    server_frontier_tag: params.serverFrontierTag,
    server_doc_frontier: params.serverDocFrontier ?? params.serverFrontierTag,
    failed_preconditions: params.failedPreconditions,
    message: params.message,
    request_id: identifiers.request_id,
    client_request_id: identifiers.client_request_id,
    policy_context: params.policyContext,
  };
}

/**
 * Create an error response (4xx/5xx)
 */
export function createGatewayError(params: {
  status: 400 | 401 | 403 | 500 | 503;
  code: string;
  message: string;
  requestId?: string;
  clientRequestId?: string;
  policyContext?: AIGatewayRequest["policy_context"];
}): AIGatewayErrorResponse {
  return {
    status: params.status,
    code: params.code,
    message: params.message,
    request_id: params.requestId,
    client_request_id: params.clientRequestId,
    policy_context: params.policyContext,
  };
}

// ============================================================================
// Response Type Guards
// ============================================================================

/**
 * Check if response is successful (200)
 */
export function isGatewaySuccess(result: AIGatewayResult): result is AIGatewayResponse {
  return result.status === 200;
}

/**
 * Check if response is a 409 Conflict
 */
export function isGateway409(result: AIGatewayResult): result is AIGateway409Response {
  return result.status === 409;
}

/**
 * Check if response is an error (4xx/5xx excluding 409)
 */
export function isGatewayError(result: AIGatewayResult): result is AIGatewayErrorResponse {
  return result.status !== 200 && result.status !== 409;
}

// ============================================================================
// Request Validation
// ============================================================================

/** Validation error */
export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Validate an AI Gateway request envelope
 */
/**
 * Validate an AI Gateway request envelope
 */
export function validateGatewayRequest(request: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof request !== "object" || request === null) {
    errors.push({ field: "request", message: "Request must be an object" });
    return errors;
  }

  const req = request as Record<string, unknown>;

  validateRequiredFields(req, errors);
  validateTargetSpans(req, errors);
  validateOptionalFields(req, errors);

  return errors;
}

function validateRequiredFields(req: Record<string, unknown>, errors: ValidationError[]): void {
  if (typeof req.doc_id !== "string" || req.doc_id.length === 0) {
    errors.push({ field: "doc_id", message: "doc_id is required and must be a non-empty string" });
  }

  const hasFrontierTag = typeof req.doc_frontier_tag === "string";
  const hasDocFrontier = typeof req.doc_frontier === "string";

  if (!hasFrontierTag && !hasDocFrontier) {
    errors.push({
      field: "doc_frontier",
      message: "doc_frontier (or doc_frontier_tag) is required and must be a string",
    });
  }

  if (typeof req.instructions !== "string") {
    errors.push({
      field: "instructions",
      message: "instructions is required and must be a string",
    });
  }

  const validFormats = ["canonical_tree", "canonical_fragment", "html", "markdown"];
  if (typeof req.format !== "string" || !validFormats.includes(req.format)) {
    errors.push({ field: "format", message: `format must be one of: ${validFormats.join(", ")}` });
  }
}

function validateTargetSpans(req: Record<string, unknown>, errors: ValidationError[]): void {
  if (!Array.isArray(req.target_spans)) {
    errors.push({
      field: "target_spans",
      message: "target_spans is required and must be an array",
    });
    return;
  }

  for (let i = 0; i < req.target_spans.length; i++) {
    const span = req.target_spans[i] as Record<string, unknown>;
    if (typeof span !== "object" || span === null) {
      errors.push({ field: `target_spans[${i}]`, message: "Each target span must be an object" });
      continue;
    }
    if (typeof span.annotation_id !== "string") {
      errors.push({
        field: `target_spans[${i}].annotation_id`,
        message: "annotation_id is required",
      });
    }
    if (typeof span.span_id !== "string") {
      errors.push({ field: `target_spans[${i}].span_id`, message: "span_id is required" });
    }
    if (typeof span.if_match_context_hash !== "string") {
      errors.push({
        field: `target_spans[${i}].if_match_context_hash`,
        message: "if_match_context_hash is required",
      });
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation logic is inherently complex
function validateOptionalFields(req: Record<string, unknown>, errors: ValidationError[]): void {
  // Optional fields type checks
  if (req.model !== undefined && typeof req.model !== "string") {
    errors.push({ field: "model", message: "model must be a string if provided" });
  }

  if (req.payload !== undefined && typeof req.payload !== "string") {
    errors.push({ field: "payload", message: "payload must be a string if provided" });
  }

  if (req.doc_frontier_tag !== undefined && typeof req.doc_frontier_tag !== "string") {
    errors.push({
      field: "doc_frontier_tag",
      message: "doc_frontier_tag must be a string if provided",
    });
  }

  if (req.doc_frontier !== undefined && typeof req.doc_frontier !== "string") {
    errors.push({
      field: "doc_frontier",
      message: "doc_frontier must be a string if provided",
    });
  }

  if (req.request_id !== undefined && typeof req.request_id !== "string") {
    errors.push({
      field: "request_id",
      message: "request_id must be a string if provided",
    });
  }

  if (req.client_request_id !== undefined && typeof req.client_request_id !== "string") {
    errors.push({
      field: "client_request_id",
      message: "client_request_id must be a string if provided",
    });
  }

  if (req.request_id === undefined && req.client_request_id === undefined) {
    errors.push({
      field: "request_id",
      message: "request_id or client_request_id is required",
    });
  }

  if (req.policy_context !== undefined) {
    if (typeof req.policy_context !== "object" || req.policy_context === null) {
      errors.push({
        field: "policy_context",
        message: "policy_context must be an object if provided",
      });
    } else {
      const ctx = req.policy_context as Record<string, unknown>;
      if (ctx.policy_id !== undefined && typeof ctx.policy_id !== "string") {
        errors.push({
          field: "policy_context.policy_id",
          message: "policy_id must be a string if provided",
        });
      } else if (typeof ctx.policy_id === "string" && ctx.policy_id.trim().length === 0) {
        errors.push({
          field: "policy_context.policy_id",
          message: "policy_id cannot be empty",
        });
      }
      if (ctx.redaction_profile !== undefined && typeof ctx.redaction_profile !== "string") {
        errors.push({
          field: "policy_context.redaction_profile",
          message: "redaction_profile must be a string if provided",
        });
      }
      if (ctx.data_access_profile !== undefined && typeof ctx.data_access_profile !== "string") {
        errors.push({
          field: "policy_context.data_access_profile",
          message: "data_access_profile must be a string if provided",
        });
      }
    }
  }
}

/**
 * Check if request has valid structure (returns typed request or null)
 */
export function parseGatewayRequest(request: unknown): AIGatewayRequest | null {
  const errors = validateGatewayRequest(request);
  if (errors.length > 0) {
    return null;
  }
  return normalizeGatewayRequest(request as AIGatewayRequest);
}

/**
 * Normalize a gateway request to ensure canonical fields are present.
 * - Ensures `doc_frontier` mirrors `doc_frontier_tag`
 * - Ensures `request_id` mirrors `client_request_id` when missing
 */
export function normalizeGatewayRequest(request: AIGatewayRequest): AIGatewayRequest {
  const withFrontier = normalizeDocFrontier(request);
  return normalizeRequestIdentifiers(withFrontier);
}
