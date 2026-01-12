/**
 * LFCC v0.9 RC - Policy Negotiation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/02_Policy_Manifest_Schema.md Section 3
 */

import { stableStringify } from "./stableStringify";
import type {
  AINativePolicy,
  AISanitizationPolicy,
  Capabilities,
  ChainKind,
  ChainPolicy,
  ChainPolicyEntry,
  PartialBehavior,
  PolicyManifestV09,
  RelocationPolicy,
  VerifyMode,
} from "./types";
import { DEFAULT_POLICY_MANIFEST } from "./types";

export type NegotiationError = {
  field: string;
  message: string;
  values: string[];
};

export type NegotiationResult =
  | { success: true; manifest: PolicyManifestV09 }
  | { success: false; errors: NegotiationError[] };

/** Chain kind restrictiveness order (most restrictive first) */
const CHAIN_KIND_PREFERENCE: ChainKind[] = ["strict_adjacency", "bounded_gap", "required_order"];

/**
 * Negotiate an effective policy manifest from multiple participants
 * NEG-001: Negotiation MUST be deterministic and commutative
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Negotiation requires explicit compatibility checks
export function negotiate(manifests: PolicyManifestV09[]): NegotiationResult {
  if (manifests.length === 0) {
    return {
      success: false,
      errors: [{ field: "", message: "No manifests provided", values: [] }],
    };
  }

  // Normalize order for determinism (NEG-001)
  const sortedManifests = [...manifests].sort((a, b) => a.policy_id.localeCompare(b.policy_id));

  if (sortedManifests.length === 1) {
    return { success: true, manifest: sortedManifests[0] };
  }

  const errors: NegotiationError[] = [];

  // 1) Check correctness-critical mismatches (hard refusal)
  const coordKinds = sortedManifests.map((m) => m.coords.kind);
  if (!allEqual(coordKinds)) {
    errors.push({
      field: "coords.kind",
      message: "Coordinate system mismatch - co-edit refused",
      values: coordKinds,
    });
  }

  const anchorVersions = sortedManifests.map((m) => m.anchor_encoding.version);
  if (!allEqual(anchorVersions)) {
    errors.push({
      field: "anchor_encoding.version",
      message: "Anchor encoding version mismatch - co-edit refused",
      values: anchorVersions,
    });
  }

  const anchorFormats = sortedManifests.map((m) => m.anchor_encoding.format);
  if (!allEqual(anchorFormats) || anchorFormats[0] !== "base64") {
    errors.push({
      field: "anchor_encoding.format",
      message: "Anchor encoding format mismatch or non-base64 - co-edit refused",
      values: anchorFormats,
    });
  }

  const structureModes = sortedManifests.map((m) => m.structure_mode);
  if (!allEqual(structureModes)) {
    errors.push({
      field: "structure_mode",
      message: "Structure mode mismatch - co-edit refused",
      values: structureModes,
    });
  }

  const blockIdVersions = sortedManifests.map((m) => m.block_id_policy.version);
  if (!areBlockIdPoliciesCompatible(blockIdVersions)) {
    errors.push({
      field: "block_id_policy.version",
      message: "Block ID policy version incompatible - co-edit refused",
      values: blockIdVersions,
    });
  }

  const chainPolicyVersions = sortedManifests.map((m) => m.chain_policy.version);
  if (!allEqual(chainPolicyVersions)) {
    errors.push({
      field: "chain_policy.version",
      message: "Chain policy version mismatch - co-edit refused",
      values: chainPolicyVersions,
    });
  }

  const partialPolicyVersions = sortedManifests.map((m) => m.partial_policy.version);
  if (!allEqual(partialPolicyVersions)) {
    errors.push({
      field: "partial_policy.version",
      message: "Partial policy version mismatch - co-edit refused",
      values: partialPolicyVersions,
    });
  }

  const integrityPolicyVersions = sortedManifests.map((m) => m.integrity_policy.version);
  if (!allEqual(integrityPolicyVersions)) {
    errors.push({
      field: "integrity_policy.version",
      message: "Integrity policy version mismatch - co-edit refused",
      values: integrityPolicyVersions,
    });
  }

  // P0.1: Check canonicalizer_policy version (hard refusal)
  const canonicalizerVersions = sortedManifests.map((m) => m.canonicalizer_policy.version);
  if (!allEqual(canonicalizerVersions)) {
    errors.push({
      field: "canonicalizer_policy.version",
      message: "Canonicalizer policy version mismatch - co-edit refused",
      values: canonicalizerVersions,
    });
  }

  // P0.1: Check history_policy version (hard refusal)
  const historyVersions = sortedManifests.map((m) => m.history_policy.version);
  if (!allEqual(historyVersions)) {
    errors.push({
      field: "history_policy.version",
      message: "History policy version mismatch - co-edit refused",
      values: historyVersions,
    });
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Additional version checks for feature policies
  const aiVersions = sortedManifests.map((m) => m.ai_sanitization_policy.version);
  if (!allEqual(aiVersions)) {
    errors.push({
      field: "ai_sanitization_policy.version",
      message: "AI sanitization policy version mismatch - co-edit refused",
      values: aiVersions,
    });
  }

  const relocationVersions = sortedManifests.map((m) => m.relocation_policy.version);
  if (!allEqual(relocationVersions)) {
    errors.push({
      field: "relocation_policy.version",
      message: "Relocation policy version mismatch - co-edit refused",
      values: relocationVersions,
    });
  }

  const devToolVersions = sortedManifests.map((m) => m.dev_tooling_policy.version);
  if (!allEqual(devToolVersions)) {
    errors.push({
      field: "dev_tooling_policy.version",
      message: "Dev tooling policy version mismatch - co-edit refused",
      values: devToolVersions,
    });
  }

  const conformanceKitVersions = sortedManifests.map((m) => m.conformance_kit_policy.version);
  if (!allEqual(conformanceKitVersions)) {
    errors.push({
      field: "conformance_kit_policy.version",
      message: "Conformance kit policy version mismatch - co-edit refused",
      values: conformanceKitVersions,
    });
  }

  const aiNativePolicies = sortedManifests
    .map((m) => m.ai_native_policy)
    .filter((p): p is AINativePolicy => p !== undefined);
  if (aiNativePolicies.length > 1) {
    const aiNativeVersions = aiNativePolicies.map((p) => p.version);
    if (!allEqual(aiNativeVersions)) {
      errors.push({
        field: "ai_native_policy.version",
        message: "AI native policy version mismatch - co-edit refused",
        values: aiNativeVersions,
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 2) Compute effective capabilities (intersection)
  const effectiveCaps = intersectCapabilities(sortedManifests.map((m) => m.capabilities));

  // 3) Compute effective chain policy (most restrictive)
  const effectiveChainPolicy = restrictChainPolicies(
    sortedManifests.map((m) => m.chain_policy),
    effectiveCaps
  );

  // 4) Compute effective partial policy (most restrictive: none > allow_drop_tail > allow_islands)
  const effectivePartialPolicy = restrictPartialPolicies(
    sortedManifests.map((m) => m.partial_policy)
  );

  // 5) Compute effective integrity policy (eager if any eager; min cadence)
  const effectiveIntegrityPolicy = restrictIntegrityPolicies(
    sortedManifests.map((m) => m.integrity_policy)
  );

  // 6) Compute effective AI sanitization policy (intersect allowed, AND reject flag, min limits)
  const effectiveAISanitizationPolicy = restrictAISanitizationPolicies(
    sortedManifests.map((m) => m.ai_sanitization_policy)
  );

  // 7) Compute effective relocation policy (most restrictive)
  const effectiveRelocationPolicy = restrictRelocationPolicies(
    sortedManifests.map((m) => m.relocation_policy)
  );

  const effectiveAiNativePolicy =
    effectiveCaps.ai_native && aiNativePolicies.length === sortedManifests.length
      ? restrictAiNativePolicies(aiNativePolicies)
      : undefined;

  // 8) Compute effective version (min)
  const effectiveV = Math.min(...sortedManifests.map((m) => m.v));

  // 9) Build effective manifest (use first as base, override computed fields)
  const base = sortedManifests[0];
  const effective: PolicyManifestV09 = {
    ...structuredClone(base),
    policy_id: deterministicPolicyId(sortedManifests),
    v: effectiveV,
    capabilities: effectiveCaps,
    chain_policy: effectiveChainPolicy,
    partial_policy: effectivePartialPolicy,
    integrity_policy: effectiveIntegrityPolicy,
    ai_sanitization_policy: effectiveAISanitizationPolicy,
    ai_native_policy: effectiveAiNativePolicy,
    relocation_policy: effectiveRelocationPolicy,
  };

  return { success: true, manifest: effective };
}

/**
 * Check if all values in array are equal
 */
