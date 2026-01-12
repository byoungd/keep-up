# Policy Manifest Schema (JSON Schema + TypeScript) — v0.9 RC

**Applies to:** LFCC v0.9 RC  
**Last updated:** 2025-12-31  
**Audience:** Web/iOS/Android leads, platform architects, integration owners.  
**Source of truth:** LFCC v0.9 RC §2.

**See also:** `23_AI_Native_Extension.md` (AI-native policy extension details).

---

## 0. Goals

1. Provide a **machine-validatable** schema for the Policy Manifest.
2. Provide a **deterministic negotiation** reference (pseudocode).
3. Provide shared enums and constraints (no divergent interpretations).

---

## 1. TypeScript Interfaces (Reference)

```ts
export type StructureMode = "A" | "B";

export type ChainKind = "strict_adjacency" | "required_order" | "bounded_gap";

export type PartialBehavior = "allow_drop_tail" | "allow_islands" | "none";

export type CanonMark =
  | "bold" | "italic" | "underline" | "strike" | "code" | "link";

export type PolicyManifestV09 = {
  lfcc_version: "0.9";
  policy_id: string;

  coords: { kind: "utf16" };
  anchor_encoding: { version: string; format: "base64" | "bytes" };

  structure_mode: StructureMode;

  block_id_policy: { version: string; overrides: Record<string, unknown> };

  chain_policy: {
    version: string;
    defaults: Record<string, { kind: ChainKind; max_intervening_blocks: number }>;
  };

  partial_policy: {
    version: string;
    defaults: Record<string, PartialBehavior>;
  };

  integrity_policy: {
    version: string;
    context_hash: { enabled: boolean; mode: "lazy_verify" | "eager"; debounce_ms: number };
    chain_hash: { enabled: boolean; mode: "eager" | "lazy_verify" };
    checkpoint: { enabled: boolean; every_ops: number; every_ms: number };
  };

  canonicalizer_policy: {
    version: "v2";
    mode: "recursive_tree";
    mark_order: CanonMark[];
    normalize_whitespace: boolean;
    drop_empty_nodes: boolean;
  };

  history_policy: {
    version: "v1";
    trusted_local_undo: boolean;
    restore_enters_unverified: boolean;
    restore_skip_grace: boolean;
    force_verify_on_restore: boolean;
  };

  ai_sanitization_policy: {
    version: "v1";
    sanitize_mode: "whitelist";
    allowed_marks: CanonMark[];
    allowed_block_types: string[];
    reject_unknown_structure: boolean;
    limits: {
      max_payload_bytes: number;
      max_nesting_depth: number;
      max_attribute_count: number;
    };
  };

  relocation_policy: {
    version: "v2";
    default_level: 1 | 2 | 3;
    enable_level_2: boolean;
    enable_level_3: boolean;
    level_2_max_distance_ratio: number;  // 0..1
    level_3_max_block_radius: number;    // >=0
  };

  dev_tooling_policy: {
    version: "v2";
    force_full_scan_button: boolean;
    state_visualizer: boolean;
  };

  capabilities: {
    cross_block_annotations: boolean;
    bounded_gap: boolean;
    tables: boolean;
    reorder_blocks: boolean;
    ai_replace_spans: boolean;
  };

  conformance_kit_policy: {
    version: "v1";
    kernel_recommended: boolean;
    kernel_required_in_repo: boolean;
  };

  extensions?: Record<string, unknown>;
  v: number;
};
```

---

### 1.2 AI-native Extension (v0.9.1 optional)

AI-native fields are optional and only used when negotiated. For v0.9 peers, place AI-native fields under `extensions.ai_native` to avoid unknown top-level fields.

```ts
export type AiNativeCapabilities = {
  ai_gateway_v2?: boolean;
  ai_native?: boolean;
  ai_provenance?: boolean;
  ai_data_access?: boolean;
  ai_audit?: boolean;
  ai_transactions?: boolean;
  semantic_merge?: boolean;
  multi_agent?: boolean;
};

export type AiNativePolicyV1 = {
  version: "v1";
  gateway: {
    max_ops_per_request: number;
    max_payload_bytes: number;
    idempotency_window_ms: number;
  };
  security: {
    require_signed_requests: boolean;
    agent_token_ttl_ms: number;
    audit_retention_days: number;
    allow_external_models: boolean;
  };
  data_access: {
    max_context_chars: number;
    redaction_strategy: "mask" | "omit";
    pii_handling: "block" | "mask" | "allow";
    allow_external_fetch: boolean;
  };
  determinism: {
    require_explicit_ops: boolean;
  };
  intent_tracking: {
    enabled: boolean;
    require_intent: boolean;
    intent_retention_days: number;
  };
  provenance: {
    enabled: boolean;
    track_inline: boolean;
    require_model_id: boolean;
  };
  semantic_merge: {
    enabled: boolean;
    ai_autonomy: "disabled" | "suggest_only" | "full";
    auto_merge_threshold: number; // 0..1
  };
  transactions: {
    enabled: boolean;
    default_timeout_ms: number;
    max_operations_per_txn: number;
  };
  ai_opcodes: {
    allowed: string[];
    require_approval: string[];
  };
};

export type PolicyManifestV091 = PolicyManifestV09 & {
  lfcc_version: "0.9.1";
  ai_native_policy?: AiNativePolicyV1;
  capabilities: PolicyManifestV09["capabilities"] & AiNativeCapabilities;
};
```

