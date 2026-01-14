import { observability } from "@keepup/core";
import { type DuplicateEntry, dedupeRssItems, dedupeRssItemsByStableId } from "./deduper";
import { type FetchResult, RSSFetcher } from "./fetcher";
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

export interface FeedItemsFetchResult {
  items: RSSItem[];
  duplicates: DuplicateEntry[];
  /** ETag for conditional requests */
  etag?: string;
  /** Last-Modified for conditional requests */
  lastModified?: string;
  /** Whether feed was modified since last fetch */
  modified: boolean;
  /** Fetch duration in milliseconds */
  durationMs?: number;
}

const FULL_TEXT_CONCURRENCY = 3;

const logger = observability.getLogger();

type IngestStage = "fetch" | "parse" | "normalize";
type StageStatus = "start" | "success" | "failure";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function logStage(
  stage: IngestStage,
  status: StageStatus,
  data: Record<string, unknown>,
  error?: Error
): void {
  const message = `RSS ingest ${stage} ${status}`;
  if (status === "failure") {
    logger.error("ingest", message, error, data);
    return;
  }
  logger.info("ingest", message, data);
}

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

  private async fetchAndParse(
    source: FeedSource,
    options: EnhancedIngestOptions = {}
  ): Promise<{ fetchResult: FetchResult; items: RSSItem[] }> {
    const { proxyUrl, ...fetchOptions } = options;
    const fetchContext = { stage: "fetch", sourceUrl: source.url };

    logStage("fetch", "start", fetchContext);
    const fetchStart = Date.now();
    let fetchResult: FetchResult;
    try {
      fetchResult = await RSSFetcher.fetchWithConditional(source, {
        ...fetchOptions,
        proxyUrl,
      });
    } catch (error) {
      logStage(
        "fetch",
        "failure",
        { ...fetchContext, durationMs: Date.now() - fetchStart },
        toError(error)
      );
      throw error;
    }
    logStage("fetch", "success", {
      ...fetchContext,
      durationMs: Date.now() - fetchStart,
      modified: fetchResult.modified,
    });

    if (!fetchResult.modified) {
      return { fetchResult, items: [] };
    }

    const parseContext = { stage: "parse", sourceUrl: source.url };
    logStage("parse", "start", parseContext);
    const parseStart = Date.now();
    try {
      const items = await this.parser.parse(fetchResult.content);
      logStage("parse", "success", {
        ...parseContext,
        durationMs: Date.now() - parseStart,
        itemCount: items.length,
      });
      return { fetchResult, items };
    } catch (error) {
      logStage(
        "parse",
        "failure",
        { ...parseContext, durationMs: Date.now() - parseStart },
        toError(error)
      );
      throw error;
    }
  }

  /**
   * Fetches and parses a feed, returning normalized items (Doc + Blocks).
   *
   * @deprecated Use fetchFeedForIngestion() with AtomicIngestionService instead.
   * Direct Doc/Block creation bypasses atomic ingestion guarantees.
   */
  async fetchFeed(source: FeedSource, options: RSSIngestOptions = {}): Promise<IngestResult[]> {
    const fetchContext = { stage: "fetch", sourceUrl: source.url };
    logStage("fetch", "start", fetchContext);
    const fetchStart = Date.now();
    let xml: string;
    try {
      xml = await RSSFetcher.fetch(source, options);
    } catch (error) {
      logStage(
        "fetch",
        "failure",
        { ...fetchContext, durationMs: Date.now() - fetchStart },
        toError(error)
      );
      throw error;
    }
    logStage("fetch", "success", {
      ...fetchContext,
      durationMs: Date.now() - fetchStart,
      modified: true,
    });

    const parseContext = { stage: "parse", sourceUrl: source.url };
    logStage("parse", "start", parseContext);
    const parseStart = Date.now();
    let items: RSSItem[];
    try {
      items = await this.parser.parse(xml);
    } catch (error) {
      logStage(
        "parse",
        "failure",
        { ...parseContext, durationMs: Date.now() - parseStart },
        toError(error)
      );
      throw error;
    }
    logStage("parse", "success", {
      ...parseContext,
      durationMs: Date.now() - parseStart,
      itemCount: items.length,
    });

    const normalizeContext = { stage: "normalize", sourceUrl: source.url };
    logStage("normalize", "start", normalizeContext);
    const normalizeStart = Date.now();
    try {
      const results = items.map((item) => RSSMapper.mapItemToDoc(item, source));
      logStage("normalize", "success", {
        ...normalizeContext,
        durationMs: Date.now() - normalizeStart,
        itemCount: results.length,
      });
      return results;
    } catch (error) {
      logStage(
        "normalize",
        "failure",
        { ...normalizeContext, durationMs: Date.now() - normalizeStart },
        toError(error)
      );
      throw error;
    }
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

    const { fetchResult, items } = await this.fetchAndParse(source, {
      ...fetchOptions,
      proxyUrl,
    });

    if (!fetchResult.modified) {
      return {
        items: [],
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        modified: false,
      };
    }

    if (shouldFetch) {
      await hydrateItemsWithFullText(
        items,
        snippetThreshold,
        fetchOptions.timeout ?? 15000,
        proxyUrl
      );
    }

    const normalizeContext = { stage: "normalize", sourceUrl: source.url };
    logStage("normalize", "start", normalizeContext);
    const normalizeStart = Date.now();
    let results: IngestResult[];
    try {
      results = items.map((item) => RSSMapper.mapItemToDoc(item, source));
    } catch (error) {
      logStage(
        "normalize",
        "failure",
        { ...normalizeContext, durationMs: Date.now() - normalizeStart },
        toError(error)
      );
      throw error;
    }
    logStage("normalize", "success", {
      ...normalizeContext,
      durationMs: Date.now() - normalizeStart,
      itemCount: results.length,
    });

    return {
      items: results,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
      modified: true,
    };
  }

  /**
   * Fetch feed and return raw RSS items with fast dedupe.
   */
  async fetchFeedItems(
    source: FeedSource,
    options: EnhancedIngestOptions & { dedupe?: boolean } = {}
  ): Promise<FeedItemsFetchResult> {
    const {
      fetchFullText: shouldFetch,
      snippetThreshold = 500,
      proxyUrl,
      dedupe = true,
      ...fetchOptions
    } = options;

    const { fetchResult, items } = await this.fetchAndParse(source, {
      ...fetchOptions,
      proxyUrl,
    });

    if (!fetchResult.modified) {
      return {
        items: [],
        duplicates: [],
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
        modified: false,
        durationMs: fetchResult.durationMs,
      };
    }

    const dedupeResult = dedupe ? dedupeRssItemsByStableId(items) : { items, duplicates: [] };

    if (shouldFetch) {
      await hydrateItemsWithFullText(
        dedupeResult.items,
        snippetThreshold,
        fetchOptions.timeout ?? 15000,
        proxyUrl
      );
    }

    return {
      items: dedupeResult.items,
      duplicates: dedupeResult.duplicates,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
      modified: true,
      durationMs: fetchResult.durationMs,
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
    const { fetchResult, items } = await this.fetchAndParse(source, options);

    if (!fetchResult.modified) {
      return [];
    }

    const normalizeContext = { stage: "normalize", sourceUrl: source.url };
    logStage("normalize", "start", normalizeContext);
    const normalizeStart = Date.now();
    try {
      const metas = RSSAtomicAdapter.toIngestionMetaBatch(items, source);
      logStage("normalize", "success", {
        ...normalizeContext,
        durationMs: Date.now() - normalizeStart,
        itemCount: metas.length,
      });
      return metas;
    } catch (error) {
      logStage(
        "normalize",
        "failure",
        { ...normalizeContext, durationMs: Date.now() - normalizeStart },
        toError(error)
      );
      throw error;
    }
  }

  /**
   * Fetch feed and return ingestion-ready metas with observability and dedupe.
   */
  async fetchFeedWithStats(
    source: FeedSource,
    options: EnhancedIngestOptions & { dedupe?: boolean } = {}
  ): Promise<RSSIngestReport> {
    const { RSSAtomicAdapter } = await import("./atomicAdapter");
    const {
      dedupe = true,
      fetchFullText,
      snippetThreshold = 500,
      proxyUrl,
      ...fetchOptions
    } = options;
    const { fetchResult, items } = await this.fetchAndParse(source, {
      ...fetchOptions,
      proxyUrl,
    });

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

    if (fetchFullText) {
      await hydrateItemsWithFullText(
        items,
        snippetThreshold,
        fetchOptions.timeout ?? 15000,
        proxyUrl
      );
    }
    const dedupeResult = dedupe ? dedupeRssItems(items) : { items, duplicates: [] };
    const normalizeContext = { stage: "normalize", sourceUrl: source.url };
    logStage("normalize", "start", normalizeContext);
    const normalizeStart = Date.now();
    let mappedItems: IngestResult[];
    let metas: ReturnType<typeof RSSAtomicAdapter.toIngestionMetaBatch>;
    try {
      mappedItems = dedupeResult.items.map((item) => RSSMapper.mapItemToDoc(item, source));
      metas = RSSAtomicAdapter.toIngestionMetaBatch(dedupeResult.items, source);
    } catch (error) {
      logStage(
        "normalize",
        "failure",
        { ...normalizeContext, durationMs: Date.now() - normalizeStart },
        toError(error)
      );
      throw error;
    }
    logStage("normalize", "success", {
      ...normalizeContext,
      durationMs: Date.now() - normalizeStart,
      itemCount: mappedItems.length,
      dedupedCount: dedupeResult.items.length,
    });
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
