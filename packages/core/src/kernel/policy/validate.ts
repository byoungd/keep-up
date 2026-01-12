/**
 * LFCC v0.9 RC - Policy Manifest Validation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/02_Policy_Manifest_Schema.md
 */

import type { CanonMark, ChainKind, PolicyManifestV09 } from "./types";

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

const VALID_CHAIN_KINDS: ChainKind[] = ["strict_adjacency", "required_order", "bounded_gap"];
const VALID_MARKS: CanonMark[] = ["bold", "italic", "underline", "strike", "code", "link"];
const VALID_PARTIAL_BEHAVIORS = ["allow_drop_tail", "allow_islands", "none"];
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB upper bound for AI payloads
const MAX_NESTING_DEPTH = 1000;
const MAX_ATTRIBUTE_COUNT = 5000;
const MAX_CHECKPOINT_MS = 600_000; // 10 minutes
const MAX_CHECKPOINT_OPS = 1_000_000;
const MAX_DEBOUNCE_MS = 600_000;
const TOP_LEVEL_FIELDS = [
  "lfcc_version",
  "policy_id",
  "coords",
  "anchor_encoding",
  "structure_mode",
  "block_id_policy",
  "chain_policy",
  "partial_policy",
  "integrity_policy",
  "canonicalizer_policy",
  "history_policy",
  "ai_sanitization_policy",
  "ai_native_policy",
  "relocation_policy",
  "dev_tooling_policy",
  "capabilities",
  "conformance_kit_policy",
  "extensions",
  "v",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/**
 * Validate a policy manifest against LFCC v0.9 schema
 */
export function validateManifest(manifest: unknown): ValidationResult {
  if (!isRecord(manifest)) {
    return { valid: false, errors: [{ path: "", message: "Manifest must be an object" }] };
  }

  const m = manifest;
  const errors: ValidationError[] = [
    ...validateUnknownTopLevelFields(m),
    ...validateRequiredFields(m),
    ...validateStructureMode(m.structure_mode),
    ...validateVersionField(m.v),
  ];

  validateCoords(m.coords, errors);
  validateAnchorEncoding(m.anchor_encoding, errors);
  validateBlockIdPolicy(m.block_id_policy, errors);
  validateChainPolicy(m.chain_policy, errors);
  validatePartialPolicy(m.partial_policy, errors);
  validateIntegrityPolicy(m.integrity_policy, errors);
  validateCanonicalizerPolicy(m.canonicalizer_policy, errors);
  validateHistoryPolicy(m.history_policy, errors);
  validateAISanitizationPolicy(m.ai_sanitization_policy, errors);
  validateAINativePolicy(m.ai_native_policy, errors);
  validateRelocationPolicy(m.relocation_policy, errors);
  validateDevToolingPolicy(m.dev_tooling_policy, errors);
  validateCapabilities(m.capabilities, errors);
  validateConformanceKitPolicy(m.conformance_kit_policy, errors);

  return { valid: errors.length === 0, errors };
}

function validateUnknownTopLevelFields(m: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const unknownTopLevel = Object.keys(m).filter((key) => !TOP_LEVEL_FIELDS.includes(key));
  for (const key of unknownTopLevel) {
    errors.push({ path: key, message: "Unknown field is not allowed" });
  }
  return errors;
}

function validateRequiredFields(m: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (m.lfcc_version !== "0.9" && m.lfcc_version !== "0.9.1") {
    errors.push({ path: "lfcc_version", message: 'Must be "0.9" or "0.9.1"' });
  }
  if (typeof m.policy_id !== "string" || m.policy_id.length === 0) {
    errors.push({ path: "policy_id", message: "Must be a non-empty string" });
  }
  return errors;
}

function validateStructureMode(value: unknown): ValidationError[] {
  if (value === "A" || value === "B") {
    return [];
  }
  return [{ path: "structure_mode", message: 'Must be "A" or "B"' }];
}

function validateVersionField(value: unknown): ValidationError[] {
  if (typeof value === "number" && value >= 1) {
    return [];
  }
  return [{ path: "v", message: "Must be a positive integer" }];
}

function validateCoords(coords: unknown, errors: ValidationError[]): void {
  if (!coords || typeof coords !== "object") {
    errors.push({ path: "coords", message: "Must be an object" });
    return;
  }
  const c = coords as Record<string, unknown>;
  if (c.kind !== "utf16") {
    errors.push({ path: "coords.kind", message: 'Must be "utf16"' });
  }
}

function validateAnchorEncoding(encoding: unknown, errors: ValidationError[]): void {
  if (!encoding || typeof encoding !== "object") {
    errors.push({ path: "anchor_encoding", message: "Must be an object" });
    return;
  }
  const e = encoding as Record<string, unknown>;
  if (typeof e.version !== "string" || e.version.length === 0) {
    errors.push({ path: "anchor_encoding.version", message: "Must be a non-empty string" });
  }
  if (e.format !== "base64" && e.format !== "bytes") {
    errors.push({ path: "anchor_encoding.format", message: 'Must be "base64" or "bytes"' });
  }
}

function validateBlockIdPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "block_id_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (typeof p.version !== "string") {
    errors.push({ path: "block_id_policy.version", message: "Must be a string" });
  }
  if (typeof p.overrides !== "object") {
    errors.push({ path: "block_id_policy.overrides", message: "Must be an object" });
  }
}

function validateChainPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "chain_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (typeof p.version !== "string") {
    errors.push({ path: "chain_policy.version", message: "Must be a string" });
  }
  if (!p.defaults || typeof p.defaults !== "object") {
    errors.push({ path: "chain_policy.defaults", message: "Must be an object" });
    return;
  }
  const defaults = p.defaults as Record<string, unknown>;
  for (const [key, entry] of Object.entries(defaults)) {
    if (!entry || typeof entry !== "object") {
      errors.push({ path: `chain_policy.defaults.${key}`, message: "Must be an object" });
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (!VALID_CHAIN_KINDS.includes(e.kind as ChainKind)) {
      errors.push({
        path: `chain_policy.defaults.${key}.kind`,
        message: `Must be one of: ${VALID_CHAIN_KINDS.join(", ")}`,
      });
    }
    if (typeof e.max_intervening_blocks !== "number" || e.max_intervening_blocks < 0) {
      errors.push({
        path: `chain_policy.defaults.${key}.max_intervening_blocks`,
        message: "Must be a non-negative integer",
      });
    }
  }
}

function validatePartialPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "partial_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (!p.defaults || typeof p.defaults !== "object") {
    errors.push({ path: "partial_policy.defaults", message: "Must be an object" });
    return;
  }
  const defaults = p.defaults as Record<string, unknown>;
  for (const [key, value] of Object.entries(defaults)) {
    if (!VALID_PARTIAL_BEHAVIORS.includes(value as string)) {
      errors.push({
        path: `partial_policy.defaults.${key}`,
        message: `Must be one of: ${VALID_PARTIAL_BEHAVIORS.join(", ")}`,
      });
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation logic
function validateIntegrityPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "integrity_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;

  // context_hash
  if (!p.context_hash || typeof p.context_hash !== "object") {
    errors.push({ path: "integrity_policy.context_hash", message: "Must be an object" });
  } else {
    const ch = p.context_hash as Record<string, unknown>;
    if (typeof ch.enabled !== "boolean") {
      errors.push({ path: "integrity_policy.context_hash.enabled", message: "Must be boolean" });
    }
    if (ch.mode !== "lazy_verify" && ch.mode !== "eager") {
      errors.push({
        path: "integrity_policy.context_hash.mode",
        message: 'Must be "lazy_verify" or "eager"',
      });
    }
    if (
      typeof ch.debounce_ms !== "number" ||
      ch.debounce_ms < 0 ||
      ch.debounce_ms > MAX_DEBOUNCE_MS
    ) {
      errors.push({
        path: "integrity_policy.context_hash.debounce_ms",
        message: `Must be between 0 and ${MAX_DEBOUNCE_MS}`,
      });
    }
  }

  // chain_hash
  if (!p.chain_hash || typeof p.chain_hash !== "object") {
    errors.push({ path: "integrity_policy.chain_hash", message: "Must be an object" });
  }

  // checkpoint
  if (!p.checkpoint || typeof p.checkpoint !== "object") {
    errors.push({ path: "integrity_policy.checkpoint", message: "Must be an object" });
  } else {
    const cp = p.checkpoint as Record<string, unknown>;
    if (typeof cp.every_ops !== "number" || cp.every_ops < 1 || cp.every_ops > MAX_CHECKPOINT_OPS) {
      errors.push({
        path: "integrity_policy.checkpoint.every_ops",
        message: `Must be between 1 and ${MAX_CHECKPOINT_OPS}`,
      });
    }
    if (typeof cp.every_ms !== "number" || cp.every_ms < 1 || cp.every_ms > MAX_CHECKPOINT_MS) {
      errors.push({
        path: "integrity_policy.checkpoint.every_ms",
        message: `Must be between 1 and ${MAX_CHECKPOINT_MS}`,
      });
    }
  }
}

function validateCanonicalizerPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "canonicalizer_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (p.version !== "v2") {
    errors.push({ path: "canonicalizer_policy.version", message: 'Must be "v2"' });
  }
  if (p.mode !== "recursive_tree") {
    errors.push({ path: "canonicalizer_policy.mode", message: 'Must be "recursive_tree"' });
  }
  if (!Array.isArray(p.mark_order)) {
    errors.push({ path: "canonicalizer_policy.mark_order", message: "Must be an array" });
  } else {
    for (const mark of p.mark_order) {
      if (!VALID_MARKS.includes(mark)) {
        errors.push({ path: "canonicalizer_policy.mark_order", message: `Invalid mark: ${mark}` });
      }
    }
  }
}

function validateHistoryPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "history_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (p.version !== "v1") {
    errors.push({ path: "history_policy.version", message: 'Must be "v1"' });
  }
  const boolFields = [
    "trusted_local_undo",
    "restore_enters_unverified",
    "restore_skip_grace",
    "force_verify_on_restore",
  ];
  for (const field of boolFields) {
    if (typeof p[field] !== "boolean") {
      errors.push({ path: `history_policy.${field}`, message: "Must be boolean" });
    }
  }
}

function validateAISanitizationPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_sanitization_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateAISanitizationVersion(p, errors);
  validateAISanitizeMode(p, errors);
  validateAIAllowedUrlProtocols(p.allowed_url_protocols, errors);
  validateAILimits(p.limits, errors);
}

function validateAISanitizationVersion(
  policy: Record<string, unknown>,
  errors: ValidationError[]
): void {
  if (policy.version !== "v1") {
    errors.push({ path: "ai_sanitization_policy.version", message: 'Must be "v1"' });
  }
}

function validateAISanitizeMode(policy: Record<string, unknown>, errors: ValidationError[]): void {
  if (policy.sanitize_mode !== "whitelist") {
    errors.push({ path: "ai_sanitization_policy.sanitize_mode", message: 'Must be "whitelist"' });
  }
}

function validateAIAllowedUrlProtocols(value: unknown, errors: ValidationError[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push({
      path: "ai_sanitization_policy.allowed_url_protocols",
      message: "Must be an array of strings",
    });
    return;
  }
  if (!value.every((protocol) => typeof protocol === "string")) {
    errors.push({
      path: "ai_sanitization_policy.allowed_url_protocols",
      message: "All protocols must be strings",
    });
  }
}

function validateAILimits(value: unknown, errors: ValidationError[]): void {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== "object") {
    errors.push({ path: "ai_sanitization_policy.limits", message: "Must be an object" });
    return;
  }

  const limits = value as Record<string, unknown>;
  const limitFields: Array<[string, number]> = [
    ["max_payload_bytes", MAX_PAYLOAD_BYTES],
    ["max_nesting_depth", MAX_NESTING_DEPTH],
    ["max_attribute_count", MAX_ATTRIBUTE_COUNT],
  ];

  for (const [field, maxValue] of limitFields) {
    const rawValue = limits[field];
    if (typeof rawValue !== "number" || rawValue < 0) {
      errors.push({
        path: `ai_sanitization_policy.limits.${field}`,
        message: "Must be a non-negative number",
      });
      continue;
    }

    if (rawValue > maxValue) {
      errors.push({
        path: `ai_sanitization_policy.limits.${field}`,
        message: "Exceeds max allowed value",
      });
    }
  }
}

function validateAINativePolicy(policy: unknown, errors: ValidationError[]): void {
  if (policy === undefined) {
    return;
  }
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy", message: "Must be an object" });
    return;
  }

  const p = policy as Record<string, unknown>;
  if (p.version !== "v1") {
    errors.push({ path: "ai_native_policy.version", message: 'Must be "v1"' });
  }

  validateAIGatewayPolicy(p.gateway, errors);
  validateAISecurityPolicy(p.security, errors);
  validateAIDataAccessPolicy(p.data_access, errors);
  validateAIDeterminismPolicy(p.determinism, errors);
  validateAIAgentCoordinationPolicy(p.agent_coordination, errors);
  validateAIIntentTrackingPolicy(p.intent_tracking, errors);
  validateAIProvenancePolicy(p.provenance, errors);
  validateAISemanticMergePolicy(p.semantic_merge, errors);
  validateAITransactionPolicy(p.transactions, errors);
  validateAIOpCodePolicy(p.ai_opcodes, errors);
}

function validateAIGatewayPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.gateway", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateNumberField(
    "ai_native_policy.gateway.max_ops_per_request",
    p.max_ops_per_request,
    errors
  );
  validateNumberField("ai_native_policy.gateway.max_payload_bytes", p.max_payload_bytes, errors);
  validateNumberField(
    "ai_native_policy.gateway.idempotency_window_ms",
    p.idempotency_window_ms,
    errors
  );
}

function validateAISecurityPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.security", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField(
    "ai_native_policy.security.require_signed_requests",
    p.require_signed_requests,
    errors
  );
  validateNumberField("ai_native_policy.security.agent_token_ttl_ms", p.agent_token_ttl_ms, errors);
  validateNumberField(
    "ai_native_policy.security.audit_retention_days",
    p.audit_retention_days,
    errors
  );
  validateBooleanField(
    "ai_native_policy.security.allow_external_models",
    p.allow_external_models,
    errors
  );
}

function validateAIDataAccessPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.data_access", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateNumberField(
    "ai_native_policy.data_access.max_context_chars",
    p.max_context_chars,
    errors
  );
  validateOptionalStringArrayField(
    "ai_native_policy.data_access.allow_blocks",
    p.allow_blocks,
    errors
  );
  validateOptionalStringArrayField(
    "ai_native_policy.data_access.deny_blocks",
    p.deny_blocks,
    errors
  );
  validateEnumField(
    "ai_native_policy.data_access.redaction_strategy",
    p.redaction_strategy,
    ["mask", "omit"],
    errors
  );
  validateEnumField(
    "ai_native_policy.data_access.pii_handling",
    p.pii_handling,
    ["block", "mask", "allow"],
    errors
  );
  validateBooleanField(
    "ai_native_policy.data_access.allow_external_fetch",
    p.allow_external_fetch,
    errors
  );
}

function validateAIDeterminismPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.determinism", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField(
    "ai_native_policy.determinism.require_explicit_ops",
    p.require_explicit_ops,
    errors
  );
}

function validateAIAgentCoordinationPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.agent_coordination", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField("ai_native_policy.agent_coordination.enabled", p.enabled, errors);
  validateNumberField(
    "ai_native_policy.agent_coordination.max_concurrent_agents",
    p.max_concurrent_agents,
    errors
  );
  validateBooleanField(
    "ai_native_policy.agent_coordination.require_agent_registration",
    p.require_agent_registration,
    errors
  );
  validateNumberField(
    "ai_native_policy.agent_coordination.claim_timeout_ms",
    p.claim_timeout_ms,
    errors
  );
}

function validateAIIntentTrackingPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.intent_tracking", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField("ai_native_policy.intent_tracking.enabled", p.enabled, errors);
  validateBooleanField("ai_native_policy.intent_tracking.require_intent", p.require_intent, errors);
  validateNumberField(
    "ai_native_policy.intent_tracking.intent_retention_days",
    p.intent_retention_days,
    errors
  );
}

function validateAIProvenancePolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.provenance", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField("ai_native_policy.provenance.enabled", p.enabled, errors);
  validateBooleanField("ai_native_policy.provenance.track_inline", p.track_inline, errors);
  validateBooleanField("ai_native_policy.provenance.require_model_id", p.require_model_id, errors);
  validateBooleanField(
    "ai_native_policy.provenance.store_rationale_summary",
    p.store_rationale_summary,
    errors
  );
}

function validateAISemanticMergePolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.semantic_merge", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField("ai_native_policy.semantic_merge.enabled", p.enabled, errors);
  validateEnumField(
    "ai_native_policy.semantic_merge.ai_autonomy",
    p.ai_autonomy,
    ["full", "suggest_only", "disabled"],
    errors
  );
  validateNumberField(
    "ai_native_policy.semantic_merge.auto_merge_threshold",
    p.auto_merge_threshold,
    errors,
    { min: 0, max: 1 }
  );
  validateBooleanField(
    "ai_native_policy.semantic_merge.prefer_human_edits",
    p.prefer_human_edits,
    errors
  );
  validateEnumField(
    "ai_native_policy.semantic_merge.max_auto_merge_complexity",
    p.max_auto_merge_complexity,
    ["trivial", "simple", "complex"],
    errors
  );
}

function validateAITransactionPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.transactions", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateBooleanField("ai_native_policy.transactions.enabled", p.enabled, errors);
  validateEnumField(
    "ai_native_policy.transactions.default_atomicity",
    p.default_atomicity,
    ["all_or_nothing", "best_effort", "partial_allowed"],
    errors
  );
  validateNumberField(
    "ai_native_policy.transactions.default_timeout_ms",
    p.default_timeout_ms,
    errors
  );
  validateNumberField(
    "ai_native_policy.transactions.max_operations_per_txn",
    p.max_operations_per_txn,
    errors
  );
}

function validateAIOpCodePolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "ai_native_policy.ai_opcodes", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  validateStringArrayField("ai_native_policy.ai_opcodes.allowed", p.allowed, errors);
  validateStringArrayField(
    "ai_native_policy.ai_opcodes.require_approval",
    p.require_approval,
    errors
  );
}

function validateRelocationPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "relocation_policy", message: "Must be an object" });
    return;
  }
  const p = policy as Record<string, unknown>;
  if (p.default_level !== 1) {
    errors.push({ path: "relocation_policy.default_level", message: "Only level 1 is supported" });
  }
  if (p.enable_level_2 !== false) {
    errors.push({
      path: "relocation_policy.enable_level_2",
      message: "Must be false (unsupported)",
    });
  }
  if (p.enable_level_3 !== false) {
    errors.push({
      path: "relocation_policy.enable_level_3",
      message: "Must be false (unsupported)",
    });
  }
}

function validateBooleanField(path: string, value: unknown, errors: ValidationError[]): void {
  if (typeof value !== "boolean") {
    errors.push({ path, message: "Must be boolean" });
  }
}

function validateNumberField(
  path: string,
  value: unknown,
  errors: ValidationError[],
  options: { min?: number; max?: number } = {}
): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push({ path, message: "Must be a number" });
    return;
  }
  if (options.min !== undefined && value < options.min) {
    errors.push({ path, message: `Must be >= ${options.min}` });
  }
  if (options.max !== undefined && value > options.max) {
    errors.push({ path, message: `Must be <= ${options.max}` });
  }
}

function validateEnumField(
  path: string,
  value: unknown,
  allowed: string[],
  errors: ValidationError[]
): void {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push({ path, message: `Must be one of: ${allowed.join(", ")}` });
  }
}

function validateStringArrayField(path: string, value: unknown, errors: ValidationError[]): void {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "Must be an array" });
    return;
  }
  if (!value.every((item) => typeof item === "string")) {
    errors.push({ path, message: "All values must be strings" });
  }
}

function validateOptionalStringArrayField(
  path: string,
  value: unknown,
  errors: ValidationError[]
): void {
  if (value === undefined) {
    return;
  }
  validateStringArrayField(path, value, errors);
}

function validateDevToolingPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "dev_tooling_policy", message: "Must be an object" });
    return;
  }
}

function validateCapabilities(caps: unknown, errors: ValidationError[]): void {
  if (!caps || typeof caps !== "object") {
    errors.push({ path: "capabilities", message: "Must be an object" });
    return;
  }
  const c = caps as Record<string, unknown>;
  const required = [
    "cross_block_annotations",
    "bounded_gap",
    "tables",
    "reorder_blocks",
    "ai_replace_spans",
    "ai_gateway_v2",
    "ai_data_access",
    "ai_audit",
    "ai_deterministic",
    "ai_native",
    "multi_agent",
    "ai_provenance",
    "semantic_merge",
    "ai_transactions",
  ];
  for (const field of required) {
    if (typeof c[field] !== "boolean") {
      errors.push({ path: `capabilities.${field}`, message: "Must be boolean" });
    }
  }
}

function validateConformanceKitPolicy(policy: unknown, errors: ValidationError[]): void {
  if (!policy || typeof policy !== "object") {
    errors.push({ path: "conformance_kit_policy", message: "Must be an object" });
    return;
  }
}

/**
 * Type guard for PolicyManifestV09
 */
export function isPolicyManifestV09(value: unknown): value is PolicyManifestV09 {
  return validateManifest(value).valid;
}
