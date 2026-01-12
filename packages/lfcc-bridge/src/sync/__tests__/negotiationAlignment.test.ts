/**
 * LFCC v0.9 RC - Bridge-Core Negotiation Alignment Tests
 * @see docs/product/Audit/enhance/stage2/agent_3_bridge.md P1.2
 *
 * P1.2: Ensures Bridge and Core produce identical negotiation results
 */

import { type CanonMark, DEFAULT_POLICY_MANIFEST, negotiate } from "@keepup/core";
import { describe, expect, it } from "vitest";
import { computeEffectiveManifest } from "../syncAdapter";

describe("Bridge-Core Negotiation Alignment", () => {
  it("should produce identical results for single manifest", () => {
    const manifest = { ...DEFAULT_POLICY_MANIFEST };

    const coreResult = negotiate([manifest]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([manifest]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      // Compare key fields that should be identical
      expect(bridgeManifest.capabilities).toEqual(coreResult.manifest.capabilities);
      expect(bridgeManifest.chain_policy.defaults).toEqual(
        coreResult.manifest.chain_policy.defaults
      );
      expect(bridgeManifest.partial_policy.defaults).toEqual(
        coreResult.manifest.partial_policy.defaults
      );
    }
  });

  it("should produce identical results for two manifests", () => {
    const m1 = { ...DEFAULT_POLICY_MANIFEST };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        bounded_gap: false,
      },
    };

    const coreResult = negotiate([m1, m2]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([m1, m2]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      expect(bridgeManifest.capabilities.bounded_gap).toBe(
        coreResult.manifest.capabilities.bounded_gap
      );
      expect(bridgeManifest.capabilities).toEqual(coreResult.manifest.capabilities);
    }
  });

  it("should produce identical results for chain policy negotiation", () => {
    const m1 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "bounded_gap" as const, max_intervening_blocks: 5 },
        },
      },
    };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "strict_adjacency" as const, max_intervening_blocks: 0 },
        },
      },
    };

    const coreResult = negotiate([m1, m2]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([m1, m2]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      expect(bridgeManifest.chain_policy.defaults.highlight).toEqual(
        coreResult.manifest.chain_policy.defaults.highlight
      );
    }
  });

  it("should produce identical results for partial policy negotiation", () => {
    const m1 = {
      ...DEFAULT_POLICY_MANIFEST,
      partial_policy: {
        version: "v4",
        defaults: {
          highlight: "allow_drop_tail" as const,
        },
      },
    };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      partial_policy: {
        version: "v4",
        defaults: {
          highlight: "none" as const,
        },
      },
    };

    const coreResult = negotiate([m1, m2]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([m1, m2]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      expect(bridgeManifest.partial_policy.defaults.highlight).toBe(
        coreResult.manifest.partial_policy.defaults.highlight
      );
    }
  });

  it("should produce identical results for AI sanitization policy negotiation", () => {
    const m1 = {
      ...DEFAULT_POLICY_MANIFEST,
      ai_sanitization_policy: {
        ...DEFAULT_POLICY_MANIFEST.ai_sanitization_policy,
        allowed_marks: ["bold", "italic", "underline"] as CanonMark[],
        limits: {
          max_payload_bytes: 2 * 1024 * 1024,
          max_nesting_depth: 200,
          max_attribute_count: 2000,
        },
      },
    };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      ai_sanitization_policy: {
        ...DEFAULT_POLICY_MANIFEST.ai_sanitization_policy,
        allowed_marks: ["bold", "italic", "code"] as CanonMark[],
        limits: {
          max_payload_bytes: 1024 * 1024,
          max_nesting_depth: 100,
          max_attribute_count: 1000,
        },
      },
    };

    const coreResult = negotiate([m1, m2]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([m1, m2]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      expect(bridgeManifest.ai_sanitization_policy.allowed_marks).toEqual(
        coreResult.manifest.ai_sanitization_policy.allowed_marks
      );
      expect(bridgeManifest.ai_sanitization_policy.limits).toEqual(
        coreResult.manifest.ai_sanitization_policy.limits
      );
    }
  });

  it("should throw error for incompatible manifests (matching Core behavior)", () => {
    const m1 = { ...DEFAULT_POLICY_MANIFEST };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      anchor_encoding: { version: "v99", format: "base64" as const },
    };

    const coreResult = negotiate([m1, m2]);
    expect(coreResult.success).toBe(false);

    // Bridge should throw error (matching Core's failure behavior)
    expect(() => computeEffectiveManifest([m1, m2])).toThrow();
  });

  it("should produce identical results for 3+ manifests", () => {
    const m1 = { ...DEFAULT_POLICY_MANIFEST };
    const m2 = { ...DEFAULT_POLICY_MANIFEST };
    const m3 = {
      ...DEFAULT_POLICY_MANIFEST,
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        tables: false,
      },
    };

    const coreResult = negotiate([m1, m2, m3]);
    const { manifest: bridgeManifest } = computeEffectiveManifest([m1, m2, m3]);

    expect(coreResult.success).toBe(true);
    if (coreResult.success) {
      expect(bridgeManifest.capabilities).toEqual(coreResult.manifest.capabilities);
    }
  });

  it("should be commutative (order-independent)", () => {
    const m1 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "bounded_gap" as const, max_intervening_blocks: 5 },
        },
      },
    };
    const m2 = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "strict_adjacency" as const, max_intervening_blocks: 0 },
        },
      },
    };

    const coreResult1 = negotiate([m1, m2]);
    const coreResult2 = negotiate([m2, m1]);
    const { manifest: bridgeManifest1 } = computeEffectiveManifest([m1, m2]);
    const { manifest: bridgeManifest2 } = computeEffectiveManifest([m2, m1]);

    expect(coreResult1.success).toBe(true);
    expect(coreResult2.success).toBe(true);
    if (coreResult1.success && coreResult2.success) {
      // Core results should be identical (commutative)
      expect(coreResult1.manifest.chain_policy.defaults.highlight).toEqual(
        coreResult2.manifest.chain_policy.defaults.highlight
      );

      // Bridge results should match Core
      expect(bridgeManifest1.chain_policy.defaults.highlight).toEqual(
        coreResult1.manifest.chain_policy.defaults.highlight
      );
      expect(bridgeManifest2.chain_policy.defaults.highlight).toEqual(
        coreResult2.manifest.chain_policy.defaults.highlight
      );
    }
  });
});
