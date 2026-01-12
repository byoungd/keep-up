/**
 * RSS Ingest Normalization Stats
 *
 * Provides observability into RSS parsing quality.
 * Used for quality gates, regression testing, and CI reporting.
 *
 * Data Flow:
 *   RSS URL → RSSFetcher → XML → RSSParser → RSSItem[] → RSSAtomicAdapter → IngestionMeta[]
 *                                                              ↓
 *                                                    RssIngestStats
 */

import type { IngestionMeta } from "./atomicAdapter";
import type { RSSItem } from "./types";

/**
 * Detailed statistics for RSS ingest quality assessment.
 */
export interface RssIngestStats {
  // === Feed-Level Metrics ===
  /** Total items in feed */
  totalItems: number;
  /** Items with non-empty content */
  itemsWithContent: number;
  /** Items with valid title */
  itemsWithTitle: number;
  /** Items with valid link/sourceId */
  itemsWithSourceId: number;

  // === Content Quality Metrics ===
  /** Average content length (chars) */
  avgContentLength: number;
  /** Min content length */
  minContentLength: number;
  /** Max content length */
  maxContentLength: number;
  /** Items with content < 100 chars (snippets) */
  snippetItems: number;
  /** Ratio: snippetItems / totalItems */
  snippetRatio: number;

  // === Extraction Success Rates ===
  /** Ratio: itemsWithContent / totalItems */
  contentExtractionRate: number;
  /** Ratio: itemsWithTitle / totalItems */
  titleExtractionRate: number;
  /** Ratio: itemsWithSourceId / totalItems */
  sourceIdRate: number;

  // === HTML/Encoding Metrics ===
  /** Items with HTML residue in cleaned content */
  itemsWithHtmlResidue: number;
  /** Ratio: itemsWithHtmlResidue / totalItems */
  htmlResidueRatio: number;
  /** Items with high non-ASCII ratio (>10%) */
  itemsWithEncodingIssues: number;

  // === Extensible Fields (future) ===
  /** Duplicate content ratio (future) */
  duplicateContentRatio?: number;
  /** Average fetch latency (future) */
  avgFetchLatencyMs?: number;
}

/**
 * Compute stats from raw RSS items (before normalization).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stats aggregation logic
export function computeRssStatsFromItems(items: RSSItem[]): RssIngestStats {
  if (items.length === 0) {
    return createEmptyStats();
  }

  let itemsWithContent = 0;
  let itemsWithTitle = 0;
  let itemsWithSourceId = 0;
  let itemsWithHtmlResidue = 0;
  let itemsWithEncodingIssues = 0;
  let snippetItems = 0;
  const contentLengths: number[] = [];

  for (const item of items) {
    const rawContent = item["content:encoded"] || item.content || item.description || "";
    const hasContent = rawContent.trim().length > 0;
    const hasTitle = !!item.title && item.title.trim().length > 0;
    const hasSourceId = !!(item.guid || item.link);

    if (hasContent) {
      itemsWithContent++;
      contentLengths.push(rawContent.length);

      // Check for HTML residue (tags remaining after expected cleaning)
      if (/<[a-z][\s\S]*>/i.test(rawContent)) {
        itemsWithHtmlResidue++;
      }

      // Check for encoding issues (high non-ASCII ratio)
      const nonAscii = (rawContent.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
      if (rawContent.length > 0 && nonAscii / rawContent.length > 0.1) {
        itemsWithEncodingIssues++;
      }

      // Check for snippets (short content)
      if (rawContent.length < 100) {
        snippetItems++;
      }
    }

    if (hasTitle) {
      itemsWithTitle++;
    }
    if (hasSourceId) {
      itemsWithSourceId++;
    }
  }

  const avgContentLength =
    contentLengths.length > 0
      ? Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length)
      : 0;
  const minContentLength = contentLengths.length > 0 ? Math.min(...contentLengths) : 0;
  const maxContentLength = contentLengths.length > 0 ? Math.max(...contentLengths) : 0;

  return {
    totalItems: items.length,
    itemsWithContent,
    itemsWithTitle,
    itemsWithSourceId,

    avgContentLength,
    minContentLength,
    maxContentLength,
    snippetItems,
    snippetRatio: round4(snippetItems / items.length),

    contentExtractionRate: round4(itemsWithContent / items.length),
    titleExtractionRate: round4(itemsWithTitle / items.length),
    sourceIdRate: round4(itemsWithSourceId / items.length),

    itemsWithHtmlResidue,
    htmlResidueRatio: round4(itemsWithHtmlResidue / items.length),
    itemsWithEncodingIssues,
  };
}

/**
 * Compute stats from normalized IngestionMeta (after cleaning).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stats aggregation logic
export function computeRssStatsFromMeta(metas: IngestionMeta[]): RssIngestStats {
  if (metas.length === 0) {
    return createEmptyStats();
  }

  let itemsWithContent = 0;
  let itemsWithTitle = 0;
  let itemsWithSourceId = 0;
  let itemsWithHtmlResidue = 0;
  let itemsWithEncodingIssues = 0;
  let snippetItems = 0;
  const contentLengths: number[] = [];

  for (const meta of metas) {
    const hasContent = meta.content.trim().length > 0;
    const hasTitle = meta.title !== "Untitled" && meta.title.trim().length > 0;
    const hasSourceId = !!meta.sourceId;

    if (hasContent) {
      itemsWithContent++;
      contentLengths.push(meta.content.length);

      // Check for HTML residue in cleaned content (should be minimal)
      if (/<[a-z][\s\S]*>/i.test(meta.content)) {
        itemsWithHtmlResidue++;
      }

      // Check for encoding issues
      const nonAscii = (meta.content.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
      if (meta.content.length > 0 && nonAscii / meta.content.length > 0.1) {
        itemsWithEncodingIssues++;
      }

      if (meta.content.length < 100) {
        snippetItems++;
      }
    }

    if (hasTitle) {
      itemsWithTitle++;
    }
    if (hasSourceId) {
      itemsWithSourceId++;
    }
  }

  const avgContentLength =
    contentLengths.length > 0
      ? Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length)
      : 0;
  const minContentLength = contentLengths.length > 0 ? Math.min(...contentLengths) : 0;
  const maxContentLength = contentLengths.length > 0 ? Math.max(...contentLengths) : 0;

  return {
    totalItems: metas.length,
    itemsWithContent,
    itemsWithTitle,
    itemsWithSourceId,

    avgContentLength,
    minContentLength,
    maxContentLength,
    snippetItems,
    snippetRatio: round4(snippetItems / metas.length),

    contentExtractionRate: round4(itemsWithContent / metas.length),
    titleExtractionRate: round4(itemsWithTitle / metas.length),
    sourceIdRate: round4(itemsWithSourceId / metas.length),

    itemsWithHtmlResidue,
    htmlResidueRatio: round4(itemsWithHtmlResidue / metas.length),
    itemsWithEncodingIssues,
  };
}

function createEmptyStats(): RssIngestStats {
  return {
    totalItems: 0,
    itemsWithContent: 0,
    itemsWithTitle: 0,
    itemsWithSourceId: 0,
    avgContentLength: 0,
    minContentLength: 0,
    maxContentLength: 0,
    snippetItems: 0,
    snippetRatio: 0,
    contentExtractionRate: 0,
    titleExtractionRate: 0,
    sourceIdRate: 0,
    itemsWithHtmlResidue: 0,
    htmlResidueRatio: 0,
    itemsWithEncodingIssues: 0,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Quality gate thresholds for RSS ingest.
 *
 * Note: RSS feeds often provide only snippets/summaries, not full content.
 * Thresholds are calibrated for this reality.
 */