See `23_AI_Native_Extension.md` for negotiation rules and normative requirements, including the audit requirement when `ai_autonomy` is `full`.

## 2. JSON Schema (Draft 2020-12) — Reference

> This schema is intended to be copied into a repo as `policy_manifest.schema.json`.
> For v0.9.1 with AI-native, see `policy_manifest_v0.9.1.schema.json` in this directory.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.org/lfcc/policy_manifest_v0.9.schema.json",
  "type": "object",
  "required": [
    "lfcc_version","policy_id","coords","anchor_encoding","structure_mode",
    "block_id_policy","chain_policy","partial_policy","integrity_policy",
    "canonicalizer_policy","history_policy","ai_sanitization_policy",
    "relocation_policy","dev_tooling_policy","capabilities","conformance_kit_policy","v"
  ],
  "properties": {
    "lfcc_version": { "const": "0.9" },
    "policy_id": { "type": "string", "minLength": 1 },

    "coords": {
      "type": "object",
      "required": ["kind"],
      "properties": { "kind": { "const": "utf16" } },
      "additionalProperties": false
    },

    "anchor_encoding": {
      "type": "object",
      "required": ["version","format"],
      "properties": {
        "version": { "type": "string", "minLength": 1 },
        "format": { "enum": ["base64","bytes"] }
      },
      "additionalProperties": false
    },

    "structure_mode": { "enum": ["A","B"] },

    "block_id_policy": {
      "type": "object",
      "required": ["version","overrides"],
      "properties": {
        "version": { "type": "string", "minLength": 1 },
        "overrides": { "type": "object" }
      },
      "additionalProperties": false
    },

    "chain_policy": {
      "type": "object",
      "required": ["version","defaults"],
      "properties": {
        "version": { "type": "string" },
        "defaults": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "required": ["kind","max_intervening_blocks"],
            "properties": {
              "kind": { "enum": ["strict_adjacency","required_order","bounded_gap"] },
              "max_intervening_blocks": { "type": "integer", "minimum": 0 }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },

    "partial_policy": {
      "type": "object",
      "required": ["version","defaults"],
      "properties": {
        "version": { "type": "string" },
        "defaults": {
          "type": "object",
          "additionalProperties": { "enum": ["allow_drop_tail","allow_islands","none"] }
        }
      },
      "additionalProperties": false
    },

    "integrity_policy": {
      "type": "object",
      "required": ["version","context_hash","chain_hash","checkpoint"],
      "properties": {
        "version": { "type": "string" },
        "context_hash": {
          "type": "object",
          "required": ["enabled","mode","debounce_ms"],
          "properties": {
            "enabled": { "type": "boolean" },
            "mode": { "enum": ["lazy_verify","eager"] },
            "debounce_ms": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        },
        "chain_hash": {
          "type": "object",
          "required": ["enabled","mode"],
          "properties": {
            "enabled": { "type": "boolean" },
            "mode": { "enum": ["eager","lazy_verify"] }
          },
          "additionalProperties": false
        },
        "checkpoint": {
          "type": "object",
          "required": ["enabled","every_ops","every_ms"],
          "properties": {
            "enabled": { "type": "boolean" },
            "every_ops": { "type": "integer", "minimum": 1 },
            "every_ms": { "type": "integer", "minimum": 1 }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },

    "canonicalizer_policy": {
      "type": "object",
      "required": ["version","mode","mark_order","normalize_whitespace","drop_empty_nodes"],
      "properties": {
        "version": { "const": "v2" },
        "mode": { "const": "recursive_tree" },
        "mark_order": {
          "type": "array",
          "items": { "enum": ["bold","italic","underline","strike","code","link"] },
          "minItems": 1,
          "uniqueItems": true
        },
        "normalize_whitespace": { "type": "boolean" },
        "drop_empty_nodes": { "type": "boolean" }
      },
      "additionalProperties": false
    },

    "history_policy": {
      "type": "object",
      "required": ["version","trusted_local_undo","restore_enters_unverified","restore_skip_grace","force_verify_on_restore"],
      "properties": {
        "version": { "const": "v1" },
        "trusted_local_undo": { "type": "boolean" },
        "restore_enters_unverified": { "type": "boolean" },
        "restore_skip_grace": { "type": "boolean" },
        "force_verify_on_restore": { "type": "boolean" }
      },
      "additionalProperties": false
    },

    "ai_sanitization_policy": {
      "type": "object",
      "required": [
        "version",
        "sanitize_mode",
        "allowed_marks",
        "allowed_block_types",
        "reject_unknown_structure",
        "limits"
      ],
      "properties": {
        "version": { "const": "v1" },
        "sanitize_mode": { "const": "whitelist" },
        "allowed_marks": {
          "type": "array",
          "items": { "enum": ["bold","italic","underline","strike","code","link"] }
        },
        "allowed_block_types": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 }
        },
        "reject_unknown_structure": { "type": "boolean" },
        "limits": {
          "type": "object",
          "required": ["max_payload_bytes","max_nesting_depth","max_attribute_count"],
          "properties": {
            "max_payload_bytes": { "type": "integer", "minimum": 1 },
            "max_nesting_depth": { "type": "integer", "minimum": 1 },
            "max_attribute_count": { "type": "integer", "minimum": 1 }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },

    "relocation_policy": {
      "type": "object",
      "required": ["version","default_level","enable_level_2","enable_level_3","level_2_max_distance_ratio","level_3_max_block_radius"],
      "properties": {
        "version": { "const": "v2" },
        "default_level": { "enum": [1,2,3] },
        "enable_level_2": { "type": "boolean" },
        "enable_level_3": { "type": "boolean" },
        "level_2_max_distance_ratio": { "type": "number", "minimum": 0, "maximum": 1 },
        "level_3_max_block_radius": { "type": "integer", "minimum": 0 }
      },
      "additionalProperties": false
    },

    "dev_tooling_policy": {
      "type": "object",
      "required": ["version","force_full_scan_button","state_visualizer"],
      "properties": {
        "version": { "const": "v2" },
        "force_full_scan_button": { "type": "boolean" },
        "state_visualizer": { "type": "boolean" }
      },
      "additionalProperties": false
    },

    "capabilities": {
      "type": "object",
      "required": ["cross_block_annotations","bounded_gap","tables","reorder_blocks","ai_replace_spans"],
      "properties": {
        "cross_block_annotations": { "type": "boolean" },
        "bounded_gap": { "type": "boolean" },
        "tables": { "type": "boolean" },
        "reorder_blocks": { "type": "boolean" },
        "ai_replace_spans": { "type": "boolean" }
      },
      "additionalProperties": false
    },

    "conformance_kit_policy": {
      "type": "object",
      "required": ["version","kernel_recommended","kernel_required_in_repo"],
      "properties": {
        "version": { "const": "v1" },
        "kernel_recommended": { "type": "boolean" },
        "kernel_required_in_repo": { "type": "boolean" }
      },
      "additionalProperties": false
    },

    "extensions": {
      "type": "object",
      "additionalProperties": true
    },

    "v": { "type": "integer", "minimum": 1 }
  },
  "additionalProperties": false
}
```

---

## 3. Negotiation Pseudocode (Normative Reference)

```ts
function negotiate(manifests: PolicyManifestV09[]): PolicyManifestV09 {
  // 1) Reject if any correctness-critical mismatch.
  assertAllEqual(manifests.map(m => m.coords.kind));
  assertAllEqual(manifests.map(m => m.anchor_encoding.version));
  assertAllEqual(manifests.map(m => stableStringify(m.canonicalizer_policy)));
  assertAllEqual(manifests.map(m => stableStringify(m.history_policy)));
  assertAllCompatibleBlockIdPolicy(manifests.map(m => m.block_id_policy.version));

  // 2) Capabilities = intersection
  const caps = intersectBooleans(manifests.map(m => m.capabilities));

  // 3) Parameter policies: choose most restrictive compatible setting.
  const chainKindPreference = ["strict_adjacency","bounded_gap","required_order"]; // restrictive -> permissive
  const effective = deepClone(manifests[0]);

  effective.capabilities = caps;
  effective.chain_policy = restrictChainPolicies(
    manifests.map(m => m.chain_policy),
    chainKindPreference,
    caps
  );

  // 4) Numeric restrictions: use min()
  effective.chain_policy = applyMinGap(effective.chain_policy, manifests);
  effective.partial_policy = restrictPartialPolicies(manifests.map(m => m.partial_policy));
  effective.integrity_policy = restrictIntegrityPolicies(manifests.map(m => m.integrity_policy));
  effective.relocation_policy = restrictRelocationPolicies(manifests.map(m => m.relocation_policy));
  effective.ai_sanitization_policy = restrictAiSanitization(manifests.map(m => m.ai_sanitization_policy));

  return effective;
}
```

Rules:
- For `max_intervening_blocks`: choose `min()`.
- If `bounded_gap=false` in effective caps → chain kind MUST degrade to `strict_adjacency`.
- For dev tooling fields: may differ per replica; ignore or treat as non-blocking.
- Unknown top-level fields MUST be rejected unless under `extensions`.
### 3.1 AI-native Negotiation (Optional)
If AI-native fields are present and supported by all participants, negotiate them using the restriction rules in `23_AI_Native_Extension.md`. If any participant lacks AI-native support, treat AI-native as disabled and fall back to v0.9 behavior.
