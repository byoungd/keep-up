/**
 * LFCC v0.9 RC — Surrogate Boundary Conformance Tests
 * D3.1: CI-visible conformance tests for UTF-16 surrogate pair validation
 *
 * Tests that BlockTransform/BlockMapping operations correctly reject
 * positions that split surrogate pairs (emoji, astral symbols).
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type BlockTransform, createBlockMapping } from "../mapping/axioms.js";
import { isValidPosition, validateRange } from "../utils/unicode.js";

// Test seed for reproducibility - on failure, print this seed
const TEST_SEED = process.env.CONFORMANCE_SEED
  ? Number.parseInt(process.env.CONFORMANCE_SEED, 10)
  : Date.now();

// Emoji and astral symbols for testing surrogate pairs
const SURROGATE_CHARS = [
  "😀", // U+1F600
  "🎉", // U+1F389
  "👨‍👩‍👧‍👦", // Family emoji (multiple code points)
  "🌍", // U+1F30D
  "𝕳", // U+1D573 (Mathematical Bold Fraktur H)
  "𠀀", // U+20000 (CJK Extension B)
];

/**
 * Helper to get the position that splits a surrogate pair
 */
function getMidSurrogatePosition(text: string): number | null {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // High surrogate followed by low surrogate
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Position i+1 is inside the surrogate pair
        return i + 1;
      }
    }
  }
  return null;
}

/**
 * Helper to log failure with seed for reproduction
 */
function logFailureWithSeed(
  testName: string,
  input: { text: string; position?: number; range?: { start: number; end: number } }
): void {
  console.error(`
=== CONFORMANCE FAILURE ===
Test: ${testName}
Seed: ${TEST_SEED}
Input text: ${JSON.stringify(input.text)}
Input text length: ${input.text.length}
${input.position !== undefined ? `Position: ${input.position}` : ""}
${input.range ? `Range: [${input.range.start}, ${input.range.end}]` : ""}
Repro: CONFORMANCE_SEED=${TEST_SEED} pnpm vitest --run surrogateBoundary.conformance.test.ts
===========================
`);
}

describe("Surrogate Boundary Conformance (D3.1)", () => {
  describe("isValidPosition", () => {
    it("rejects position at low surrogate (mid-pair)", () => {
      for (const emoji of SURROGATE_CHARS) {
        const text = `a${emoji}b`;
        const midPos = getMidSurrogatePosition(text);

        if (midPos !== null) {
          const result = isValidPosition(text, midPos);
          if (result) {
            logFailureWithSeed("isValidPosition mid-pair", { text, position: midPos });
          }
          expect(result).toBe(false);
        }
      }
    });

    it("accepts position at start of surrogate pair", () => {
      const text = "a😀b";
      // Position 1 is the high surrogate - this is a valid boundary
      expect(isValidPosition(text, 1)).toBe(true);
    });

    it("accepts position after surrogate pair", () => {
      const text = "a😀b";
      // Position 3 is after the emoji (emoji takes positions 1-2)
      expect(isValidPosition(text, 3)).toBe(true);
    });
  });

  describe("validateRange", () => {
    it("rejects range with start at mid-surrogate", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos !== null) {
        const result = validateRange(text, midPos, midPos + 3);
        if (result.valid) {
          logFailureWithSeed("validateRange start mid-pair", {
            text,
            range: { start: midPos, end: midPos + 3 },
          });
        }
        expect(result.valid).toBe(false);
        expect(result.error).toContain("SURROGATE_PAIR_VIOLATION");
      }
    });

    it("rejects range with end at mid-surrogate", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos !== null) {
        const result = validateRange(text, 0, midPos);
        if (result.valid) {
          logFailureWithSeed("validateRange end mid-pair", {
            text,
            range: { start: 0, end: midPos },
          });
        }
        expect(result.valid).toBe(false);
        expect(result.error).toContain("SURROGATE_PAIR_VIOLATION");
      }
    });

    it("rejects range that splits surrogate at boundary", () => {
      // Range that would leave orphan high surrogate
      const text = "a😀";
      const result = validateRange(text, 1, 2); // Just the high surrogate
      expect(result.valid).toBe(false);
      expect(result.error).toContain("SURROGATE_PAIR");
    });

    it("accepts range that includes complete surrogate pair", () => {
      const text = "a😀b";
      const result = validateRange(text, 1, 3); // Complete emoji
      expect(result.valid).toBe(true);
    });
  });

  describe("BlockTransform split at mid-surrogate", () => {
    it("throws INV-COORD-002 when splitAt bisects surrogate pair", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos === null) {
        throw new Error("Test setup error: no mid-surrogate position found");
      }

      const transforms: BlockTransform[] = [
        {
          kind: "split",
          oldId: "block1",
          newIds: ["block1a", "block1b"],
          splitAt: midPos,
        },
      ];

      try {
        createBlockMapping(transforms, { blockTexts: { block1: text } });
        logFailureWithSeed("BlockTransform split mid-pair", { text, position: midPos });
        expect.fail("Expected INV-COORD-002 error");
      } catch (err) {
        expect((err as Error).message).toContain("INV-COORD-002");
      }
    });

    it("accepts split before surrogate pair", () => {
      const text = "hello😀world";
      const transforms: BlockTransform[] = [
        {
          kind: "split",
          oldId: "block1",
          newIds: ["block1a", "block1b"],
          splitAt: 5, // Before emoji
        },
      ];

      const mapping = createBlockMapping(transforms, { blockTexts: { block1: text } });
      expect(mapping).toBeDefined();
    });

    it("accepts split after surrogate pair", () => {
      const text = "hello😀world";
      const transforms: BlockTransform[] = [
        {
          kind: "split",
          oldId: "block1",
          newIds: ["block1a", "block1b"],
          splitAt: 7, // After emoji (5 + 2 for emoji)
        },
      ];

      const mapping = createBlockMapping(transforms, { blockTexts: { block1: text } });
      expect(mapping).toBeDefined();
    });
  });

  describe("BlockTransform modified with invalid delete range", () => {
    it("throws INV-COORD-002 when delete range starts mid-pair", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos === null) {
        throw new Error("Test setup error: no mid-surrogate position found");
      }

      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: midPos, delta: -3 }],
        },
      ];

      try {
        createBlockMapping(transforms, { blockTexts: { block1: text } });
        logFailureWithSeed("BlockTransform delete mid-pair start", { text, position: midPos });
        expect.fail("Expected INV-COORD-002 error");
      } catch (err) {
        expect((err as Error).message).toContain("INV-COORD-002");
      }
    });

    it("throws INV-COORD-002 when delete range ends mid-pair", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos === null) {
        throw new Error("Test setup error: no mid-surrogate position found");
      }

      // Delete from before emoji to mid-pair
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: 4, delta: -(midPos - 4) }],
        },
      ];

      try {
        createBlockMapping(transforms, { blockTexts: { block1: text } });
        logFailureWithSeed("BlockTransform delete mid-pair end", {
          text,
          range: { start: 4, end: midPos },
        });
        expect.fail("Expected INV-COORD-002 error");
      } catch (err) {
        expect((err as Error).message).toContain("INV-COORD-002");
      }
    });

    it("accepts delete of complete surrogate pair", () => {
      const text = "hello😀world";
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: 5, delta: -2 }], // Delete entire emoji
        },
      ];

      const mapping = createBlockMapping(transforms, { blockTexts: { block1: text } });
      expect(mapping).toBeDefined();
    });
  });

  describe("BlockTransform insert at mid-surrogate (D4.2 regression)", () => {
    it("throws INV-COORD-002 when insert offset is mid-pair", () => {
      const text = "hello😀world";
      const midPos = getMidSurrogatePosition(text);

      if (midPos === null) {
        throw new Error("Test setup error: no mid-surrogate position found");
      }

      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: midPos, delta: 5 }], // Insert 5 chars at mid-pair
        },
      ];

      try {
        createBlockMapping(transforms, { blockTexts: { block1: text } });
        logFailureWithSeed("BlockTransform insert mid-pair", { text, position: midPos });
        expect.fail("Expected INV-COORD-002 error");
      } catch (err) {
        expect((err as Error).message).toContain("INV-COORD-002");
      }
    });
  });
});

