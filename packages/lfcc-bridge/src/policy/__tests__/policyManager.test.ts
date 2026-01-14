import type { ChainPolicy, TokenRange } from "@ku0/core";
import { describe, expect, test } from "vitest";
import {
  type BridgeAnnotation,
  computeMigrationPlan,
  degradeBoundedGapToStrict,
} from "../policyManager";

// Mock helpers
function createMockAnnotation(
  id: string,
  kind: BridgeAnnotation["kind"],
  gaps: number,
  chainOrder?: string[]
): BridgeAnnotation {
  const range: TokenRange = { startTokenId: `${id}-start`, endTokenId: `${id}-end` };
  return {
    id,
    kind,
    range,
    createdAtMs: 0,
    status: { state: "active" },
    chain: chainOrder
      ? {
          policy: { kind: "bounded_gap", max_intervening_blocks: 5 },
          order: chainOrder,
        }
      : undefined,
    _debug_gaps: gaps, // Fallback for tests without chain order
  };
}

describe("Chain Policy Degradation", () => {
  const strictPolicy: ChainPolicy = {
    version: "v5",
    defaults: {
      highlight: { kind: "strict_adjacency", max_intervening_blocks: 0 },
    },
  };

  test("bounded_gap to strict_adjacency with gaps > 0 degrades to partial", () => {
    // Test with mock gaps (backward compatibility)
    const anno1 = createMockAnnotation("a1", "highlight", 2); // 2 gaps
    const result = degradeBoundedGapToStrict([anno1], strictPolicy);

    expect(result.affectedAnnotations).toHaveLength(1);
    expect(result.affectedAnnotations).toContain("a1");
    expect(result.migrationPlan[0].newState).toBe("active_partial");
    expect(result.migrationPlan[0].reason).toContain("exceeds strict_adjacency");
  });

  test("bounded_gap to strict_adjacency with real chain order", () => {
    // Test with real chain order
    // Document order: [b1, b2, b3, b4, b5]
    // Chain order: [b1, b5] -> 3 intervening blocks (b2, b3, b4)
    const documentOrder = ["b1", "b2", "b3", "b4", "b5"];
    const anno1 = createMockAnnotation("a1", "highlight", 0, ["b1", "b5"]);
    const result = degradeBoundedGapToStrict([anno1], strictPolicy, documentOrder);

    expect(result.affectedAnnotations).toHaveLength(1);
    expect(result.affectedAnnotations).toContain("a1");
    expect(result.migrationPlan[0].reason).toContain("Gap count (3)");
  });

  test("bounded_gap to strict_adjacency with gaps == 0 is unaffected", () => {
    const anno1 = createMockAnnotation("a2", "highlight", 0); // 0 gaps = adjacent
    const result = degradeBoundedGapToStrict([anno1], strictPolicy);

    expect(result.affectedAnnotations).toHaveLength(0);
  });

  test("comment (unsupported partial) degrades to orphan", () => {
    const anno1 = createMockAnnotation("c1", "comment", 3);
    const result = degradeBoundedGapToStrict([anno1], strictPolicy);

    expect(result.migrationPlan[0].newState).toBe("orphan");
  });

  test("computeMigrationPlan detects strict adjacency target", () => {
    const manifest = {
      chain_policy: strictPolicy,
    };
    const anno1 = createMockAnnotation("a1", "highlight", 2);

    const result = computeMigrationPlan({}, manifest, [anno1]);
    expect(result.affectedAnnotations).toHaveLength(1);
  });
});
