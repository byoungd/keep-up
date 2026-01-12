/**
 * LFCC v0.9 RC - Edge Case Tests (P2)
 * @see docs/product/Audit/enhance/stage3/agent_1_conformance.md
 * Tests for empty documents, single-character documents, and DirtyInfo coverage.
 */

import * as fc from "fast-check";
import { describe, expect, it, test } from "vitest";
import {
  type CanonBlock,
  type CanonInputNode,
  type CanonText,
  canonicalizeDocument,
} from "../canonicalizer";
import { type BlockTransform, createBlockMapping } from "../mapping/axioms";
import { computeDirtyInfo } from "../mapping/computeDirty";

// ============================================================================
// 1. Empty Document Edge Cases (EDGE-EMPTY-001)
// ============================================================================

describe("Edge Cases: Empty Documents", () => {
  describe("Canonicalizer", () => {
    it("should handle empty paragraph", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [],
      };

      const result = canonicalizeDocument({ root: input });
      const root = result.root as CanonBlock;

      // Empty paragraph is dropped, so we get a default empty document root
      expect(root.type).toBe("document");
      expect(root.children).toHaveLength(0);
      // Should emit diagnostic for empty node
      expect(result.diagnostics.some((d) => d.kind === "dropped_empty_node")).toBe(true);
    });

    it("should handle empty document root", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "doc",
        attrs: {},
        children: [],
      };

      const result = canonicalizeDocument({ root: input });

      // Should not crash - fail-closed acceptable
      expect(result).toBeDefined();
    });

    it("should handle paragraph with only whitespace", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: "   " }],
      };

      const result = canonicalizeDocument({ root: input });

      // Should normalize or drop empty content
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it("should handle empty list", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "ul",
        attrs: {},
        children: [],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result).toBeDefined();
    });

    it("should handle empty table", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "table",
        attrs: {},
        children: [],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result).toBeDefined();
    });
  });

  describe("BlockMapping", () => {
    it("should handle empty transform list", () => {
      const transforms: BlockTransform[] = [];
      const mapping = createBlockMapping(transforms);

      // Should not crash
      expect(mapping).toBeDefined();

      // Mapping unknown block returns null
      expect(mapping.mapOldToNew("nonexistent", 0)).toBeNull();
    });

    it("should handle block with zero length", () => {
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "empty",
          newId: "empty",
          deltas: [],
        },
      ];

      const mapping = createBlockMapping(transforms);

      // Position 0 should still map
      const result = mapping.mapOldToNew("empty", 0);
      expect(result).toEqual({ newBlockId: "empty", newAbsInBlock: 0 });
    });
  });
});

// ============================================================================
// 2. Single Character Edge Cases (EDGE-SINGLE-001)
// ============================================================================

describe("Edge Cases: Single Character", () => {
  describe("Canonicalizer", () => {
    it("should handle single character paragraph", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: "X" }],
      };

      const result = canonicalizeDocument({ root: input });
      const root = result.root as CanonBlock;
      const text = root.children[0] as CanonText;

      expect(text.text).toBe("X");
    });

    it("should handle single space character", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: " " }],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result).toBeDefined();
    });

    it("should handle single newline character", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [{ kind: "text", text: "\n" }],
      };

      const result = canonicalizeDocument({ root: input });

      expect(result).toBeDefined();
    });

    it("should handle single character with mark", () => {
      const input: CanonInputNode = {
        kind: "element",
        tag: "p",
        attrs: {},
        children: [
          {
            kind: "element",
            tag: "b",
            attrs: {},
            children: [{ kind: "text", text: "X" }],
          },
        ],
      };

      const result = canonicalizeDocument({ root: input });
      const root = result.root as CanonBlock;
      const text = root.children[0] as CanonText;

      expect(text.text).toBe("X");
      expect(text.marks).toContain("bold");
    });
  });

  describe("BlockMapping", () => {
    it("should handle single character insert", () => {
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: 0, delta: 1 }],
        },
      ];

      const mapping = createBlockMapping(transforms);

      // Position 0 should shift by 1
      const result = mapping.mapOldToNew("block1", 0);
      expect(result).not.toBeNull();
      expect(result?.newAbsInBlock).toBe(1);
    });

    it("should handle single character delete", () => {
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: 0, delta: -1 }],
        },
      ];

      const mapping = createBlockMapping(transforms);

      // Position 0 is deleted
      expect(mapping.mapOldToNew("block1", 0)).toBeNull();

      // Position 1 should shift
      const result = mapping.mapOldToNew("block1", 1);
      expect(result).not.toBeNull();
      expect(result?.newAbsInBlock).toBe(0);
    });
  });
});

// ============================================================================
// 3. DirtyInfo Coverage Verification (EDGE-DIRTY-001)
// ============================================================================