function allEqual<T>(arr: T[]): boolean {
  return arr.every((v) => v === arr[0]);
}

/**
 * Check if block ID policy versions are compatible
 */
function areBlockIdPoliciesCompatible(versions: string[]): boolean {
  // For now, require exact match. Could be extended for compatible versions.
  return allEqual(versions);
}

/**
 * Deterministic policy_id based on sorted participant IDs + anchor/canonicalizer versions
 */
function deterministicPolicyId(manifests: PolicyManifestV09[]): string {
  const parts = manifests
    .map((m) => `${m.policy_id}|${m.anchor_encoding.version}|${m.canonicalizer_policy.version}`)
    .sort();
  return `negotiated-${stableStringify(parts)}`;
}

/**
 * Compute intersection of capabilities (all must be true)
 */
function intersectCapabilities(caps: Capabilities[]): Capabilities {
  return {
    cross_block_annotations: caps.every((c) => c.cross_block_annotations),
    bounded_gap: caps.every((c) => c.bounded_gap),
    tables: caps.every((c) => c.tables),
    reorder_blocks: caps.every((c) => c.reorder_blocks),
    ai_replace_spans: caps.every((c) => c.ai_replace_spans),
    ai_gateway_v2: caps.every((c) => c.ai_gateway_v2),
    ai_data_access: caps.every((c) => c.ai_data_access),
    ai_audit: caps.every((c) => c.ai_audit),
    ai_deterministic: caps.every((c) => c.ai_deterministic),
    ai_native: caps.every((c) => c.ai_native),
    multi_agent: caps.every((c) => c.multi_agent),
    ai_provenance: caps.every((c) => c.ai_provenance),
    semantic_merge: caps.every((c) => c.semantic_merge),
    ai_transactions: caps.every((c) => c.ai_transactions),
  };
}

