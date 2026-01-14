import { DEFAULT_POLICY_MANIFEST } from "@ku0/core";
import { describe, expect, it } from "vitest";

import { canDegrade, degradationPath } from "../policyDegradation";

describe("policyDegradation", () => {
  it("detects chain policy tightening as degradation", () => {
    const preferred = {
      ...DEFAULT_POLICY_MANIFEST,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "bounded_gap" as const, max_intervening_blocks: 5 },
        },
      },
    };
    const effective = {
      ...preferred,
      chain_policy: {
        version: "v5",
        defaults: {
          highlight: { kind: "strict_adjacency" as const, max_intervening_blocks: 0 },
        },
      },
    };

    const result = degradationPath(preferred, effective);

    expect(result.degraded).toBe(true);
    expect(result.steps.some((step) => step.field === "chain_policy.defaults.highlight")).toBe(
      true
    );
  });

  it("marks history policy tightening", () => {
    const preferred = {
      ...DEFAULT_POLICY_MANIFEST,
      history_policy: {
        ...DEFAULT_POLICY_MANIFEST.history_policy,
        trusted_local_undo: true,
      },
    };
    const effective = {
      ...preferred,
      history_policy: {
        ...preferred.history_policy,
        trusted_local_undo: false,
      },
    };

    const result = degradationPath(preferred, effective);
    expect(result.degraded).toBe(true);
    expect(result.steps.some((step) => step.field === "history_policy.trusted_local_undo")).toBe(
      true
    );
  });

  it("refuses hard fields from degrading", () => {
    expect(canDegrade("coords.kind")).toBe(false);
    expect(canDegrade("chain_policy")).toBe(true);
  });
});
