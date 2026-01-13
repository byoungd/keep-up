/**
 * LFCC v0.9.1 - AI Envelope Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 5
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/06_AI_Envelope_Specification.md
 * @see docs/specs/proposals/LFCC_v0.9.1_AI_Native_Enhancement.md
 */

import type { CanonMark, CanonNode } from "../canonicalizer/types.js";
import type { EditIntent } from "./intent.js";
import type { AIOperationMeta } from "./opcodes.js";

/** Document frontier (opaque version vector encoding) */
export type DocFrontier = string;

/** Span-level precondition for AI requests */
export type SpanPrecondition = {
  span_id: string;
  if_match_context_hash: string; // sha256 hex
};

/** AI request envelope */
export type AIRequestEnvelope = {
  doc_frontier: DocFrontier;
  /** Legacy alias for doc_frontier (kept for backward compatibility) */
  doc_frontier_tag?: DocFrontier;
  /** Idempotency key for this request */
  request_id: string;
  /** Agent identifier for audit and policy */
  agent_id: string;
  ops_xml: string;
  preconditions: SpanPrecondition[];
  /** Legacy request identifier (deprecated) */
  client_request_id?: string;
  options?: {
    return_canonical_tree?: boolean;
    /** Validate without applying */
    dry_run?: boolean;
  };
  /** Optional policy context for redaction and governance */
  policy_context?: {
    policy_id?: string;
    redaction_profile?: string;
    data_access_profile?: string;
  };

  // ============================================================================
  // v0.9.1 AI-Native Extensions (optional for backward compatibility)
  // ============================================================================

  /**
   * AI operation metadata including op_code, provenance, and confidence.
   * @since v0.9.1
   */
  ai_meta?: AIOperationMeta;

  /**
   * Edit intent describing the purpose and context of this operation.
   * @since v0.9.1
   */
  intent?: EditIntent;

  /**
   * Optional intent reference when the intent is registered elsewhere.
   * @since v0.9.1
   */
  intent_id?: string;
};

/** Data access policy for AI read operations */
export type DataAccessPolicy = {
  /** Maximum characters allowed in context */
  max_context_chars: number;
  /** Allowlist of block IDs (optional) */
  allow_blocks?: string[];
  /** Denylist of block IDs (optional) */
  deny_blocks?: string[];
  /** Redaction strategy for sensitive content */
  redaction_strategy: "mask" | "omit";
  /** PII handling behavior */
  pii_handling: "block" | "mask" | "allow";
};

/** 409 Conflict response */
export type AI409Conflict = {
  /** HTTP status code for conflict responses */
  status?: 409;
  code: "CONFLICT";
  current_frontier: DocFrontier;
  failed_preconditions: Array<{
    span_id: string;
    reason: "hash_mismatch" | "span_missing" | "unverified";
  }>;
  request_id?: string;
};

/** Sanitization policy */
export type AISanitizationPolicyV1 = {
  version: "v1";
  sanitize_mode: "whitelist";
  allowed_marks: CanonMark[];
  allowed_block_types: string[];
  reject_unknown_structure: boolean;
  allowed_url_protocols?: string[];
  max_payload_size?: number; // @deprecated use limits.max_payload_bytes
  limits?: {
    max_payload_bytes?: number;
    max_nesting_depth?: number;
    max_attribute_count?: number;
  };
};

/** Sanitized payload result */
export type SanitizedPayload = {
  sanitized_html?: string;
  sanitized_markdown?: string;
  diagnostics: Array<{ kind: string; detail: string; severity?: "error" | "warning" }>;
  /**
   * P0.1: Fail-closed - if sanitization encounters critical errors (e.g., vbscript:),
   * these must be checked in the validation pipeline
   */
  errors?: Array<{ kind: string; detail: string }>;
};

/** Dry-run report */
export type DryRunReport = {
  ok: boolean;
  reason?: string;
  canon_root?: CanonNode;
  diagnostics: Array<{ kind: string; detail: string }>;
};

/** Editor schema validator interface */
export interface EditorSchemaValidator {
  dryRunApply(input: { html?: string; markdown?: string }): { ok: boolean; error?: string };
}

/** AI payload sanitizer interface */
export interface AIPayloadSanitizer {
  sanitize(
    input: { html?: string; markdown?: string },
    policy: AISanitizationPolicyV1
  ): SanitizedPayload;
}

/** Default sanitization policy */
export const DEFAULT_AI_SANITIZATION_POLICY: AISanitizationPolicyV1 = {
  version: "v1",
  sanitize_mode: "whitelist",
  allowed_marks: ["bold", "italic", "underline", "strike", "code", "link"],
  allowed_block_types: [
    "paragraph",
    "heading",
    "list",
    "list_item",
    "table",
    "table_row",
    "table_cell",
    "quote",
    "code_block",
  ],
  reject_unknown_structure: true,
  allowed_url_protocols: ["https:", "http:", "mailto:"],
  limits: {
    max_payload_bytes: 1024 * 1024, // 1MB
    max_nesting_depth: 100,
    max_attribute_count: 1000,
  },
};