/**
 * Compute most restrictive chain policy
 */
function restrictChainPolicies(policies: ChainPolicy[], effectiveCaps: Capabilities): ChainPolicy {
  // Collect all annotation kinds across all policies
  const allKinds = new Set<string>();
  for (const p of policies) {
    for (const kind of Object.keys(p.defaults)) {
      allKinds.add(kind);
    }
  }

  const defaults: Record<string, ChainPolicyEntry> = {};

  for (const annoKind of allKinds) {
    const entries = policies
      .map((p) => p.defaults[annoKind])
      .filter((e): e is ChainPolicyEntry => e !== undefined);

    if (entries.length === 0) {
      continue;
    }

    // Choose most restrictive chain kind
    let mostRestrictiveKind: ChainKind = "required_order";
    for (const pref of CHAIN_KIND_PREFERENCE) {
      if (entries.some((e) => e.kind === pref)) {
        mostRestrictiveKind = pref;
        break;
      }
    }

    // If bounded_gap disabled, degrade to strict_adjacency
    if (!effectiveCaps.bounded_gap && mostRestrictiveKind === "bounded_gap") {
      mostRestrictiveKind = "strict_adjacency";
    }

    // Use min for max_intervening_blocks
    const minBlocks = Math.min(...entries.map((e) => e.max_intervening_blocks));

    defaults[annoKind] = {
      kind: mostRestrictiveKind,
      max_intervening_blocks: minBlocks,
    };
  }

  return {
    version: policies[0].version,
    defaults,
  };
}

