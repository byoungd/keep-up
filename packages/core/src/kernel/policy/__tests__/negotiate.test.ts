import { describe, expect, it } from "vitest";
import { negotiate } from "../negotiate";
import { DEFAULT_POLICY_MANIFEST } from "../types";

describe("Policy Negotiation", () => {
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
    // @ts-ignore
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
});
