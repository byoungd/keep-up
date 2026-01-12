import { dedupeRssItems } from "./deduper";
import { RSSFetcher } from "./fetcher";
import type { RSSIngestReport } from "./ingestReport";
import { RSSMapper } from "./mapper";
import { RSSNormalizer } from "./normalizer";
import { RSSParser } from "./parser";
import { computeRssStatsFromItems, evaluateRssQuality } from "./rssStats";
import type { FeedSource, IngestResult, RSSIngestOptions, RSSItem } from "./types";

export * from "./atomicAdapter";
// NOTE: contentExtractor and fullTextFetcher use jsdom which requires Node.js.
// Import directly from those files in server-side code only.
// export * from './contentExtractor';
export * from "./defaultFeeds";
export * from "./fetcher";
// export * from './fullTextFetcher';
export * from "./htmlUtils";
export * from "./deduper";
export * from "./mapper";
export * from "./normalizer";
export * from "./parser";
export * from "./plugin";
export * from "./retry";
export * from "./rssStats";
export * from "./types";
export * from "./ingestReport";

export interface EnhancedIngestOptions extends RSSIngestOptions {
  /** Fetch full article content when RSS only provides snippets */
  fetchFullText?: boolean;
  /** Threshold (in characters) below which content is considered a snippet */
  snippetThreshold?: number;
  /** ETag from previous fetch for conditional requests */
  etag?: string;
  /** Last-Modified from previous fetch for conditional requests */
  lastModified?: string;
  /** Proxy URL for fetching full text (to bypass CORS in browser) */
  proxyUrl?: string;
}

export interface EnhancedIngestResult {
  items: IngestResult[];
  /** ETag for conditional requests */
  etag?: string;
  /** Last-Modified for conditional requests */
  lastModified?: string;
  /** Whether feed was modified since last fetch */
  modified: boolean;
}

const FULL_TEXT_CONCURRENCY = 3;

function getItemContent(item: RSSItem): string {
  return item["content:encoded"] || item.content || item.description || "";
}

/**
 * Fetch full text content from a URL.
 * Uses proxy if provided (for browser CORS bypass), otherwise direct fetch.
 */
