/**
 * LFCC v0.9 RC - Block Mapping Tests
 */

import { describe, expect, it } from "vitest";
import {
  type BlockTransform,
  absoluteFromAnchor,
  anchorFromAbsolute,
  compareAnchors,
  createBlockMapping,
  expandTouchedBlocks,
  verifyMonotonicity,
} from "../mapping/index.js";
import { sortOperations } from "../operationOrdering.js";

describe("BlockMapping", () => {
  describe("createBlockMapping", () => {
    it("should map unchanged blocks", () => {
      const transforms: BlockTransform[] = [
        { kind: "unchanged", oldId: "block1", newId: "block1" },
      ];

      const mapping = createBlockMapping(transforms);
      const result = mapping.mapOldToNew("block1", 5);

      expect(result).toEqual({ newBlockId: "block1", newAbsInBlock: 5 });
    });

    it("should map modified blocks with deltas", () => {
      const transforms: BlockTransform[] = [
        {
          kind: "modified",
          oldId: "block1",
          newId: "block1",
          deltas: [{ blockId: "block1", offset: 3, delta: 2 }], // Insert 2 chars at pos 3
        },
      ];

      const mapping = createBlockMapping(transforms);

      // Position before insertion
      expect(mapping.mapOldToNew("block1", 2)).toEqual({
        newBlockId: "block1",
        newAbsInBlock: 2,
      });

      // Position at/after insertion
      expect(mapping.mapOldToNew("block1", 5)).toEqual({
        newBlockId: "block1",
        newAbsInBlock: 7,
      });
    });

    it("should map split blocks", () => {
      const transforms: BlockTransform[] = [
        { kind: "split", oldId: "block1", newIds: ["block1a", "block1b"], splitAt: 10 },
      ];

      const mapping = createBlockMapping(transforms);

      // Position in first half
      expect(mapping.mapOldToNew("block1", 5)).toEqual({
        newBlockId: "block1a",
        newAbsInBlock: 5,
      });

      // Position in second half
      expect(mapping.mapOldToNew("block1", 15)).toEqual({
        newBlockId: "block1b",
        newAbsInBlock: 5,
      });
    });

    it("should return null for deleted blocks", () => {
      const transforms: BlockTransform[] = [{ kind: "deleted", oldId: "block1" }];

      const mapping = createBlockMapping(transforms);
      expect(mapping.mapOldToNew("block1", 5)).toBeNull();
    });

    it("should track derived blocks", () => {
      const transforms: BlockTransform[] = [
        { kind: "split", oldId: "block1", newIds: ["block1a", "block1b"], splitAt: 10 },
      ];

      const mapping = createBlockMapping(transforms);
      expect(mapping.derivedBlocksFrom("block1")).toEqual(["block1a", "block1b"]);
    });
  });

  describe("verifyMonotonicity", () => {
    it("should verify monotonic mapping", () => {
      const transforms: BlockTransform[] = [
        { kind: "unchanged", oldId: "block1", newId: "block1" },
      ];

      const mapping = createBlockMapping(transforms);
      expect(verifyMonotonicity(mapping, "block1", [1, 5, 10, 15])).toBe(true);
    });

    it("should detect non-monotonic mapping", () => {
      // Create a mapping that violates monotonicity (artificial case)
      const mapping = {
        mapOldToNew(oldBlockId: string, oldAbsInBlock: number) {
          // Reverse positions (violates monotonicity)
          return { newBlockId: oldBlockId, newAbsInBlock: 100 - oldAbsInBlock };
        },
        derivedBlocksFrom() {
          return [];
        },
      };

      expect(verifyMonotonicity(mapping, "block1", [10, 20, 30])).toBe(false);
    });
  });
});

describe("Neighbor Expansion", () => {
  it("should expand touched blocks by K neighbors", () => {
    const order = {
      contentBlockIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    };

    const expanded = expandTouchedBlocks(["b4"], order, { neighbor_expand_k: 1 });
    expect(expanded).toEqual(["b3", "b4", "b5"]);
  });

  it("should handle edge blocks", () => {
    const order = {
      contentBlockIds: ["b1", "b2", "b3", "b4", "b5"],
    };

    const expanded = expandTouchedBlocks(["b1"], order, { neighbor_expand_k: 2 });
    expect(expanded).toEqual(["b1", "b2", "b3"]);
  });

  it("should merge overlapping expansions", () => {
    const order = {
      contentBlockIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    };

    const expanded = expandTouchedBlocks(["b2", "b4"], order, { neighbor_expand_k: 1 });
    expect(expanded).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("should return empty for empty input", () => {
    const order = { contentBlockIds: ["b1", "b2", "b3"] };
    expect(expandTouchedBlocks([], order)).toEqual([]);
  });

  it("should adapt expansion for nested list blocks", () => {
    const order = {
      contentBlockIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
      blockMeta: {
        b4: { listDepth: 2, tableDepth: 0 },
      },
    };

    const expanded = expandTouchedBlocks(["b4"], order, {
      neighbor_expand_k: 1,
      max_adaptive_k: 3,
      list_depth_bonus: 1,
      table_depth_bonus: 0,
    });

    expect(expanded).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7"]);
  });
});

describe("Anchors", () => {
  it("should encode and decode anchors", () => {
    const anchor = anchorFromAbsolute("block123", 42, "after");
    const decoded = absoluteFromAnchor(anchor);

    expect(decoded).toEqual({
      blockId: "block123",
      offset: 42,
      bias: "after",
    });
  });

  it("should return null for invalid anchor checksum", () => {
    const valid = anchorFromAbsolute("b1", 10, "after");
    // Tamper by flipping the last character to invalidate HMAC
    const tampered = valid.slice(0, -1) + (valid.endsWith("A") ? "B" : "A"); // simple flip to change base64 content

    expect(absoluteFromAnchor(tampered)).toBeNull();
  });

  it("should compare anchors correctly", () => {
    const blockOrder = ["b1", "b2", "b3"];

    const a1 = { blockId: "b1", offset: 5, bias: "after" as const };
    const a2 = { blockId: "b2", offset: 3, bias: "after" as const };
    const a3 = { blockId: "b1", offset: 10, bias: "after" as const };
    const a4 = { blockId: "b1", offset: 5, bias: "before" as const };

    // Different blocks
    expect(compareAnchors(a1, a2, blockOrder)).toBeLessThan(0);
    expect(compareAnchors(a2, a1, blockOrder)).toBeGreaterThan(0);

    // Same block, different offset
    expect(compareAnchors(a1, a3, blockOrder)).toBeLessThan(0);

    // Same position, different bias
    expect(compareAnchors(a4, a1, blockOrder)).toBeLessThan(0);
  });

  it("createBlockMapping should throw on surrogate-breaking split when text provided", () => {
    const transforms: BlockTransform[] = [
      { kind: "split", oldId: "b1", newIds: ["b1", "b2"], splitAt: 2 },
    ];
    const blockTexts = { b1: "A😊B" }; // emoji occupies indices 1-2
    expect(() => createBlockMapping(transforms, { blockTexts })).toThrow();
  });

  it("sortOperations is deterministic", () => {
    const ops = [
      { opCode: "OP_BLOCK_JOIN", blockId: "B", timestamp: 10 },
      { opCode: "OP_BLOCK_SPLIT", blockId: "A", timestamp: 15 },
      { opCode: "OP_BLOCK_SPLIT", blockId: "A", timestamp: 5 },
    ];
    const sorted = sortOperations(ops);
    expect(sorted[0].blockId).toBe("A");
    expect(sorted[0].timestamp).toBe(5);
    expect(sorted[1].timestamp).toBe(15);
  });
});
