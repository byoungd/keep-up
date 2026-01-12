/**
 * LFCC v0.9 RC - Track 15: Version Negotiation Tests
 *
 * Validates client-server handshake compatibility across manifests.
 */

import { describe, expect, it } from "vitest";
import { type PolicyManifestV09, computePolicyManifestHash } from "../kernel/policy";
import {
  createDefaultSyncManifest,
  negotiateManifests,
  validateSyncManifest,
} from "../sync/negotiate";

describe("Track 15: Version Negotiation", () => {
  const base = createDefaultSyncManifest();

  it("should negotiate identical manifests", () => {
    const result = negotiateManifests(base, base);

    expect(result.success).toBe(true);
    if (!result.success || !result.effectiveManifest) {
      throw new Error("Negotiation failed for identical manifests");
    }

    const { policy_id: _policyId, relocation_policy: _relocationPolicy, ...rest } = base;
    expect(result.effectiveManifest).toMatchObject(rest);
    expect(result.effectiveManifest.policy_id).toMatch(/^negotiated-/);
    expect(result.effectiveManifest.relocation_policy).toEqual({
      version: base.relocation_policy.version,
      default_level: 1,
      enable_level_2: false,
      enable_level_3: false,
      level_2_max_distance_ratio: 0,
      level_3_max_block_radius: 0,
    });
  });

  it("should fail on anchor encoding mismatch", () => {
    const client: PolicyManifestV09 = {
      ...base,
      anchor_encoding: { ...base.anchor_encoding, version: "v99" },
    };

    const result = negotiateManifests(client, base);

    expect(result.success).toBe(false);
  });

  it("should validate default manifest", () => {
    const result = validateSyncManifest(base);
    expect(result).toBe(true);
  });

  it("should compute deterministic manifest hash", async () => {
    const hash1 = await computePolicyManifestHash(base);
    const hash2 = await computePolicyManifestHash(base);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });
});