async function fetchFullTextFallback(
  url: string,
  timeout: number,
  proxyUrl?: string
): Promise<string | null> {
  if (typeof fetch !== "function") {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Use proxy if provided (for browser CORS bypass)
    const fetchUrl = proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(url)}` : url;

    const response = await fetch(fetchUrl, {
      headers: proxyUrl
        ? {}
        : {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    // Handle proxy response (JSON) vs direct response (HTML)
    if (proxyUrl) {
      const data = await response.json();
      if (data.error) {
        return null;
      }
      const cleaned = RSSNormalizer.cleanContent(data.html);
      return cleaned || null;
    }
    const html = await response.text();
    const cleaned = RSSNormalizer.cleanContent(html);
    return cleaned || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hydrateItemsWithFullText(
  items: RSSItem[],
  snippetThreshold: number,
  timeout: number,
  proxyUrl?: string
): Promise<void> {
  const candidates = items.filter((item) => {
    if (!item.link) {
      return false;
    }
    return RSSNormalizer.isSnippet(getItemContent(item), snippetThreshold);
  });

  if (candidates.length === 0) {
    return;
  }

  for (let i = 0; i < candidates.length; i += FULL_TEXT_CONCURRENCY) {
    const batch = candidates.slice(i, i + FULL_TEXT_CONCURRENCY);
    await Promise.all(
      batch.map(async (item) => {
        // biome-ignore lint/style/noNonNullAssertion: link checked by filter
        const fullText = await fetchFullTextFallback(item.link!, timeout, proxyUrl);
        if (!fullText) {
          return;
        }
        item["content:encoded"] = fullText;
        item.content = fullText;
      })
    );
  }
}

export class RSSIngestor {
  private parser: RSSParser;

  constructor() {
    this.parser = new RSSParser();
  }

  /**
   * Fetches and parses a feed, returning normalized items (Doc + Blocks).
   *
   * @deprecated Use fetchFeedForIngestion() with AtomicIngestionService instead.
   * Direct Doc/Block creation bypasses atomic ingestion guarantees.
   */
  async fetchFeed(source: FeedSource, options: RSSIngestOptions = {}): Promise<IngestResult[]> {
    const xml = await RSSFetcher.fetch(source, options);
    const items = await this.parser.parse(xml);

    return items.map((item) => RSSMapper.mapItemToDoc(item, source));
  }

  /**
   * Enhanced feed fetching with conditional requests.
   *
   * NOTE: Browser builds use a lightweight HTML cleaner for full-text fallback.
   * For higher quality extraction, use server-side code with
   * direct import from '@packages/ingest-rss/src/fullTextFetcher'.
   */
  async fetchFeedEnhanced(
    source: FeedSource,
    options: EnhancedIngestOptions = {}
  ): Promise<EnhancedIngestResult> {
    const {
      fetchFullText: shouldFetch,
      snippetThreshold = 500,
      proxyUrl,
      ...fetchOptions
    } = options;

    // Fetch with conditional request support (pass proxyUrl for CORS bypass)
    const fetchResult = await RSSFetcher.fetchWithConditional(source, {
      ...fetchOptions,
      proxyUrl,
    });

    // If not modified, return empty result with cache headers
    if (!fetchResult.modified) {
      return {
        items: [],
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        modified: false,
      };
    }

    // Parse the feed
    const items = await this.parser.parse(fetchResult.content);
    if (shouldFetch) {
      await hydrateItemsWithFullText(
        items,
        snippetThreshold,
        fetchOptions.timeout ?? 15000,
        proxyUrl
      );
    }
    const results = items.map((item) => RSSMapper.mapItemToDoc(item, source));

    return {
      items: results,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
      modified: true,
    };
  }

  /**
   * Fetches and parses a feed, returning IngestionMeta for atomic ingestion.
   *
   * Usage:
   * ```typescript
   * const metas = await ingestor.fetchFeedForIngestion(source);
   * for (const meta of metas) {
   *   const handle = await ingestionService.beginIngestion(meta);
   *   await ingestionService.commitIngestion(handle);
   * }
   * ```
   */
  async fetchFeedForIngestion(source: FeedSource, options: RSSIngestOptions = {}) {
    const { RSSAtomicAdapter } = await import("./atomicAdapter");
    const xml = await RSSFetcher.fetch(source, options);
    const items = await this.parser.parse(xml);
    return RSSAtomicAdapter.toIngestionMetaBatch(items, source);
  }

  /**
   * Fetch feed and return ingestion-ready metas with observability and dedupe.
   */
  async fetchFeedWithStats(
    source: FeedSource,
    options: EnhancedIngestOptions & { dedupe?: boolean } = {}
  ): Promise<RSSIngestReport> {
    const { RSSAtomicAdapter } = await import("./atomicAdapter");
    const { dedupe = true, ...rest } = options;

    const fetchResult = await RSSFetcher.fetchWithConditional(source, rest);

    if (!fetchResult.modified) {
      const emptyStats = computeRssStatsFromItems([]);
      return {
        metas: [],
        items: [],
        stats: {
          raw: emptyStats,
          deduped: emptyStats,
        },
        duplicates: [],
        fetch: {
          etag: fetchResult.etag,
          lastModified: fetchResult.lastModified,
          modified: fetchResult.modified,
          durationMs: fetchResult.durationMs,
        },
        quality: evaluateRssQuality(emptyStats),
      };
    }

    const items = await this.parser.parse(fetchResult.content);
    if (rest.fetchFullText) {
      await hydrateItemsWithFullText(
        items,
        rest.snippetThreshold ?? 500,
        rest.timeout ?? 15000,
        rest.proxyUrl
      );
    }
    const dedupeResult = dedupe ? dedupeRssItems(items) : { items, duplicates: [] };
    const mappedItems = dedupeResult.items.map((item) => RSSMapper.mapItemToDoc(item, source));
    const metas = RSSAtomicAdapter.toIngestionMetaBatch(dedupeResult.items, source);
    const rawStats = computeRssStatsFromItems(items);
    const dedupedStats = computeRssStatsFromItems(dedupeResult.items);

    return {
      metas,
      items: mappedItems,
      stats: {
        raw: rawStats,
        deduped: dedupedStats,
      },
      duplicates: dedupeResult.duplicates,
      fetch: {
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        modified: fetchResult.modified,
        durationMs: fetchResult.durationMs,
      },
      quality: evaluateRssQuality(dedupedStats),
    };
  }

  /**
   * Normalizes a single raw RSS item into our Doc/Block structure.
   *
   * @deprecated Use RSSAtomicAdapter.toIngestionMeta() instead.
   */
  // biome-ignore lint/suspicious/noExplicitAny: deprecated method
  static normalizeItem(rawItem: any, source: FeedSource): IngestResult {
    return RSSMapper.mapItemToDoc(rawItem, source);
  }
}
