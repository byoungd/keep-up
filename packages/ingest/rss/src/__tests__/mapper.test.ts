import { canonicalizeText, computeCanonicalHash } from "@ku0/core";
import { describe, expect, it } from "vitest";
import { RSSMapper } from "../mapper";
import { RSSNormalizer } from "../normalizer";
import type { FeedSource, RSSItem } from "../types";

describe("RSSMapper", () => {
  it("derives docId and blocks from canonicalized content", () => {
    const item: RSSItem = {
      title: "Sample",
      content: "Alpha\r\n\r\nBeta\n\nGamma",
    };
    const source: FeedSource = { url: "https://example.com/feed" };

    const result = RSSMapper.mapItemToDoc(item, source);
    const cleaned = RSSNormalizer.cleanContent(item.content ?? "");
    const canonical = canonicalizeText(cleaned);
    const hashSummary = computeCanonicalHash(canonical.blocks.map((text) => ({ text })));

    expect(result.doc.id).toBe(`doc_${hashSummary.docHash}`);
    expect(result.doc.canonicalHash).toBe(hashSummary.docHash);
    expect(result.doc.blocks).toHaveLength(canonical.blocks.length);
    for (const [index, block] of result.doc.blocks.entries()) {
      expect(block.text).toBe(canonical.blocks[index]);
      expect(block.id).toBe(`block_${hashSummary.docHash}_${hashSummary.blockHashes[index]}`);
    }
  });

  it("uses canonicalization rules (CRLF normalization, newline trimming)", () => {
    const item: RSSItem = {
      title: "Whitespace",
      content: "\n\nFirst\r\n\r\nSecond\n",
    };
    const source: FeedSource = { url: "https://example.com/feed" };

    const result = RSSMapper.mapItemToDoc(item, source);
    expect(result.doc.blocks.map((block) => block.text)).toEqual(["First", "Second"]);
  });
});
