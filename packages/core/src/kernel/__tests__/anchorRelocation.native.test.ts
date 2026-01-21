import { getNativeAnchorRelocation } from "@ku0/anchor-relocation-rs";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { assertParity } from "@ku0/native-bindings/testing";
import { describe, it } from "vitest";
import { createAnchor } from "../mapping/anchors.js";
import {
  computeTextSimilarity,
  type DocumentContentAccessor,
  findSubstringMatches,
  fuzzyRelocateAnchor,
} from "../mapping/fuzzyRelocate.js";
import { computeFuzzyContextHash } from "../mapping/relocate.js";
import type { BlockMapping } from "../mapping/types.js";

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeAnchorRelocation();
nativeFlagStore.clearOverrides();

const testFn = native ? it : it.skip;

function createMockMapping(deletedBlocks: Set<string>): BlockMapping {
  return {
    mapOldToNew(oldBlockId: string, oldAbsInBlock: number) {
      if (deletedBlocks.has(oldBlockId)) {
        return null;
      }
      return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
    },
    derivedBlocksFrom(oldBlockId: string) {
      if (deletedBlocks.has(oldBlockId)) {
        return [];
      }
      return [oldBlockId];
    },
  };
}

function createMockDocument(blocks: Record<string, string>): DocumentContentAccessor {
  const blockOrder = Object.keys(blocks);
  return {
    getBlockContent(blockId: string) {
      return blocks[blockId] ?? null;
    },
    getBlockOrder() {
      return blockOrder;
    },
    getBlocksInRadius(blockId: string, radius: number) {
      const idx = blockOrder.indexOf(blockId);
      if (idx < 0) {
        return blockOrder.slice(0, radius * 2);
      }
      const start = Math.max(0, idx - radius);
      const end = Math.min(blockOrder.length, idx + radius + 1);
      return blockOrder.slice(start, end);
    },
  };
}

describe("Anchor relocation native parity", () => {
  testFn("matches JS similarity outputs", () => {
    if (!native) {
      throw new Error("Native anchor relocation binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    try {
      const a = "The quick brown fox";
      const b = "The fast brown fox";
      const expected = computeTextSimilarity(a, b);
      const actual = native.computeTextSimilarity(a, b);
      assertParity(expected, actual, { label: "computeTextSimilarity parity" });
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("matches JS substring matches", () => {
    if (!native) {
      throw new Error("Native anchor relocation binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    try {
      const needle = "quick brown fox";
      const haystack = "The quick brown fox jumps over the lazy dog";
      const expected = findSubstringMatches(needle, haystack);
      const actual = native.findSubstringMatches(needle, haystack);
      assertParity(expected, actual, { label: "findSubstringMatches parity" });
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("matches JS context hash", () => {
    if (!native) {
      throw new Error("Native anchor relocation binding unavailable.");
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    try {
      const expected = computeFuzzyContextHash("Hello ", "World");
      const actual = native.computeFuzzyContextHash("Hello ", "World");
      assertParity(expected, actual, { label: "computeFuzzyContextHash parity" });
    } finally {
      nativeFlagStore.clearOverrides();
    }
  });

  testFn("matches JS fuzzy relocation results", () => {
    const anchor = createAnchor("block-deleted", 5, "after");
    const mapping = createMockMapping(new Set(["block-deleted"]));
    const document = createMockDocument({
      "block-1": "Some other content",
      "block-2": "The quick brown fox jumps over",
      "block-3": "More unrelated text",
    });

    nativeFlagStore.setOverride("native_accelerators_enabled", false);
    let expected: ReturnType<typeof fuzzyRelocateAnchor> | undefined;
    try {
      expected = fuzzyRelocateAnchor(anchor, mapping, document, {
        originalContent: "brown fox",
        threshold: 0.5,
      });
    } finally {
      nativeFlagStore.clearOverrides();
    }

    nativeFlagStore.setOverride("native_accelerators_enabled", true);
    let actual: ReturnType<typeof fuzzyRelocateAnchor> | undefined;
    try {
      actual = fuzzyRelocateAnchor(anchor, mapping, document, {
        originalContent: "brown fox",
        threshold: 0.5,
      });
    } finally {
      nativeFlagStore.clearOverrides();
    }

    if (!expected || !actual) {
      throw new Error("Expected fuzzy relocation results to be defined.");
    }
    assertParity(expected, actual, { label: "fuzzyRelocateAnchor parity" });
  });
});
