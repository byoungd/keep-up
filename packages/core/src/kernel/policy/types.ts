/**
 * LFCC v0.9 RC - Policy Manifest Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/02_Policy_Manifest_Schema.md
 */

import type { AIOpCode } from "../ai/opcodes.js";
import type { DataAccessPolicy } from "../ai/types.js";
import type { CanonMark } from "../canonicalizer/types.js";

export type { CanonMark };

/** Structure mode: A (CRDT-native) or B (Shadow Model) */
export type StructureMode = "A" | "B";

/** Chain policy kinds in order of restrictiveness */
export type ChainKind = "strict_adjacency" | "required_order" | "bounded_gap";

/** Partial resolution behavior */
export type PartialBehavior = "allow_drop_tail" | "allow_islands" | "none";

/** Integrity verification mode */
export type VerifyMode = "lazy_verify" | "eager";

/** Coordinate system */
export type CoordKind = "utf16";

/** Anchor encoding format */
export type AnchorFormat = "base64" | "bytes";

/** Chain policy for a specific annotation kind */
export type ChainPolicyEntry = {
  kind: ChainKind;
  max_intervening_blocks: number;
};

/** Coordinates policy */
export type CoordsPolicy = {
  kind: CoordKind;
};

/** Anchor encoding policy */
export type AnchorEncodingPolicy = {
  version: string;
  format: AnchorFormat;
};

/** Block ID policy */
export type BlockIdPolicy = {
  version: string;
  overrides: Record<string, unknown>;
};

/** Chain policy */
export type ChainPolicy = {
  version: string;
  defaults: Record<string, ChainPolicyEntry>;
};

/** Partial resolution policy */
export type PartialPolicy = {
  version: string;
  defaults: Record<string, PartialBehavior>;
};

/** Context hash settings */
export type ContextHashPolicy = {
  enabled: boolean;
  mode: VerifyMode;
  debounce_ms: number;
};

/** Chain hash settings */
export type ChainHashPolicy = {
  enabled: boolean;
  mode: VerifyMode;
};

/** Document checksum algorithm */
export type DocumentChecksumAlgorithm = "LFCC_DOC_V1";

/** Document checksum settings */
export type DocumentChecksumPolicy = {
  enabled: boolean;
  mode: VerifyMode;
  strategy: "two_tier";
  algorithm: DocumentChecksumAlgorithm;
};

/** Checkpoint settings */
export type CheckpointPolicy = {
  enabled: boolean;
  every_ops: number;
  every_ms: number;
};

/** Integrity policy */
export type IntegrityPolicy = {
  version: string;
  context_hash: ContextHashPolicy;
  chain_hash: ChainHashPolicy;
  document_checksum: DocumentChecksumPolicy;
  checkpoint: CheckpointPolicy;
};

/** Canonicalizer policy */
export type CanonicalizerPolicy = {
  version: "v2";
  mode: "recursive_tree";
  mark_order: CanonMark[];
  normalize_whitespace: boolean;
  drop_empty_nodes: boolean;
};

/** History/Undo policy */
export type HistoryPolicy = {
  version: "v1";
  trusted_local_undo: boolean;
  restore_enters_unverified: boolean;
  restore_skip_grace: boolean;
  force_verify_on_restore: boolean;
};

/** AI sanitization policy limits */
export type AISanitizationLimits = {
  max_payload_bytes: number;
  max_nesting_depth: number;
  max_attribute_count: number;
};

/** AI sanitization policy */
export type AISanitizationPolicy = {
  version: "v1";
  sanitize_mode: "whitelist";
  allowed_marks: CanonMark[];
  allowed_block_types: string[];
  reject_unknown_structure: boolean;
  allowed_url_protocols?: string[];
  limits?: AISanitizationLimits;
};

export type MarkdownBlockType =
  | "md_document"
  | "md_frontmatter"
  | "md_heading"
  | "md_paragraph"
  | "md_code_fence"
  | "md_code_indent"
  | "md_blockquote"
  | "md_list"
  | "md_list_item"
  | "md_table"
  | "md_table_row"
  | "md_table_cell"
  | "md_thematic_break"
  | "md_link_def"
  | "md_html_block"
  | "md_math_block";

export type MarkdownMark =
  | "md_strong"
  | "md_emphasis"
  | "md_code_span"
  | "md_strikethrough"
  | "md_link"
  | "md_image"
  | "md_autolink"
  | "md_html_inline"
  | "md_math_inline"
  | "md_wikilink"
  | "md_footnote_ref";

