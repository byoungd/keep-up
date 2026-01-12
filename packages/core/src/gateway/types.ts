/**
 * LFCC v0.9 RC - AI Gateway Types
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/05_AI_Gateway_Envelope_and_Dry_Run.md
 */

import { DEFAULT_AI_ENVELOPE_RETRY_POLICY } from "../kernel/ai/envelope";
import type { AISanitizationPolicyV1 } from "../kernel/ai/types";
import type { CanonNode } from "../kernel/canonicalizer/types";

// ============================================================================
// Document Frontier
// ============================================================================

/** Document frontier tag (opaque version vector encoding) */
export type DocFrontierTag = string;

/** Frontier comparison result */
export type FrontierComparison = "equal" | "ahead" | "behind" | "diverged";

// ============================================================================
// A1. AI Gateway Request
// ============================================================================

/** Target span with precondition */
export type TargetSpan = {
  /** Annotation ID */
  annotation_id: string;
  /** Span ID within annotation */
  span_id: string;
  /** Context hash precondition (sha256) */
  if_match_context_hash: string;
};

/** AI request format */
export type AIRequestFormat = "canonical_tree" | "canonical_fragment" | "html" | "markdown";

/** AI Gateway request envelope (v0.9.1 aligned). Prefer `doc_frontier` + `request_id`; keep aliases for backward compatibility. */
export type AIGatewayRequest = {
  /** Document ID */
  doc_id: string;
  /** Document frontier at time of read (legacy field) */
  doc_frontier_tag: DocFrontierTag;
  /** Canonical frontier field */
  doc_frontier?: DocFrontierTag;
  /** Agent identifier for audit/policy */
  agent_id?: string;
  /** Optional intent identifier */
  intent_id?: string;
  /** Optional intent payload */
  intent?: unknown;
  /** AI operation metadata */
  ai_meta?: import("../kernel/ai/opcodes").AIOperationMeta;
  /** Target spans with preconditions */
  target_spans: TargetSpan[];
  /** User instructions / prompt */
  instructions: string;
  /** Selected LLM model */
  model?: string;
  /** Output format preference */
  format: AIRequestFormat;
  /** Raw payload (HTML/Markdown/XML) */
  payload?: string;
  /** Additional options */
  options?: AIGatewayRequestOptions;
  /** Canonical request id for idempotency */
  request_id?: string;
  /** Legacy client-provided request id */
  client_request_id?: string;
  /** Policy context for governance/redaction */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
};

/** Request options */
export type AIGatewayRequestOptions = {
  /** Return canonical tree in response */
  return_canonical_tree?: boolean;
  /** Skip schema validation (dev only) */
  skip_schema_validation?: boolean;
  /** Custom sanitization policy */
  sanitization_policy?: AISanitizationPolicyV1;
};

// ============================================================================
// A2. AI Gateway Response (200 OK)
// ============================================================================

/** Successful gateway response */
export type AIGatewayResponse = {
  /** Status code */
  status: 200;
  /** Canonical fragment result */
  canon_fragment?: CanonNode;
  /** Apply plan explanation */
  apply_plan?: ApplyPlan;
  /** Server's current frontier (legacy field) */
  server_frontier_tag: DocFrontierTag;
  /** Canonical server frontier */
  server_doc_frontier?: DocFrontierTag;
  /** Request ID echo */
  request_id?: string;
  /** Request ID echo */
  client_request_id?: string;
  /** Policy context echo */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
  /** Processing diagnostics */
  diagnostics: GatewayDiagnostic[];
};

/** Apply plan for the mutation */
export type ApplyPlan = {
  /** Operations to apply */
  operations: ApplyOperation[];
  /** Affected block IDs */
  affected_block_ids: string[];
  /** Estimated change size */
  estimated_size_bytes: number;
};

/** Single apply operation */
export type ApplyOperation = {
  /** Operation type */
  type: "replace" | "insert" | "delete";
  /** Target span ID */
  span_id: string;
  /** New content (for replace/insert) */
  content?: CanonNode;
};

// ============================================================================
// A3. AI Gateway Conflict Response (409)
// ============================================================================

/** Conflict reason codes */
export type ConflictReason =
  | "frontier_mismatch"
  | "hash_mismatch"
  | "unverified_target"
  | "span_missing"
  | "schema_reject"
  | "sanitization_reject";