/**
 * Compute most restrictive partial policy
 * P0.1: Restrictiveness order: none > allow_drop_tail > allow_islands
 */
function restrictPartialPolicies(
  policies: Array<{ version: string; defaults: Record<string, PartialBehavior> }>
): { version: string; defaults: Record<string, PartialBehavior> } {
  // Collect all annotation kinds
  const allKinds = new Set<string>();
  for (const p of policies) {
    for (const kind of Object.keys(p.defaults)) {
      allKinds.add(kind);
    }
  }

  const defaults: Record<string, PartialBehavior> = {};
  const restrictivenessOrder: PartialBehavior[] = ["none", "allow_drop_tail", "allow_islands"];

  for (const annoKind of allKinds) {
    const behaviors = policies
      .map((p) => p.defaults[annoKind])
      .filter((b): b is PartialBehavior => b !== undefined);

    if (behaviors.length === 0) {
      continue;
    }

    // Choose most restrictive (first in restrictivenessOrder)
    let mostRestrictive: PartialBehavior = "allow_islands";
    for (const pref of restrictivenessOrder) {
      if (behaviors.includes(pref)) {
        mostRestrictive = pref;
        break;
      }
    }

    defaults[annoKind] = mostRestrictive;
  }

  return {
    version: policies[0].version,
    defaults,
  };
}

/**
 * Compute effective integrity policy
 * P0.1: Eager if any eager; checkpoint cadence = min
 */
function restrictIntegrityPolicies(
  policies: Array<{
    version: string;
    context_hash: { enabled: boolean; mode: VerifyMode; debounce_ms: number };
    chain_hash: { enabled: boolean; mode: VerifyMode };
    checkpoint: { enabled: boolean; every_ops: number; every_ms: number };
  }>
): {
  version: string;
  context_hash: { enabled: boolean; mode: VerifyMode; debounce_ms: number };
  chain_hash: { enabled: boolean; mode: VerifyMode };
  checkpoint: { enabled: boolean; every_ops: number; every_ms: number };
} {
  // Eager if any eager
  const contextHashMode: VerifyMode = policies.some((p) => p.context_hash.mode === "eager")
    ? "eager"
    : "lazy_verify";

  const chainHashMode: VerifyMode = policies.some((p) => p.chain_hash.mode === "eager")
    ? "eager"
    : "lazy_verify";

  // Enabled if any enabled
  const contextHashEnabled = policies.some((p) => p.context_hash.enabled);
  const chainHashEnabled = policies.some((p) => p.chain_hash.enabled);
  const checkpointEnabled = policies.some((p) => p.checkpoint.enabled);

  // Min cadence
  const debounceMs = Math.min(...policies.map((p) => p.context_hash.debounce_ms));
  const everyOps = Math.min(...policies.map((p) => p.checkpoint.every_ops));
  const everyMs = Math.min(...policies.map((p) => p.checkpoint.every_ms));

  return {
    version: policies[0].version,
    context_hash: {
      enabled: contextHashEnabled,
      mode: contextHashMode,
      debounce_ms: debounceMs,
    },
    chain_hash: {
      enabled: chainHashEnabled,
      mode: chainHashMode,
    },
    checkpoint: {
      enabled: checkpointEnabled,
      every_ops: everyOps,
      every_ms: everyMs,
    },
  };
}

/**
 * Compute effective relocation policy
 * P0.1: Most restrictive level, AND enable flags
 */