export type MarkdownCanonicalizerPolicyV1 = {
  version: "v1";
  mode: "source_preserving" | "normalized";
  line_ending: "lf";
  preserve: {
    trailing_whitespace: boolean;
    multiple_blank_lines: boolean;
    heading_style: boolean;
    list_marker_style: boolean;
    emphasis_style: boolean;
    fence_style: boolean;
  };
  normalize: {
    heading_style: "atx";
    list_marker: "-";
    emphasis_char: "*";
    fence_char: "`";
    fence_length: number;
  };
};

export type MarkdownSanitizationPolicyV1 = {
  version: "v1";
  allowed_block_types: MarkdownBlockType[];
  allowed_mark_types: MarkdownMark[];
  allow_html_blocks: boolean;
  allow_frontmatter: boolean;
  reject_unknown_structure: boolean;
  allowed_languages?: string[];
  blocked_languages?: string[];
  max_code_fence_lines: number;
  link_url_policy: "strict" | "moderate" | "permissive";
  image_url_policy: "strict" | "moderate" | "permissive";
  max_file_lines: number;
  max_line_length: number;
  max_heading_depth: number;
  max_list_depth: number;
  max_frontmatter_bytes: number;
};

export type MarkdownTargetingPolicyV1 = {
  require_content_hash: boolean;
  require_context: boolean;
  max_semantic_search_lines: number;
  max_context_prefix_chars: number;
};

export type CodeFenceValidationPolicy = {
  strict_syntax_check: boolean;
  allowed_languages: string[];
  fallback_language?: string;
};

export type MarkdownPolicyV1 = {
  version: "v1";
  enabled: boolean;
  parser: {
    profile: "commonmark_0_30";
    extensions: {
      gfm_tables: boolean;
      gfm_task_lists: boolean;
      gfm_strikethrough: boolean;
      gfm_autolink: boolean;
      footnotes: boolean;
      wikilinks: boolean;
      math: boolean;
    };
    frontmatter_formats: Array<"yaml" | "toml" | "json">;
  };
  canonicalizer: MarkdownCanonicalizerPolicyV1;
  sanitization: MarkdownSanitizationPolicyV1;
  targeting: MarkdownTargetingPolicyV1;
};

/** AI gateway limits */
export type AIGatewayPolicy = {
  max_ops_per_request: number;
  max_payload_bytes: number;
  idempotency_window_ms: number;
};

/** AI security policy */
export type AISecurityPolicy = {
  require_signed_requests: boolean;
  agent_token_ttl_ms: number;
  audit_retention_days: number;
  allow_external_models: boolean;
};

/** AI data access policy */
export type AIDataAccessPolicy = DataAccessPolicy & {
  allow_external_fetch: boolean;
};

/** Determinism policy for AI ops */
export type AIDeterminismPolicy = {
  require_explicit_ops: boolean;
};

/** Agent coordination policy */
export type AIAgentCoordinationPolicy = {
  enabled: boolean;
  max_concurrent_agents: number;
  require_agent_registration: boolean;
  claim_timeout_ms: number;
};

/** Intent tracking policy */
export type AIIntentTrackingPolicy = {
  enabled: boolean;
  require_intent: boolean;
  intent_retention_days: number;
};

/** Provenance tracking policy */
export type AIProvenancePolicy = {
  enabled: boolean;
  track_inline: boolean;
  require_model_id: boolean;
  store_rationale_summary: boolean;
};

/** Semantic merge policy */
export type AISemanticMergePolicy = {
  enabled: boolean;
  ai_autonomy: "full" | "suggest_only" | "disabled";
  auto_merge_threshold: number;
  prefer_human_edits: boolean;
  max_auto_merge_complexity: "trivial" | "simple" | "complex";
};

/** AI transaction policy */
export type AITransactionPolicy = {
  enabled: boolean;
  default_atomicity: "all_or_nothing" | "best_effort" | "partial_allowed";
  default_timeout_ms: number;
  max_operations_per_txn: number;
};

/** AI opcode policy */
export type AIOpCodePolicy = {
  allowed: AIOpCode[];
  require_approval: AIOpCode[];
};