export const RSS_QUALITY_THRESHOLDS = {
  /** Min content extraction rate */
  minContentExtractionRate: 0.8,
  /** Min title extraction rate */
  minTitleExtractionRate: 0.9,
  /** Max snippet ratio (items with <100 chars) - RSS often has snippets */
  maxSnippetRatio: 0.8,
  /** Max HTML residue ratio in cleaned content */
  maxHtmlResidueRatio: 0.1,
  /** Min average content length */
  minAvgContentLength: 30,
  /** Min items in feed (sanity check) */
  minItemCount: 1,
} as const;

export type RssQualityThresholds = typeof RSS_QUALITY_THRESHOLDS;

export type RssQualityFailureReason =
  | "content_rate_too_low"
  | "title_rate_too_low"
  | "snippet_ratio_exceeded"
  | "html_residue_exceeded"
  | "avg_content_too_short"
  | "too_few_items"
  | "fetch_error"
  | "parse_error"
  | "timeout";

export interface RssQualityReport {
  passed: boolean;
  reasons: RssQualityFailureReason[];
  thresholds: RssQualityThresholds;
  stats: RssIngestStats;
}

/**
 * Evaluate ingest quality against thresholds and return failure reasons (if any).
 * Uses deduped stats in the caller to avoid double-counting duplicates.
 */
export function evaluateRssQuality(
  stats: RssIngestStats,
  thresholds: RssQualityThresholds = RSS_QUALITY_THRESHOLDS
): RssQualityReport {
  const reasons: RssQualityFailureReason[] = [];

  if (stats.totalItems < thresholds.minItemCount) {
    reasons.push("too_few_items");
  }
  if (stats.contentExtractionRate < thresholds.minContentExtractionRate) {
    reasons.push("content_rate_too_low");
  }
  if (stats.titleExtractionRate < thresholds.minTitleExtractionRate) {
    reasons.push("title_rate_too_low");
  }
  if (stats.snippetRatio > thresholds.maxSnippetRatio) {
    reasons.push("snippet_ratio_exceeded");
  }
  if (stats.htmlResidueRatio > thresholds.maxHtmlResidueRatio) {
    reasons.push("html_residue_exceeded");
  }
  if (stats.avgContentLength < thresholds.minAvgContentLength) {
    reasons.push("avg_content_too_short");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    thresholds,
    stats,
  };
}