describe("Surrogate Boundary Property Tests (D3.2)", () => {
  // Arbitrary for strings containing surrogate pairs
  const stringWithSurrogates = fc.stringOf(
    fc.oneof(
      fc.char(), // Regular chars
      fc.constantFrom(...SURROGATE_CHARS) // Emoji
    ),
    { minLength: 1, maxLength: 50 }
  );

  it("no valid split position bisects a surrogate pair (property)", () => {
    fc.assert(
      fc.property(stringWithSurrogates, (text: string) => {
        // For any random text with surrogate pairs, all valid split positions
        // must not be at a low surrogate
        for (let pos = 0; pos <= text.length; pos++) {
          if (isValidPosition(text, pos)) {
            // Valid positions should never be at a low surrogate
            const code = text.charCodeAt(pos);
            if (code >= 0xdc00 && code <= 0xdfff) {
              return false;
            }
          }
        }
        return true;
      }),
      { seed: TEST_SEED, numRuns: 100 }
    );
  });

  it("validateRange rejects any range starting at mid-surrogate (property)", () => {
    fc.assert(
      fc.property(stringWithSurrogates, fc.nat({ max: 100 }), (text: string, offset: number) => {
        const pos = offset % (text.length + 1);
        const code = text.charCodeAt(pos);

        // If position is at a low surrogate, validateRange should reject
        if (code >= 0xdc00 && code <= 0xdfff) {
          const result = validateRange(text, pos, text.length);
          return !result.valid;
        }
        return true;
      }),
      { seed: TEST_SEED, numRuns: 100 }
    );
  });

  it("BlockTransform rejects split at any mid-surrogate position (property)", () => {
    fc.assert(
      fc.property(stringWithSurrogates, (text: string) => {
        const midPos = getMidSurrogatePosition(text);
        if (midPos === null) {
          return true; // No surrogate pairs in this text, skip
        }

        const transforms: BlockTransform[] = [
          {
            kind: "split",
            oldId: "block1",
            newIds: ["block1a", "block1b"],
            splitAt: midPos,
          },
        ];

        try {
          createBlockMapping(transforms, { blockTexts: { block1: text } });
          return false; // Should have thrown
        } catch (err) {
          return (err as Error).message.includes("INV-COORD-002");
        }
      }),
      { seed: TEST_SEED, numRuns: 100 }
    );
  });
});