/** AI-native policy bundle */
export type AINativePolicy = {
  version: "v1";
  gateway: AIGatewayPolicy;
  security: AISecurityPolicy;
  data_access: AIDataAccessPolicy;
  determinism: AIDeterminismPolicy;
  agent_coordination: AIAgentCoordinationPolicy;
  intent_tracking: AIIntentTrackingPolicy;
  provenance: AIProvenancePolicy;
  semantic_merge: AISemanticMergePolicy;
  transactions: AITransactionPolicy;
  ai_opcodes: AIOpCodePolicy;
};

/** Relocation policy for conflict resolution */
export type RelocationPolicy = {
  version: "v2";
  default_level: 1 | 2 | 3;
  /** @deprecated Level 2 is not implemented; forced to false */
  enable_level_2: false;
  /** @deprecated Level 3 is not implemented; forced to false */
  enable_level_3: false;
  level_2_max_distance_ratio: number;
  level_3_max_block_radius: number;
};

/** Dev tooling policy */
export type DevToolingPolicy = {
  version: "v2";
  force_full_scan_button: boolean;
  state_visualizer: boolean;
};

/** Capabilities flags */
export type Capabilities = {
  cross_block_annotations: boolean;
  bounded_gap: boolean;
  tables: boolean;
  reorder_blocks: boolean;
  ai_replace_spans: boolean;
  ai_gateway_v2: boolean;
  ai_data_access: boolean;
  ai_audit: boolean;
  ai_deterministic: boolean;
  ai_native: boolean;
  multi_agent: boolean;
  ai_provenance: boolean;
  semantic_merge: boolean;
  ai_transactions: boolean;
  markdown_content_mode?: boolean;
  markdown_frontmatter?: boolean;
  markdown_frontmatter_json?: boolean;
  markdown_code_fence_syntax?: boolean;
  markdown_line_targeting?: boolean;
  markdown_semantic_targeting?: boolean;
  markdown_gfm_tables?: boolean;
  markdown_gfm_task_lists?: boolean;
  markdown_gfm_strikethrough?: boolean;
  markdown_gfm_autolink?: boolean;
  markdown_footnotes?: boolean;
  markdown_wikilinks?: boolean;
  markdown_math?: boolean;
};

/** Conformance kit policy */
export type ConformanceKitPolicy = {
  version: "v1";
  kernel_recommended: boolean;
  kernel_required_in_repo: boolean;
};

/** Complete Policy Manifest v0.9 */
export type PolicyManifestV09 = {
  lfcc_version: "0.9" | "0.9.1" | "0.9.5";
  policy_id: string;
  coords: CoordsPolicy;
  anchor_encoding: AnchorEncodingPolicy;
  structure_mode: StructureMode;
  block_id_policy: BlockIdPolicy;
  chain_policy: ChainPolicy;
  partial_policy: PartialPolicy;
  integrity_policy: IntegrityPolicy;
  canonicalizer_policy: CanonicalizerPolicy;
  history_policy: HistoryPolicy;
  ai_sanitization_policy: AISanitizationPolicy;
  ai_native_policy?: AINativePolicy;
  markdown_policy?: MarkdownPolicyV1;
  relocation_policy: RelocationPolicy;
  dev_tooling_policy: DevToolingPolicy;
  capabilities: Capabilities;
  conformance_kit_policy: ConformanceKitPolicy;
  extensions?: Record<string, unknown>; // P0.1: Extensions support
  v: number;
};

