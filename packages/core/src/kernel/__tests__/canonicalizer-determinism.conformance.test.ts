/**
 * LFCC v0.9 RC - Canonicalizer Determinism Conformance
 * @see docs/specs/lfcc/engineering/08_Conformance_Test_Suite_Plan.md Section 9.2 (Canonicalization Properties)
 */

import { describe, expect, it } from "vitest";
import {
  type CanonInputNode,
  canonicalizeDocument,
  stableStringifyCanon,
} from "../canonicalizer/index.js";

const SAMPLE_INPUT: CanonInputNode = {
  kind: "element",
  tag: "table",
  attrs: {},
  children: [
    {
      kind: "element",
      tag: "tr",
      attrs: {},
      children: [
        {
          kind: "element",
          tag: "td",
          attrs: {},
          children: [
            {
              kind: "element",
              tag: "p",
              attrs: {},
              children: [
                {
                  kind: "element",
                  tag: "b",
                  attrs: {},
                  children: [
                    {
                      kind: "element",
                      tag: "i",
                      attrs: {},
                      children: [{ kind: "text", text: "Canonical" }],
                    },
                  ],
                },
                { kind: "text", text: "  \n  consistency" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("Canonicalizer Determinism (C1)", () => {
  it("produces identical canonical output on repeated runs", () => {
    const first = canonicalizeDocument({ root: SAMPLE_INPUT });
    const second = canonicalizeDocument({ root: SAMPLE_INPUT });

    const firstStable = stableStringifyCanon(first.root);
    const secondStable = stableStringifyCanon(second.root);

    expect(firstStable).toBe(secondStable);
  });
});
