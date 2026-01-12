import { DEFAULT_POLICY_MANIFEST, type PolicyManifestV09 } from "@keepup/core";
import { describe, expect, test } from "vitest";
import { computeEffectiveManifest } from "../syncAdapter";

describe("Negotiation Robustness", () => {
  function createManifest(
    v: number,
    chainKind: "strict_adjacency" | "bounded_gap" | "required_order"
  ): PolicyManifestV09 {
    const m = JSON.parse(JSON.stringify(DEFAULT_POLICY_MANIFEST));
    m.v = v;
    m.chain_policy.defaults.highlight.kind = chainKind;
    if (chainKind === "bounded_gap") {
      m.chain_policy.defaults.highlight.max_intervening_blocks = 5;
    }
    return m;
  }

  test("picks minimum version", () => {
    const m1 = createManifest(2, "strict_adjacency");
    const m2 = createManifest(1, "strict_adjacency");
    const { manifest } = computeEffectiveManifest([m1, m2]);
    expect(manifest.v).toBe(1);
  });

  test("picks strictest chain policy (strict > bounded)", () => {
    const mStrict = createManifest(1, "strict_adjacency");
    const mBounded = createManifest(1, "bounded_gap");
    const { manifest } = computeEffectiveManifest([mStrict, mBounded]);

    expect(manifest.chain_policy.defaults.highlight.kind).toBe("strict_adjacency");
  });

  test("picks strictest chain policy (bounded > required)", () => {
    const mBounded = createManifest(1, "bounded_gap");
    const mRequired = createManifest(1, "required_order");
    const { manifest } = computeEffectiveManifest([mBounded, mRequired]);

    expect(manifest.chain_policy.defaults.highlight.kind).toBe("bounded_gap");
  });

  test("picks minimum gap size for bounded_gap", () => {
    const m1 = createManifest(1, "bounded_gap");
    m1.chain_policy.defaults.highlight.max_intervening_blocks = 5;

    const m2 = createManifest(1, "bounded_gap");
    m2.chain_policy.defaults.highlight.max_intervening_blocks = 2;

    const { manifest } = computeEffectiveManifest([m1, m2]);
    expect(manifest.chain_policy.defaults.highlight.max_intervening_blocks).toBe(2);
  });

  test("records degradation when effective policy tightens", () => {
    const preferred = createManifest(1, "required_order");
    const strict = createManifest(1, "strict_adjacency");

    const result = computeEffectiveManifest([preferred, strict]);

    expect(result.degraded).toBe(true);
    expect(result.steps.some((step) => step.field === "chain_policy.defaults.highlight")).toBe(
      true
    );
  });
});