/** Default policy manifest */
export const DEFAULT_POLICY_MANIFEST: PolicyManifestV09 = {
  lfcc_version: "0.9.1",
  policy_id: "default",
  coords: { kind: "utf16" },
  anchor_encoding: { version: "v2", format: "base64" },
  structure_mode: "B",
  block_id_policy: { version: "v1", overrides: {} },
  chain_policy: {
    version: "v5",
    defaults: {
      highlight: { kind: "strict_adjacency", max_intervening_blocks: 0 },
      comment: { kind: "required_order", max_intervening_blocks: 0 },
      suggestion: { kind: "strict_adjacency", max_intervening_blocks: 0 },
    },
  },
  partial_policy: {
    version: "v4",
    defaults: {
      highlight: "allow_drop_tail",
      comment: "allow_islands",
      suggestion: "none",
    },
  },
  integrity_policy: {
    version: "v3",
    context_hash: { enabled: true, mode: "lazy_verify", debounce_ms: 500 },
    chain_hash: { enabled: true, mode: "eager" },
    document_checksum: {
      enabled: true,
      mode: "lazy_verify",
      strategy: "two_tier",
      algorithm: "LFCC_DOC_V1",
    },
    checkpoint: { enabled: true, every_ops: 200, every_ms: 5000 },
  },
  canonicalizer_policy: {
    version: "v2",
    mode: "recursive_tree",
    mark_order: ["bold", "italic", "underline", "strike", "code", "link"],
    normalize_whitespace: true,
    drop_empty_nodes: true,
  },
  history_policy: {
    version: "v1",
    trusted_local_undo: true,
    restore_enters_unverified: true,
    restore_skip_grace: true,
    force_verify_on_restore: true,
  },
  ai_sanitization_policy: {
    version: "v1",
    sanitize_mode: "whitelist",
    allowed_marks: ["bold", "italic", "underline", "strike", "code", "link"],
    allowed_block_types: [
      "paragraph",
      "heading",
      "list_item",
      "code",
      "quote",
      "table",
      "table_row",
      "table_cell",
    ],
    reject_unknown_structure: true,
    limits: {
      max_payload_bytes: 1024 * 1024, // 1MB
      max_nesting_depth: 100,
      max_attribute_count: 1000,
    },
    allowed_url_protocols: ["https:", "http:", "mailto:"],
  },
  ai_native_policy: {
    version: "v1",
    gateway: {
      max_ops_per_request: 50,
      max_payload_bytes: 200_000,
      idempotency_window_ms: 60_000,
    },
    security: {
      require_signed_requests: true,
      agent_token_ttl_ms: 3_600_000,
      audit_retention_days: 180,
      allow_external_models: false,
    },
    data_access: {
      max_context_chars: 8_000,
      redaction_strategy: "mask",
      pii_handling: "block",
      allow_external_fetch: false,
    },
    determinism: {
      require_explicit_ops: true,
    },
    agent_coordination: {
      enabled: true,
      max_concurrent_agents: 10,
      require_agent_registration: true,
      claim_timeout_ms: 30_000,
    },
    intent_tracking: {
      enabled: true,
      require_intent: true,
      intent_retention_days: 90,
    },
    provenance: {
      enabled: true,
      track_inline: true,
      require_model_id: true,
      store_rationale_summary: false,
    },
    semantic_merge: {
      enabled: true,
      ai_autonomy: "suggest_only",
      auto_merge_threshold: 0.85,
      prefer_human_edits: true,
      max_auto_merge_complexity: "simple",
    },
    transactions: {
      enabled: true,
      default_atomicity: "all_or_nothing",
      default_timeout_ms: 60_000,
      max_operations_per_txn: 100,
    },
    ai_opcodes: {
      allowed: [
        "OP_AI_GENERATE",
        "OP_AI_REWRITE",
        "OP_AI_CORRECT",
        "OP_AI_EXPAND",
        "OP_AI_SUMMARIZE",
        "OP_AI_TRANSLATE",
        "OP_AI_REFINE",
        "OP_AI_REVIEW",
        "OP_AI_SUGGEST",
        "OP_AI_VALIDATE",
      ],
      require_approval: ["OP_AI_RESTRUCTURE", "OP_AI_SPLIT_MERGE"],
    },
  },
  relocation_policy: {
    version: "v2",
    default_level: 1,
    enable_level_2: false,
    enable_level_3: false,
    level_2_max_distance_ratio: 0.1,
    level_3_max_block_radius: 2,
  },
  dev_tooling_policy: {
    version: "v2",
    force_full_scan_button: true,
    state_visualizer: true,
  },
  capabilities: {
    cross_block_annotations: true,
    bounded_gap: true,
    tables: true,
    reorder_blocks: true,
    ai_replace_spans: true,
    ai_gateway_v2: true,
    ai_data_access: true,
    ai_audit: true,
    ai_deterministic: true,
    ai_native: true,
    multi_agent: true,
    ai_provenance: true,
    semantic_merge: true,
    ai_transactions: true,
    markdown_content_mode: false,
    markdown_frontmatter: false,
    markdown_frontmatter_json: false,
    markdown_code_fence_syntax: false,
    markdown_line_targeting: false,
    markdown_semantic_targeting: false,
    markdown_gfm_tables: false,
    markdown_gfm_task_lists: false,
    markdown_gfm_strikethrough: false,
    markdown_gfm_autolink: false,
    markdown_footnotes: false,
    markdown_wikilinks: false,
    markdown_math: false,
  },
  conformance_kit_policy: {
    version: "v1",
    kernel_recommended: true,
    kernel_required_in_repo: true,
  },
  v: 1,
};
