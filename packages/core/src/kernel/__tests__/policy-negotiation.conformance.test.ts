/**
 * LFCC v0.9 RC - Policy Negotiation Conformance
 * @see docs/specs/lfcc/engineering/08_Conformance_Test_Suite_Plan.md Section 0.1 (Compliance Gates)
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_MANIFEST, negotiate, type PolicyManifestV09 } from "../policy/index.js";

describe("Policy Negotiation Commutativity (NEG-001)", () => {
  it("negotiates deterministically regardless of manifest order", () => {
    const manifestA: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      policy_id: "client-a",
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        bounded_gap: true,
      },
    };

    const manifestB: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      policy_id: "client-b",
      capabilities: {
        ...DEFAULT_POLICY_MANIFEST.capabilities,
        bounded_gap: false,
      },
    };

    const first = negotiate([manifestA, manifestB]);
    const second = negotiate([manifestB, manifestA]);

    expect(first).toEqual(second);
  });

  it("rejects conformance kit version mismatch", () => {
    const manifestA: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      policy_id: "client-a",
    };

    const manifestB: PolicyManifestV09 = {
      ...DEFAULT_POLICY_MANIFEST,
      policy_id: "client-b",
      conformance_kit_policy: {
        ...DEFAULT_POLICY_MANIFEST.conformance_kit_policy,
        version: "v2",
      },
    };

    const result = negotiate([manifestA, manifestB]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((error) => error.field === "conformance_kit_policy.version")).toBe(
        true
      );
    }
  });
});
