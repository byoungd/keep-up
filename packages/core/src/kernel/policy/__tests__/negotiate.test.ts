import { describe, expect, it } from "vitest";
import { negotiate } from "../negotiate.js";
import { DEFAULT_POLICY_MANIFEST, type MarkdownPolicyV1 } from "../types.js";

describe("Policy Negotiation", () => {
  const createMarkdownPolicy = (overrides?: Partial<MarkdownPolicyV1>): MarkdownPolicyV1 => ({
    version: "v1",
    enabled: true,
    parser: {
      profile: "commonmark_0_30",
      extensions: {
        gfm_tables: true,
        gfm_task_lists: true,
        gfm_strikethrough: true,
        gfm_autolink: true,
        footnotes: true,
        wikilinks: true,
        math: true,
      },
      frontmatter_formats: ["yaml", "toml"],
    },
    canonicalizer: {
      version: "v1",
      mode: "source_preserving",
      line_ending: "lf",
      preserve: {
        trailing_whitespace: true,
        multiple_blank_lines: true,
        heading_style: true,
        list_marker_style: true,
        emphasis_style: true,
        fence_style: true,
      },
      normalize: {
        heading_style: "atx",
        list_marker: "-",
        emphasis_char: "*",
        fence_char: "`",
        fence_length: 3,
      },
    },
    sanitization: {
      version: "v1",
      allowed_block_types: ["md_heading", "md_paragraph"],
      allowed_mark_types: ["md_strong", "md_emphasis"],
      allow_html_blocks: true,
      allow_frontmatter: true,
      reject_unknown_structure: true,
      allowed_languages: undefined,
      blocked_languages: ["mermaid"],
      max_code_fence_lines: 200,
      link_url_policy: "moderate",
      image_url_policy: "permissive",
      max_file_lines: 2000,
      max_line_length: 400,
      max_heading_depth: 6,
      max_list_depth: 6,
      max_frontmatter_bytes: 8192,
    },
    targeting: {
      require_content_hash: false,
      require_context: false,
      max_semantic_search_lines: 400,
      max_context_prefix_chars: 200,
    },
    ...overrides,
  });

  it("should return success for single manifest", () => {
    const result = negotiate([DEFAULT_POLICY_MANIFEST]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest).toEqual(DEFAULT_POLICY_MANIFEST);
    }
  });

  it("should fail on critical mismatch (coords)", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);
    // @ts-expect-error
    m2.coords.kind = "cartesian"; // Invalid kind

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].field).toBe("coords.kind");
    }
  });

  it("should fail on critical mismatch (block_id_policy)", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);
    m2.block_id_policy.version = "v99";

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].field).toBe("block_id_policy.version");
    }
  });

  it("should match most restrictive chain policy", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);

    // M1 allows bounded_gap
    m1.chain_policy.defaults.highlight = { kind: "bounded_gap", max_intervening_blocks: 5 };
    // M2 requires strict_adjacency
    m2.chain_policy.defaults.highlight = { kind: "strict_adjacency", max_intervening_blocks: 0 };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      // Expect strict_adjacency (stricter than bounded_gap)
      expect(result.manifest.chain_policy.defaults.highlight.kind).toBe("strict_adjacency");
    }
  });

  it("should derive minimum AI limits", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);

    // M1: 1MB, 100 depth
    m1.ai_sanitization_policy.limits = {
      max_payload_bytes: 1024 * 1024,
      max_nesting_depth: 100,
      max_attribute_count: 500,
    };
    // M2: 500KB, 50 depth
    m2.ai_sanitization_policy.limits = {
      max_payload_bytes: 500 * 1024,
      max_nesting_depth: 50,
      max_attribute_count: 500,
    };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.ai_sanitization_policy.limits.max_payload_bytes).toBe(500 * 1024);
      expect(result.manifest.ai_sanitization_policy.limits.max_nesting_depth).toBe(50);
    }
  });

  it("should handle missing limits gracefully (defaults)", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    // Explicitly remove limits to test robustness (simulate older client)
    (
      m1.ai_sanitization_policy as Omit<typeof m1.ai_sanitization_policy, "limits"> & {
        limits?: typeof m1.ai_sanitization_policy.limits;
      }
    ).limits = undefined;

    const result = negotiate([m1, DEFAULT_POLICY_MANIFEST]);
    expect(result.success).toBe(true);
    if (result.success) {
      // Should default to 1MB/50/1000 or whatever fallback was negotiated
      expect(result.manifest.ai_sanitization_policy.limits).toBeDefined();
    }
  });

  it("should negotiate ai_native_policy with restrictive values", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);

    m1.ai_native_policy.gateway.max_ops_per_request = 100;
    m2.ai_native_policy.gateway.max_ops_per_request = 10;
    m1.ai_native_policy.semantic_merge.ai_autonomy = "full";
    m2.ai_native_policy.semantic_merge.ai_autonomy = "disabled";
    m1.ai_native_policy.data_access.redaction_strategy = "mask";
    m2.ai_native_policy.data_access.redaction_strategy = "omit";
    m1.ai_native_policy.data_access.allow_blocks = ["b1", "b2"];
    m2.ai_native_policy.data_access.allow_blocks = ["b2", "b3"];
    m1.ai_native_policy.data_access.deny_blocks = ["b9"];
    m2.ai_native_policy.data_access.deny_blocks = ["b10"];
    m1.ai_native_policy.ai_opcodes.allowed = ["OP_AI_GENERATE", "OP_AI_REWRITE"];
    m2.ai_native_policy.ai_opcodes.allowed = ["OP_AI_REWRITE"];

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.ai_native_policy?.gateway.max_ops_per_request).toBe(10);
      expect(result.manifest.ai_native_policy?.semantic_merge.ai_autonomy).toBe("disabled");
      expect(result.manifest.ai_native_policy?.data_access.redaction_strategy).toBe("omit");
      expect(result.manifest.ai_native_policy?.data_access.allow_blocks).toEqual(["b2"]);
      expect(result.manifest.ai_native_policy?.data_access.deny_blocks).toEqual(["b9", "b10"]);
      expect(result.manifest.ai_native_policy?.ai_opcodes.allowed).toEqual(["OP_AI_REWRITE"]);
    }
  });

  it("prefers eager document checksums when any participant requires it", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);
    m2.integrity_policy.document_checksum.mode = "eager";

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.integrity_policy.document_checksum.mode).toBe("eager");
      expect(result.manifest.integrity_policy.document_checksum.enabled).toBe(true);
    }
  });

  it("rejects document checksum algorithm mismatches", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);
    // @ts-expect-error - intentional mismatch for test
    m2.integrity_policy.document_checksum.algorithm = "LFCC_DOC_V0";

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0].field).toBe("integrity_policy.document_checksum.algorithm");
    }
  });

  it("should negotiate markdown policy when present", () => {
    const m1 = structuredClone(DEFAULT_POLICY_MANIFEST);
    const m2 = structuredClone(DEFAULT_POLICY_MANIFEST);

    m1.markdown_policy = createMarkdownPolicy({
      targeting: {
        require_content_hash: false,
        require_context: false,
        max_semantic_search_lines: 200,
        max_context_prefix_chars: 120,
      },
    });

    m2.markdown_policy = createMarkdownPolicy({
      parser: {
        profile: "commonmark_0_30",
        extensions: {
          gfm_tables: false,
          gfm_task_lists: true,
          gfm_strikethrough: true,
          gfm_autolink: true,
          footnotes: true,
          wikilinks: true,
          math: true,
        },
        frontmatter_formats: ["yaml"],
      },
      sanitization: {
        version: "v1",
        allowed_block_types: ["md_heading"],
        allowed_mark_types: ["md_strong", "md_emphasis"],
        allow_html_blocks: false,
        allow_frontmatter: true,
        reject_unknown_structure: true,
        allowed_languages: ["ts"],
        blocked_languages: ["plantuml"],
        max_code_fence_lines: 120,
        link_url_policy: "strict",
        image_url_policy: "moderate",
        max_file_lines: 1500,
        max_line_length: 300,
        max_heading_depth: 6,
        max_list_depth: 4,
        max_frontmatter_bytes: 4096,
      },
      targeting: {
        require_content_hash: true,
        require_context: false,
        max_semantic_search_lines: 180,
        max_context_prefix_chars: 100,
      },
    });

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      const policy = result.manifest.markdown_policy;
      expect(policy).toBeDefined();
      expect(policy?.enabled).toBe(true);
      expect(policy?.parser.extensions.gfm_tables).toBe(false);
      expect(policy?.parser.frontmatter_formats).toEqual(["yaml"]);
      expect(policy?.sanitization.allowed_block_types).toEqual(["md_heading"]);
      expect(policy?.sanitization.allow_html_blocks).toBe(false);
      expect(policy?.sanitization.allowed_languages).toEqual(["ts"]);
      expect(policy?.sanitization.blocked_languages).toEqual(["mermaid", "plantuml"]);
      expect(policy?.sanitization.max_code_fence_lines).toBe(120);
      expect(policy?.sanitization.link_url_policy).toBe("strict");
      expect(policy?.targeting.require_content_hash).toBe(true);
      expect(policy?.targeting.max_semantic_search_lines).toBe(180);
      expect(policy?.targeting.max_context_prefix_chars).toBe(100);
    }
  });
});
