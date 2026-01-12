/**
 * LFCC v0.9 RC - Policy Negotiation Tests (Sync)
 */

import { describe, expect, it } from "vitest";
import { type PolicyManifestV09, areManifestsCompatible } from "../../kernel/policy";
import {
  createDefaultSyncManifest,
  getSyncDegradedFeatures,
  isSyncFeatureSupported,
  negotiateManifests,
  validateSyncManifest,
} from "../negotiate";

describe("Policy Negotiation (Sync)", () => {
  const base = createDefaultSyncManifest();

  it("should succeed with identical manifests", () => {
    const result = negotiateManifests(base, base);

    expect(result.success).toBe(true);
    expect(result.effectiveManifest).toBeDefined();
    const effective = result.effectiveManifest as PolicyManifestV09;
    expect(areManifestsCompatible(effective, base)).toBe(true);
    expect(effective.policy_id).toContain("negotiated-");
    expect(effective.relocation_policy.enable_level_2).toBe(false);
    expect(effective.relocation_policy.enable_level_3).toBe(false);
  });

  it("should fail on structure mode mismatch", () => {
    const client: PolicyManifestV09 = {
      ...base,
      structure_mode: "A",
    };
    const server: PolicyManifestV09 = {
      ...base,
      structure_mode: "B",
    };

    const result = negotiateManifests(client, server);

    expect(result.success).toBe(false);
  });

  it("should detect incompatible anchor encoding", () => {
    const client: PolicyManifestV09 = {
      ...base,
      anchor_encoding: { ...base.anchor_encoding, version: "v99" },
    };

    const result = negotiateManifests(client, base);

    expect(result.success).toBe(false);
  });

  it("should validate correct manifest", () => {
    expect(validateSyncManifest(base)).toBe(true);
  });

  it("should reject invalid manifest", () => {
    expect(validateSyncManifest({})).toBe(false);
  });

  it("should check feature support", () => {
    expect(isSyncFeatureSupported(base, { type: "mark", name: "bold" })).toBe(true);
    expect(isSyncFeatureSupported(base, { type: "block", name: "paragraph" })).toBe(true);
    expect(isSyncFeatureSupported(base, { type: "block", name: "custom" })).toBe(false);
  });

  it("should report degraded features", () => {
    const client: PolicyManifestV09 = {
      ...base,
      ai_sanitization_policy: {
        ...base.ai_sanitization_policy,
        allowed_marks: [...base.ai_sanitization_policy.allowed_marks, "custom_mark"],
        allowed_block_types: [...base.ai_sanitization_policy.allowed_block_types, "custom_block"],
      },
    };

    const degraded = getSyncDegradedFeatures(client, base);

    expect(degraded.marks).toEqual(["custom_mark"]);
    expect(degraded.blocks).toEqual(["custom_block"]);
  });
});
