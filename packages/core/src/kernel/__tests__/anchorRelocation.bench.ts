import { getNativeAnchorRelocation } from "@ku0/anchor-relocation-rs";
import { type BenchmarkResult, bench } from "@ku0/native-bindings/bench";
import { nativeFlagStore } from "@ku0/native-bindings/flags";
import { createAnchor } from "../mapping/anchors.js";
import { type DocumentContentAccessor, fuzzyRelocateAnchor } from "../mapping/fuzzyRelocate.js";
import type { BlockMapping } from "../mapping/types.js";

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

const base = "The quick brown fox jumps over the lazy dog. ";
const largeText = base.repeat(1500);
const blocks = {
  "block-1": `${largeText} Extra trailing context.`,
  "block-2": `Preamble ${largeText}`,
  "block-3": "Short unrelated block.",
};

const mapping = createMockMapping(new Set(["block-deleted"]));
const document = createMockDocument(blocks);
const anchor = createAnchor("block-deleted", 5, "after");
const options = {
  originalContent: "quick brown fox jumps over",
  threshold: 0.5,
};

nativeFlagStore.setOverride("native_accelerators_enabled", true);
const native = getNativeAnchorRelocation();
nativeFlagStore.clearOverrides();

const results: BenchmarkResult[] = [];

nativeFlagStore.setOverride("native_accelerators_enabled", false);
try {
  results.push(
    bench("fuzzyRelocateAnchor-js", () => {
      fuzzyRelocateAnchor(anchor, mapping, document, options);
    })
  );
} finally {
  nativeFlagStore.clearOverrides();
}

if (native) {
  nativeFlagStore.setOverride("native_accelerators_enabled", true);
  try {
    results.push(
      bench("fuzzyRelocateAnchor-native", () => {
        fuzzyRelocateAnchor(anchor, mapping, document, options);
      })
    );
  } finally {
    nativeFlagStore.clearOverrides();
  }
}

// biome-ignore lint/suspicious/noConsole: benchmark output is intentional
console.log(results);
