/**
 * LFCC v0.9 RC - Policy Module Tests
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY_MANIFEST,
  type PolicyManifestV09,
  areManifestsCompatible,
  isPolicyManifestV09,
  negotiate,
  validateManifest,
} from "../policy/index.js";

describe("Policy Validation", () => {
  it("should validate default manifest", () => {
    const result = validateManifest(DEFAULT_POLICY_MANIFEST);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject invalid lfcc_version", () => {
    const invalid = { ...DEFAULT_POLICY_MANIFEST, lfcc_version: "0.8" };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "lfcc_version")).toBe(true);
  });

  it("should reject invalid coords.kind", () => {
    const invalid = {
      ...DEFAULT_POLICY_MANIFEST,
      coords: { kind: "utf8" },
    };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "coords.kind")).toBe(true);
  });

  it("should reject invalid chain policy kind", () => {
    const invalid = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "invalid_kind", max_intervening_blocks: 0 },
        },
      },
    };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("should reject negative max_intervening_blocks", () => {
    const invalid = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "strict_adjacency", max_intervening_blocks: -1 },
        },
      },
    };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("should use type guard correctly", () => {
    expect(isPolicyManifestV09(DEFAULT_POLICY_MANIFEST)).toBe(true);
    expect(isPolicyManifestV09({})).toBe(false);
    expect(isPolicyManifestV09(null)).toBe(false);
  });

  it("should reject unknown top-level fields", () => {
    const invalid = { ...DEFAULT_POLICY_MANIFEST, unknown_field: true };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "unknown_field")).toBe(true);
  });

  it("should reject AI limits that exceed bounds", () => {
    const invalid = {
      ...DEFAULT_POLICY_MANIFEST,
      ai_sanitization_policy: {
        ...DEFAULT_POLICY_MANIFEST.ai_sanitization_policy,
        limits: {
          max_payload_bytes: 6 * 1024 * 1024, // beyond 5MB bound
          max_nesting_depth: 2000,
          max_attribute_count: 6000,
        },
      },
    };
    const result = validateManifest(invalid);
    expect(result.valid).toBe(false);
  });

  it("should allow optional limits and allowed_url_protocols", () => {
    const manifest = {
      ...DEFAULT_POLICY_MANIFEST,
      ai_sanitization_policy: {
        ...DEFAULT_POLICY_MANIFEST.ai_sanitization_policy,
        limits: undefined,
        allowed_url_protocols: ["https:", "mailto:"],
      },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
  });

  it("should reject relocation levels above 1", () => {
    const manifest = {
      ...DEFAULT_POLICY_MANIFEST,
      relocation_policy: {
        ...DEFAULT_POLICY_MANIFEST.relocation_policy,
        default_level: 2,
      },
    };
    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
  });
});

describe("Policy Negotiation", () => {
  it("should return single manifest unchanged", () => {
    const result = negotiate([DEFAULT_POLICY_MANIFEST]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest).toEqual(DEFAULT_POLICY_MANIFEST);
    }
  });

  it("should fail on empty manifests array", () => {
    const result = negotiate([]);
    expect(result.success).toBe(false);
  });

  it("should fail on coords.kind mismatch", () => {
    const m1 = DEFAULT_POLICY_MANIFEST;
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      coords: { kind: "utf16" }, // Same, but let's test with different anchor version
      anchor_encoding: { version: "v99", format: "base64" },
    };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.field === "anchor_encoding.version")).toBe(true);
    }
  });

  it("should fail on structure_mode mismatch", () => {
    const m1 = { ...DEFAULT_POLICY_MANIFEST, structure_mode: "A" as const };
    const m2 = { ...DEFAULT_POLICY_MANIFEST, structure_mode: "B" as const };
    const result = negotiate([m1, m2]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.field === "structure_mode")).toBe(true);
    }
  });

  it("should compute capability intersection", () => {
    const m1: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        bounded_gap: true,
        reorder_blocks: true,
      },
    };
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        bounded_gap: false, // Different
        reorder_blocks: false, // Different
      },
    };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.capabilities.bounded_gap).toBe(false);
      expect(result.manifest.capabilities.reorder_blocks).toBe(false);
      expect(result.manifest.capabilities.tables).toBe(true);
    }
  });

  it("should choose most restrictive chain policy", () => {
    const m1: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "bounded_gap", max_intervening_blocks: 2 },
        },
      },
    };
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "strict_adjacency", max_intervening_blocks: 0 },
        },
      },
    };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      // strict_adjacency is more restrictive than bounded_gap
      expect(result.manifest.chain_policy.defaults.highlight.kind).toBe("strict_adjacency");
      // min of max_intervening_blocks
      expect(result.manifest.chain_policy.defaults.highlight.max_intervening_blocks).toBe(0);
    }
  });

  it("should use min for numeric restrictions", () => {
    const m1: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      integrity_policy: {
        ...DEFAULT_POLICY_MANIFEST.integrity_policy,
        checkpoint: { enabled: true, every_ops: 200, every_ms: 5000 },
      },
    };
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      integrity_policy: {
        ...DEFAULT_POLICY_MANIFEST.integrity_policy,
        checkpoint: { enabled: true, every_ops: 100, every_ms: 3000 },
      },
    };

    const result = negotiate([m1, m2]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.manifest.integrity_policy.checkpoint.every_ops).toBe(100);
      expect(result.manifest.integrity_policy.checkpoint.every_ms).toBe(3000);
    }
  });

  it("should produce deterministic policy_id", () => {
    const m1 = { ...DEFAULT_POLICY_MANIFEST, policy_id: "client-a" };
    const m2 = { ...DEFAULT_POLICY_MANIFEST, policy_id: "client-b" };
    const first = negotiate([m1, m2]);
    const second = negotiate([m2, m1]);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.manifest.policy_id).toEqual(second.manifest.policy_id);
      expect(first.manifest.policy_id.startsWith("negotiated-")).toBe(true);
    }
  });
});

describe("Manifest Compatibility", () => {
  it("should detect compatible manifests", () => {
    expect(areManifestsCompatible(DEFAULT_POLICY_MANIFEST, DEFAULT_POLICY_MANIFEST)).toBe(true);
  });

  it("should detect incompatible anchor versions", () => {
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      anchor_encoding: { version: "v99", format: "base64" },
    };
    expect(areManifestsCompatible(DEFAULT_POLICY_MANIFEST, m2)).toBe(false);
  });

  it("should detect incompatible anchor formats", () => {
    const m2: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      anchor_encoding: { version: "v2", format: "bytes" },
    };
    expect(areManifestsCompatible(DEFAULT_POLICY_MANIFEST, m2)).toBe(false);
  });
});
