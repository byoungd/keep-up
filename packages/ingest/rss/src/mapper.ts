import { type Block, canonicalizeText, computeCanonicalHash } from "@ku0/core";
import { RSSNormalizer, hashSync } from "./normalizer";
import type { FeedSource, IngestDoc, IngestResult, RSSItem } from "./types";

export const RSSMapper = {
  mapItemToDoc(item: RSSItem, _source: FeedSource): IngestResult {
    const now = Date.now();

    // Title fallback
    const title = item.title || "Untitled";

    // Block creation (Simple strategy: one block for content)
    // In a real app, we might use a tokenizer or richer parser here
    const content = item["content:encoded"] || item.content || item.description || "";
    const cleanedContent = RSSNormalizer.cleanContent(content);
    const canonical = canonicalizeText(cleanedContent);

    const hashSummary = computeCanonicalHash(canonical.blocks.map((text) => ({ text })));
    const docId = `doc_${hashSummary.docHash}`;

    // LFCC Text Block creation
    const blocks: Block[] = canonical.blocks.map((text, index) => {
      const blockHash =
        hashSummary.blockHashes[index] ?? hashSync(`${docId}:${index}:${text}`).slice(0, 12);
      return {
        id: `block_${hashSummary.docHash}_${blockHash}`,
        type: "paragraph",
        text,
        children: [],
      };
    });

    // Doc creation
    const doc: IngestDoc = {
      id: docId,
      title,
      blocks,
      annotations: [],
      canonicalHash: hashSummary.docHash,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };

    // Extract original ID (GUID or Link) with normalization for stability
    const hasSourceRef = Boolean(item.link || item.guid);
    const originalId = hasSourceRef
      ? RSSNormalizer.generateStableId(item.link ?? "", item.guid)
      : `rss-${hashSummary.docHash}`;

    return {
      doc,
      originalId,
      raw: item,
    };
  },
};