/** Failed precondition detail */
export type FailedPrecondition = {
  /** Span ID that failed */
  span_id: string;
  /** Annotation ID */
  annotation_id: string;
  /** Failure reason */
  reason: ConflictReason;
  /** Expected hash (if hash_mismatch) */
  expected_hash?: string;
  /** Actual hash (if hash_mismatch) */
  actual_hash?: string;
  /** Additional detail */
  detail?: string;
};

/** 409 Conflict response */
export type AIGateway409Response = {
  /** Status code */
  status: 409;
  /** Primary conflict reason */
  reason: ConflictReason;
  /** Server's current frontier (legacy field) */
  server_frontier_tag: DocFrontierTag;
  /** Canonical server frontier */
  server_doc_frontier?: DocFrontierTag;
  /** Failed preconditions */
  failed_preconditions: FailedPrecondition[];
  /** Detailed error message */
  message: string;
  /** Request ID echo */
  request_id?: string;
  /** Request ID echo */
  client_request_id?: string;
  /** Policy context echo */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
};

/** Gateway error response (4xx/5xx) */
export type AIGatewayErrorResponse = {
  /** Status code */
  status: 400 | 401 | 403 | 500 | 503;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Request ID echo */
  request_id?: string;
  /** Request ID echo */
  client_request_id?: string;
  /** Policy context echo */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };
};

/** Union of all gateway responses */
export type AIGatewayResult = AIGatewayResponse | AIGateway409Response | AIGatewayErrorResponse;

// ============================================================================
// Gateway Diagnostics
// ============================================================================

/** Diagnostic severity */
export type DiagnosticSeverity = "info" | "warning" | "error";

/** Gateway diagnostic */
export type GatewayDiagnostic = {
  /** Severity level */
  severity: DiagnosticSeverity;
  /** Diagnostic kind */
  kind: string;
  /** Detail message */
  detail: string;
  /** Source location (if applicable) */
  source?: string;
};

// ============================================================================
// Gateway Telemetry
// ============================================================================

export type GatewayTelemetryEvent = {
  kind:
    | "idempotency_hit"
    | "conflict"
    | "sanitization_reject"
    | "schema_reject"
    | "success"
    | "invalid_request";
  request_id?: string;
  agent_id?: string;
  intent_id?: string;
  doc_id?: string;
  reason?: string;
  duration_ms?: number;
};

// ============================================================================
// Document State Provider Interface
// ============================================================================

/** Span state for conflict checking */
export type SpanState = {
  span_id: string;
  annotation_id: string;
  block_id: string;
  text: string;
  context_hash: string;
  is_verified: boolean;
};

/** Document state provider for gateway */
export interface GatewayDocumentProvider {
  /** Get current frontier tag */
  getFrontierTag(): DocFrontierTag;
  /** Compare frontiers */
  compareFrontiers(
    clientFrontier: DocFrontierTag,
    serverFrontier: DocFrontierTag
  ): FrontierComparison;
  /** Get span state by ID */
  getSpanState(spanId: string): SpanState | null;
  /** Get multiple span states */
  getSpanStates(spanIds: string[]): Map<string, SpanState>;
  /** Check if document exists */
  documentExists(docId: string): boolean;
}

// ============================================================================
// Retry Policy Types (Section D)
// ============================================================================

/** Relocation level */
export type RelocationLevel = 1 | 2 | 3;

/** Retry policy configuration */
export type RetryPolicy = {
  /** Maximum retry attempts */
  max_retries: number;
  /** Allowed relocation level */
  relocation_level: RelocationLevel;
  /** Backoff base (ms) */
  backoff_base_ms: number;
  /** Backoff multiplier */
  backoff_multiplier: number;
  /** Maximum backoff (ms) */
  max_backoff_ms: number;
};

/** Default retry policy */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  ...DEFAULT_AI_ENVELOPE_RETRY_POLICY,
};

/** Retry state */
export type RetryState = {
  /** Current attempt number (0-indexed) */
  attempt: number;
  /** Last conflict response */
  last_conflict?: AIGateway409Response;
  /** Relocated spans (span_id -> new_span_id) */
  relocated_spans: Map<string, string>;
  /** Whether retry should continue */
  should_continue: boolean;
  /** Next backoff delay (ms) */
  next_backoff_ms: number;
};

/** Relocation result */
export type RelocationResult = {
  /** Whether relocation succeeded */
  success: boolean;
  /** New span ID (if relocated) */
  new_span_id?: string;
  /** New context hash (if relocated) */
  new_context_hash?: string;
  /** Relocation method used */
  method?: "exact_hash" | "fuzzy_text" | "semantic";
};