function restrictRelocationPolicies(policies: RelocationPolicy[]): RelocationPolicy {
  return {
    version: policies[0].version,
    // Force Level 1 only (Level 2/3 not implemented)
    default_level: 1,
    enable_level_2: false,
    enable_level_3: false,
    level_2_max_distance_ratio: 0,
    level_3_max_block_radius: 0,
  };
}

/**
 * Compute effective AI sanitization policy
 * P0.1: Intersect allowed marks/blocks, AND reject flag, min limits
 */
type AISanitizationPolicyInput = Omit<AISanitizationPolicy, "limits"> & {
  limits?: Partial<AISanitizationPolicy["limits"]>;
};

function restrictAISanitizationPolicies(
  policies: AISanitizationPolicyInput[]
): AISanitizationPolicy {
  // Intersect allowed marks (all must be present in all policies)
  const allowedMarksSets = policies.map((p) => new Set(p.allowed_marks));
  const allowedMarks = Array.from(allowedMarksSets[0]).filter((mark) =>
    allowedMarksSets.every((s) => s.has(mark))
  );

  // Intersect allowed block types
  const allowedBlockTypesSets = policies.map((p) => new Set(p.allowed_block_types));
  const allowedBlockTypes = Array.from(allowedBlockTypesSets[0]).filter((type) =>
    allowedBlockTypesSets.every((s) => s.has(type))
  );

  // Intersect allowed URL protocols (if any specified; fall back to default)
  const allowedProtocolSets = policies.map(
    (p) =>
      new Set(
        p.allowed_url_protocols ??
          DEFAULT_POLICY_MANIFEST.ai_sanitization_policy.allowed_url_protocols ??
          []
      )
  );
  const allowedUrlProtocols = Array.from(allowedProtocolSets[0]).filter((proto) =>
    allowedProtocolSets.every((s) => s.has(proto))
  );

  // AND reject flag (all must be true)
  const rejectUnknownStructure = policies.every((p) => p.reject_unknown_structure);

  // Min limits
  const fallbackLimits = DEFAULT_POLICY_MANIFEST.ai_sanitization_policy.limits ?? {
    max_payload_bytes: 1024 * 1024,
    max_nesting_depth: 100,
    max_attribute_count: 1000,
  };
  const resolvedLimits = policies.map((p) => ({
    max_payload_bytes: p.limits?.max_payload_bytes ?? fallbackLimits.max_payload_bytes,
    max_nesting_depth: p.limits?.max_nesting_depth ?? fallbackLimits.max_nesting_depth,
    max_attribute_count: p.limits?.max_attribute_count ?? fallbackLimits.max_attribute_count,
  }));
  const maxPayloadBytes = Math.min(...resolvedLimits.map((l) => l.max_payload_bytes));
  const maxNestingDepth = Math.min(...resolvedLimits.map((l) => l.max_nesting_depth));
  const maxAttributeCount = Math.min(...resolvedLimits.map((l) => l.max_attribute_count));

  return {
    version: policies[0].version,
    sanitize_mode: policies[0].sanitize_mode, // Should be same for all
    allowed_marks: allowedMarks,
    allowed_block_types: allowedBlockTypes,
    allowed_url_protocols: allowedUrlProtocols,
    reject_unknown_structure: rejectUnknownStructure,
    limits: {
      max_payload_bytes: maxPayloadBytes,
      max_nesting_depth: maxNestingDepth,
      max_attribute_count: maxAttributeCount,
    },
  };
}

