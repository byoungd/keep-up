/**
 * Atomic Ingestion Adapter for RSS
 *
 * Converts RSS ingest results to IngestionMeta format for use with
 * AtomicIngestionService. This ensures RSS content goes through the
 * proper atomic ingestion boundary.
 *
 * @see packages/app/src/root/persistence/ATOMIC_INGESTION_CONTRACT.md
 */

import { canonicalizeText, computeCanonicalHash } from "@ku0/core";
import { RSSNormalizer } from "./normalizer";
import type { FeedSource, RSSItem } from "./types";

/**
 * IngestionMeta format expected by AtomicIngestionService.
 * Defined here to avoid circular dependency with app package.
 */
export interface IngestionMeta {
  title: string;
  content: string;
  sourceId?: string;
}

/**
 * Converts an RSS item to IngestionMeta for atomic ingestion.
 *
 * Usage:
 * ```typescript
 * const meta = RSSAtomicAdapter.toIngestionMeta(item, source);
 * const handle = await ingestionService.beginIngestion(meta);
 * const result = await ingestionService.commitIngestion(handle);
 * ```
 */
/**
 * Converts an RSS item to IngestionMeta for atomic ingestion.
 *
 * Usage:
 * ```typescript
 * const meta = RSSAtomicAdapter.toIngestionMeta(item, source);
 * const handle = await ingestionService.beginIngestion(meta);
 * const result = await ingestionService.commitIngestion(handle);
 * ```
 */
export const RSSAtomicAdapter = {
  /**
   * Convert RSS item to IngestionMeta.
   * Does NOT create Doc/Blocks - that's AtomicIngestionService's job.
   */
  toIngestionMeta(item: RSSItem, _source: FeedSource): IngestionMeta {
    const title = item.title || "Untitled";
    const rawContent = item["content:encoded"] || item.content || item.description || "";
    const content = RSSNormalizer.cleanContent(rawContent);
    const hasSourceRef = Boolean(item.guid || item.link);
    let sourceId: string | undefined;
    if (hasSourceRef) {
      sourceId = RSSNormalizer.generateStableId(item.link ?? "", item.guid);
    } else if (content) {
      const canonical = canonicalizeText(content);
      const hashSummary = computeCanonicalHash(canonical.blocks.map((text) => ({ text })));
      sourceId = `rss-${hashSummary.docHash}`;
    }

    return {
      title,
      content,
      sourceId,
    };
  },

  /**
   * Batch convert RSS items to IngestionMeta array.
   */
  toIngestionMetaBatch(items: RSSItem[], source: FeedSource): IngestionMeta[] {
    return items.map((item) => RSSAtomicAdapter.toIngestionMeta(item, source));
  },
};