describe("Edge Cases: DirtyInfo Coverage", () => {
  it("should cover at least the modified range", () => {
    // Simulate a text edit at position 5-10
    const editStart = 5;
    const editEnd = 10;
    const blockId = "block1";

    const dirtyInfo = computeDirtyInfo({
      touchedBlocks: [{ blockId, touchedRange: { start: editStart, end: editEnd } }],
      opCodes: ["text_edit"],
    });

    // DirtyInfo should include the edited block
    expect(dirtyInfo.touchedBlockIds).toContain(blockId);

    // The touched range should cover [editStart, editEnd]
    const blockInfo = dirtyInfo.blocks.get(blockId);
    expect(blockInfo).toBeDefined();
    expect(blockInfo?.touchedRange.start).toBeLessThanOrEqual(editStart);
    expect(blockInfo?.touchedRange.end).toBeGreaterThanOrEqual(editEnd);
  });

  it("should expand to neighbors for structural operations", () => {
    const blockId = "block2";

    const dirtyInfo = computeDirtyInfo({
      touchedBlocks: [{ blockId, touchedRange: { start: 0, end: 10 } }],
      opCodes: ["split_block"],
    });

    // Structural ops should trigger neighbor expansion
    expect(dirtyInfo.expandedBlockIds.length).toBeGreaterThanOrEqual(1);
  });

  // Property test: DirtyInfo always covers at least the input range (monotonic coverage)
  test("DirtyInfo coverage is monotonic (property)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (blockId, start, length) => {
          const end = start + length;

          const dirtyInfo = computeDirtyInfo({
            touchedBlocks: [{ blockId, touchedRange: { start, end } }],
            opCodes: ["text_edit"],
          });

          // The block must be in touched blocks
          if (!dirtyInfo.touchedBlockIds.includes(blockId)) {
            return false;
          }

          // The touched range must cover [start, end]
          const blockInfo = dirtyInfo.blocks.get(blockId);
          if (!blockInfo) {
            return false;
          }

          return blockInfo.touchedRange.start <= start && blockInfo.touchedRange.end >= end;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("should handle multiple blocks", () => {
    const dirtyInfo = computeDirtyInfo({
      touchedBlocks: [
        { blockId: "block1", touchedRange: { start: 0, end: 5 } },
        { blockId: "block2", touchedRange: { start: 10, end: 20 } },
      ],
      opCodes: ["text_edit"],
    });

    expect(dirtyInfo.touchedBlockIds).toContain("block1");
    expect(dirtyInfo.touchedBlockIds).toContain("block2");
  });

  it("should handle empty input gracefully", () => {
    const dirtyInfo = computeDirtyInfo({
      touchedBlocks: [],
      opCodes: [],
    });

    expect(dirtyInfo.touchedBlockIds).toHaveLength(0);
  });
});

// ============================================================================
// 4. UTF-16 Surrogate Pair Edge Cases (EDGE-SURR-001)
// ============================================================================

describe("Edge Cases: UTF-16 Surrogate Pairs", () => {
  it("should handle emoji (surrogate pair)", () => {
    const input: CanonInputNode = {
      kind: "element",
      tag: "p",
      attrs: {},
      children: [{ kind: "text", text: "Hello 🎉 World" }],
    };

    const result = canonicalizeDocument({ root: input });
    const root = result.root as CanonBlock;
    const text = root.children[0] as CanonText;

    // Emoji should be preserved
    expect(text.text).toContain("🎉");
  });

  it("should not split surrogate pair in block mapping", () => {
    // "🎉" is U+1F389, encoded as surrogate pair D83C DF89 in UTF-16
    // If we have "Hello 🎉" the emoji starts at index 6
    const transforms: BlockTransform[] = [
      {
        kind: "modified",
        oldId: "block1",
        newId: "block1",
        deltas: [{ blockId: "block1", offset: 6, delta: 1 }], // Insert in middle of emoji region
      },
    ];

    const mapping = createBlockMapping(transforms);

    // Should not crash
    expect(mapping).toBeDefined();
  });

  it("should handle Chinese characters", () => {
    const input: CanonInputNode = {
      kind: "element",
      tag: "p",
      attrs: {},
      children: [{ kind: "text", text: "你好世界" }],
    };

    const result = canonicalizeDocument({ root: input });
    const root = result.root as CanonBlock;
    const text = root.children[0] as CanonText;

    expect(text.text).toBe("你好世界");
  });

  it("should handle mixed ASCII and Unicode", () => {
    const input: CanonInputNode = {
      kind: "element",
      tag: "p",
      attrs: {},
      children: [{ kind: "text", text: "Hello 世界 🌍" }],
    };

    const result = canonicalizeDocument({ root: input });
    const root = result.root as CanonBlock;
    const text = root.children[0] as CanonText;

    expect(text.text).toBe("Hello 世界 🌍");
  });
});