function restrictAiNativePolicies(policies: AINativePolicy[]): AINativePolicy {
  const maxOpsPerRequest = Math.min(...policies.map((p) => p.gateway.max_ops_per_request));
  const maxPayloadBytes = Math.min(...policies.map((p) => p.gateway.max_payload_bytes));
  const idempotencyWindowMs = Math.min(...policies.map((p) => p.gateway.idempotency_window_ms));

  const requireSignedRequests = policies.some((p) => p.security.require_signed_requests);
  const agentTokenTtlMs = Math.min(...policies.map((p) => p.security.agent_token_ttl_ms));
  const auditRetentionDays = Math.min(...policies.map((p) => p.security.audit_retention_days));
  const allowExternalModels = policies.every((p) => p.security.allow_external_models);

  const maxContextChars = Math.min(...policies.map((p) => p.data_access.max_context_chars));
  const allowBlockSets = policies
    .map((p) => p.data_access.allow_blocks)
    .filter((blocks): blocks is string[] => Array.isArray(blocks));
  const denyBlockSets = policies
    .map((p) => p.data_access.deny_blocks)
    .filter((blocks): blocks is string[] => Array.isArray(blocks));
  const allowBlocks = allowBlockSets.length > 0 ? intersectArrays(allowBlockSets) : undefined;
  const denyBlocks = denyBlockSets.length > 0 ? unionArrays(denyBlockSets) : undefined;
  const redactionStrategy = pickMostRestrictive(
    policies.map((p) => p.data_access.redaction_strategy),
    ["omit", "mask"]
  );
  const piiHandling = pickMostRestrictive(
    policies.map((p) => p.data_access.pii_handling),
    ["block", "mask", "allow"]
  );
  const allowExternalFetch = policies.every((p) => p.data_access.allow_external_fetch);

  const requireExplicitOps = policies.some((p) => p.determinism.require_explicit_ops);

  const agentCoordinationEnabled = policies.every((p) => p.agent_coordination.enabled);
  const maxConcurrentAgents = Math.min(
    ...policies.map((p) => p.agent_coordination.max_concurrent_agents)
  );
  const requireAgentRegistration = policies.some(
    (p) => p.agent_coordination.require_agent_registration
  );
  const claimTimeoutMs = Math.min(...policies.map((p) => p.agent_coordination.claim_timeout_ms));

  const intentTrackingEnabled = policies.every((p) => p.intent_tracking.enabled);
  const requireIntent = policies.some((p) => p.intent_tracking.require_intent);
  const intentRetentionDays = Math.min(
    ...policies.map((p) => p.intent_tracking.intent_retention_days)
  );

  const provenanceEnabled = policies.every((p) => p.provenance.enabled);
  const trackInline = policies.every((p) => p.provenance.track_inline);
  const requireModelId = policies.some((p) => p.provenance.require_model_id);
  const storeRationaleSummary = policies.every((p) => p.provenance.store_rationale_summary);

  const semanticMergeEnabled = policies.every((p) => p.semantic_merge.enabled);
  const aiAutonomy = pickMostRestrictive(
    policies.map((p) => p.semantic_merge.ai_autonomy),
    ["disabled", "suggest_only", "full"]
  );
  const autoMergeThreshold = Math.max(
    ...policies.map((p) => p.semantic_merge.auto_merge_threshold)
  );
  const preferHumanEdits = policies.some((p) => p.semantic_merge.prefer_human_edits);
  const maxAutoMergeComplexity = pickMostRestrictive(
    policies.map((p) => p.semantic_merge.max_auto_merge_complexity),
    ["trivial", "simple", "complex"]
  );

  const transactionsEnabled = policies.every((p) => p.transactions.enabled);
  const defaultAtomicity = pickMostRestrictive(
    policies.map((p) => p.transactions.default_atomicity),
    ["all_or_nothing", "best_effort", "partial_allowed"]
  );
  const defaultTimeoutMs = Math.min(...policies.map((p) => p.transactions.default_timeout_ms));
  const maxOperationsPerTxn = Math.min(
    ...policies.map((p) => p.transactions.max_operations_per_txn)
  );

  const allowedOps = intersectArrays(policies.map((p) => p.ai_opcodes.allowed));
  const requireApproval = unionArrays(policies.map((p) => p.ai_opcodes.require_approval));

  return {
    version: policies[0].version,
    gateway: {
      max_ops_per_request: maxOpsPerRequest,
      max_payload_bytes: maxPayloadBytes,
      idempotency_window_ms: idempotencyWindowMs,
    },
    security: {
      require_signed_requests: requireSignedRequests,
      agent_token_ttl_ms: agentTokenTtlMs,
      audit_retention_days: auditRetentionDays,
      allow_external_models: allowExternalModels,
    },
    data_access: {
      max_context_chars: maxContextChars,
      allow_blocks: allowBlocks,
      deny_blocks: denyBlocks,
      redaction_strategy: redactionStrategy,
      pii_handling: piiHandling,
      allow_external_fetch: allowExternalFetch,
    },
    determinism: {
      require_explicit_ops: requireExplicitOps,
    },
    agent_coordination: {
      enabled: agentCoordinationEnabled,
      max_concurrent_agents: maxConcurrentAgents,
      require_agent_registration: requireAgentRegistration,
      claim_timeout_ms: claimTimeoutMs,
    },
    intent_tracking: {
      enabled: intentTrackingEnabled,
      require_intent: requireIntent,
      intent_retention_days: intentRetentionDays,
    },
    provenance: {
      enabled: provenanceEnabled,
      track_inline: trackInline,
      require_model_id: requireModelId,
      store_rationale_summary: storeRationaleSummary,
    },
    semantic_merge: {
      enabled: semanticMergeEnabled,
      ai_autonomy: aiAutonomy,
      auto_merge_threshold: autoMergeThreshold,
      prefer_human_edits: preferHumanEdits,
      max_auto_merge_complexity: maxAutoMergeComplexity,
    },
    transactions: {
      enabled: transactionsEnabled,
      default_atomicity: defaultAtomicity,
      default_timeout_ms: defaultTimeoutMs,
      max_operations_per_txn: maxOperationsPerTxn,
    },
    ai_opcodes: {
      allowed: allowedOps,
      require_approval: requireApproval,
    },
  };
}

