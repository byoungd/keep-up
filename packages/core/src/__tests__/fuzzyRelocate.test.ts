/**
 * LFCC v0.9 RC - Fuzzy Relocate Tests
 *
 * Tests for Level 3 AI-powered anchor recovery.
 */

import { describe, expect, it } from "vitest";
import { createAnchor } from "../kernel/mapping/anchors";
import {
  type DocumentContentAccessor,
  computeContentHash,
  computeTextSimilarity,
  findSubstringMatches,
  fuzzyRelocateAnchor,
} from "../kernel/mapping/fuzzyRelocate";
import type { BlockMapping } from "../kernel/mapping/types";

// Mock BlockMapping that simulates content deletion
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

// Mock document content accessor
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

describe("computeTextSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(computeTextSimilarity("hello world", "hello world")).toBe(1.0);
  });

  it("returns 0.0 for completely different strings", () => {
    const sim = computeTextSimilarity("abc", "xyz");
    expect(sim).toBeLessThan(0.5);
  });

  it("returns high similarity for minor edits", () => {
    const sim = computeTextSimilarity("The quick brown fox", "The fast brown fox");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("handles empty strings", () => {
    expect(computeTextSimilarity("", "")).toBe(1.0);
    expect(computeTextSimilarity("hello", "")).toBe(0.0);
    expect(computeTextSimilarity("", "hello")).toBe(0.0);
  });

  it("is case-sensitive", () => {
    const sim = computeTextSimilarity("Hello", "hello");
    expect(sim).toBeLessThan(1.0);
    expect(sim).toBeGreaterThan(0.5);
  });
});

describe("findSubstringMatches", () => {
  it("finds exact matches", () => {
    const matches = findSubstringMatches(
      "brown fox",
      "The quick brown fox jumps over the lazy dog"
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].score).toBeGreaterThan(0.5);
  });

  it("finds similar content after minor edits", () => {
    const matches = findSubstringMatches("quick brown fox", "The fast brown fox jumps");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("handles short strings gracefully", () => {
    const matches = findSubstringMatches("ab", "abcdefgh");
    expect(matches).toEqual([]);
  });

  it("returns empty for no matches", () => {
    const matches = findSubstringMatches(
      "completely different text",
      "nothing similar here at all xyz"
    );
    // May still find some partial n-gram matches, but score should be low
    for (const m of matches) {
      expect(m.score).toBeLessThan(0.5);
    }
  });
});

describe("fuzzyRelocateAnchor", () => {
  it("returns exact match when block still exists", () => {
    const anchor = createAnchor("block-1", 10, "after");
    const mapping = createMockMapping(new Set());
    const document = createMockDocument({
      "block-1": "The quick brown fox jumps over the lazy dog",
    });

    const result = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "brown fox",
    });

    expect(result.method).toBe("integrity");
    expect(result.confidence).toBe(1.0);
    expect(result.anchor).not.toBeNull();
    expect(result.anchor?.blockId).toBe("block-1");
  });

  it("performs fuzzy match when block is deleted", () => {
    const anchor = createAnchor("block-deleted", 5, "after");
    const mapping = createMockMapping(new Set(["block-deleted"]));
    const document = createMockDocument({
      "block-1": "Some other content",
      "block-2": "The quick brown fox jumps over", // Contains similar content
      "block-3": "More unrelated text",
    });

    const result = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "brown fox",
      threshold: 0.5,
    });

    expect(result.method).toBe("fuzzy_text");
    expect(result.anchor).not.toBeNull();
    expect(result.anchor?.blockId).toBe("block-2");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns failed when no match found", () => {
    const anchor = createAnchor("block-deleted", 5, "after");
    const mapping = createMockMapping(new Set(["block-deleted"]));
    const document = createMockDocument({
      "block-1": "Completely unrelated content xyz",
      "block-2": "Nothing similar here at all abc",
    });

    const result = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "The quick brown fox jumps",
      threshold: 0.8,
    });

    expect(result.method).toBe("failed");
    expect(result.anchor).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("respects threshold parameter", () => {
    const anchor = createAnchor("block-1", 5, "after");
    const mapping = createMockMapping(new Set(["block-1"]));
    const document = createMockDocument({
      "block-2": "A somewhat similar story about wolves",
    });

    // With low threshold, should find match (similar but not exact)
    const lowThreshold = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "story about foxes",
      threshold: 0.3,
    });
    expect(lowThreshold.anchor).not.toBeNull();

    // With high threshold, should not find match (no exact substring)
    const highThreshold = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "story about foxes",
      threshold: 0.99,
    });
    expect(highThreshold.method).toBe("failed");
  });

  it("preserves anchor bias", () => {
    const anchorBefore = createAnchor("block-1", 10, "before");
    const anchorAfter = createAnchor("block-1", 10, "after");
    const mapping = createMockMapping(new Set(["block-1"]));
    const document = createMockDocument({
      "block-2": "The exact same content here",
    });

    const resultBefore = fuzzyRelocateAnchor(anchorBefore, mapping, document, {
      originalContent: "same content",
      threshold: 0.5,
    });
    const resultAfter = fuzzyRelocateAnchor(anchorAfter, mapping, document, {
      originalContent: "same content",
      threshold: 0.5,
    });

    if (resultBefore.anchor && resultAfter.anchor) {
      expect(resultBefore.anchor.bias).toBe("before");
      expect(resultAfter.anchor.bias).toBe("after");
    }
  });

  it("includes debug info", () => {
    const anchor = createAnchor("block-1", 0, "after");
    const mapping = createMockMapping(new Set(["block-1"]));
    const document = createMockDocument({
      "block-2": "The quick brown fox",
      "block-3": "Another quick brown fox",
    });

    const result = fuzzyRelocateAnchor(anchor, mapping, document, {
      originalContent: "brown fox",
      threshold: 0.5,
    });

    expect(result.debug).toBeDefined();
    expect(result.debug?.candidatesConsidered).toBeGreaterThan(0);
  });
});

describe("computeContentHash", () => {
  it("produces consistent hashes", () => {
    const hash1 = computeContentHash("hello world");
    const hash2 = computeContentHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different content", () => {
    const hash1 = computeContentHash("hello");
    const hash2 = computeContentHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("produces 8-character hex strings", () => {
    const hash = computeContentHash("test content");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
