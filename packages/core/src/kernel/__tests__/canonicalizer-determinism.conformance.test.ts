/**
 * LFCC v0.9 RC — Canonicalizer Determinism Conformance
 * C1: Canonical outputs must be deterministic for equivalent inputs.
 */

import { describe, expect, it } from "vitest";
import { canonicalizeDocument, stableStringifyCanon } from "../canonicalizer/index.js";
import type { CanonInputNode } from "../canonicalizer/types.js";

const inputA: CanonInputNode = {
  kind: "element",
  tag: "p",
  attrs: { "data-b": "2", "data-a": "1" },
  children: [
    {
      kind: "element",
      tag: "strong",
      attrs: {},
      children: [
        {
          kind: "element",
          tag: "em",
          attrs: {},
          children: [{ kind: "text", text: "Deterministic output." }],
        },
      ],
    },
  ],
};

const inputB: CanonInputNode = {
  kind: "element",
  tag: "p",
  attrs: { "data-a": "1", "data-b": "2" },
  children: [
    {
      kind: "element",
      tag: "em",
      attrs: {},
      children: [
        {
          kind: "element",
          tag: "strong",
          attrs: {},
          children: [{ kind: "text", text: "Deterministic output." }],
        },
      ],
    },
  ],
};

describe("Canonicalizer determinism conformance (C1)", () => {
  it("produces identical canonical trees for equivalent inputs", () => {
    const resultA = canonicalizeDocument({ root: inputA });
    const resultB = canonicalizeDocument({ root: inputB });

    expect(stableStringifyCanon(resultA.root)).toBe(stableStringifyCanon(resultB.root));
  });

  it("returns stable results across repeated runs", () => {
    const result1 = canonicalizeDocument({ root: inputA });
    const result2 = canonicalizeDocument({ root: inputA });

    expect(stableStringifyCanon(result1.root)).toBe(stableStringifyCanon(result2.root));
  });
});