function pickMostRestrictive<T extends string>(values: T[], order: T[]): T {
  for (const value of order) {
    if (values.includes(value)) {
      return value;
    }
  }
  return order[0];
}

function intersectArrays<T>(arrays: T[][]): T[] {
  if (arrays.length === 0) {
    return [];
  }
  return arrays.reduce((acc, current) => acc.filter((item) => current.includes(item)));
}

function unionArrays<T>(arrays: T[][]): T[] {
  const result = new Set<T>();
  for (const arr of arrays) {
    for (const item of arr) {
      result.add(item);
    }
  }
  return Array.from(result);
}

/**
 * Check if two manifests are compatible for co-editing
 */
export function areManifestsCompatible(a: PolicyManifestV09, b: PolicyManifestV09): boolean {
  const aiNativeCompatible =
    a.ai_native_policy?.version === undefined ||
    b.ai_native_policy?.version === undefined ||
    a.ai_native_policy.version === b.ai_native_policy.version;

  return (
    a.coords.kind === b.coords.kind &&
    a.anchor_encoding.version === b.anchor_encoding.version &&
    a.anchor_encoding.format === b.anchor_encoding.format &&
    a.structure_mode === b.structure_mode &&
    a.block_id_policy.version === b.block_id_policy.version &&
    a.chain_policy.version === b.chain_policy.version &&
    a.partial_policy.version === b.partial_policy.version &&
    a.integrity_policy.version === b.integrity_policy.version &&
    a.canonicalizer_policy.version === b.canonicalizer_policy.version &&
    a.history_policy.version === b.history_policy.version &&
    a.ai_sanitization_policy.version === b.ai_sanitization_policy.version &&
    a.relocation_policy.version === b.relocation_policy.version &&
    a.dev_tooling_policy.version === b.dev_tooling_policy.version &&
    a.conformance_kit_policy.version === b.conformance_kit_policy.version &&
    aiNativeCompatible
  );
}
