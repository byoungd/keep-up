/**
 * SQLite-backed FeedProvider Implementation
 *
 * Bridges the RSS tables (via DbDriver) with the RssPollingScheduler.
 * Works with the worker-based SQLite driver.
 */

import type { RetryOptions } from "@ku0/ingest-rss";
import type { DbDriver, FeedItemRow } from "../driver/types";
import type { FeedProvider, RssFeedSubscription, RssItemInfo } from "./RssPollingScheduler";

/** Default poll interval: 15 minutes */
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Configuration for the SqliteFeedProvider
 */
export interface SqliteFeedProviderConfig {
  /** Database driver instance */
  db: DbDriver;
  /** Proxy URL for fetching RSS feeds (CORS bypass) */
  proxyUrl?: string;
  /** Default poll interval in milliseconds */
  defaultPollIntervalMs?: number;
  /** Timeout for feed fetches in milliseconds */
  fetchTimeoutMs?: number;
  /** Retry policy for feed fetches */
  fetchRetryOptions?: RetryOptions;
}

/**
 * Generate a unique ID for feed items.
 */
function generateItemId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * FeedProvider implementation using SQLite-based RSS storage via DbDriver.
 *
 * This provider:
 * - Reads subscriptions from SQLite via DbDriver.listRssSubscriptions()
 * - Fetches RSS feeds using the ingest-rss package
 * - Tracks imported items via feed_items.document_id
 */
export class SqliteFeedProvider implements FeedProvider {
  private db: DbDriver;
  private proxyUrl?: string;
  private defaultPollIntervalMs: number;
  private fetchTimeoutMs: number;
  private fetchRetryOptions?: RetryOptions;

  constructor(config: SqliteFeedProviderConfig) {
    this.db = config.db;
    this.proxyUrl = config.proxyUrl;
    this.defaultPollIntervalMs = config.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? 30000;
    this.fetchRetryOptions = config.fetchRetryOptions;
  }

  /**
   * Get all enabled RSS subscriptions.
   */
  async getSubscriptions(): Promise<RssFeedSubscription[]> {
    const subscriptions = await this.db.listRssSubscriptions({ enabled: true });

    return subscriptions.map((sub) => ({
      feedId: sub.subscriptionId,
      feedUrl: sub.url,
      pollIntervalMs: this.defaultPollIntervalMs,
      lastPollAt: sub.lastFetchedAt,
    }));
  }

  /**
   * Fetch and parse items from a feed URL.
   * Uses the RSSIngestor from @ku0/ingest-rss.
   */
  async fetchFeedItems(feedUrl: string): Promise<RssItemInfo[]> {
    // Dynamically import to avoid bundling issues in non-worker contexts
    const { RSSIngestor } = await import("@ku0/ingest-rss");

    const ingestor = new RSSIngestor();
    const result = await ingestor.fetchFeedItems(
      { url: feedUrl },
      {
        timeout: this.fetchTimeoutMs,
        proxyUrl: this.proxyUrl,
        retry: this.fetchRetryOptions,
      }
    );

    // If not modified (304), return empty - no new items
    if (!result.modified) {
      return [];
    }

    return result.items.map((item) => ({
      guid: item.guid || item.link || `${feedUrl}-${Date.now()}`,
      title: item.title || "Untitled",
      link: item.link || feedUrl,
      pubDate: item.pubDate ? new Date(item.pubDate).getTime() : null,
    }));
  }

  /**
   * Mark a feed as polled (update lastFetchedAt).
   */
  async markPolled(feedId: string): Promise<void> {
    await this.db.updateRssSubscription(feedId, {
      lastFetchedAt: Date.now(),
      status: "ok",
      errorMessage: null,
    });
  }

  /**
   * Check if an item has already been imported.
   * An item is considered imported if it has a documentId.
   */
  async isItemImported(feedId: string, itemGuid: string): Promise<boolean> {
    const item = await this.db.getFeedItemByGuid(feedId, itemGuid);
    if (!item) {
      return false;
    }
    // Item exists and has a documentId = already imported
    return item.documentId !== null;
  }

  /**
   * Mark an item as imported by storing the job ID reference.
   * Creates the FeedItem if it doesn't exist, then updates documentId.
   */
  async markItemImported(feedId: string, itemGuid: string, jobId: string): Promise<void> {
    const existingItem = await this.db.getFeedItemByGuid(feedId, itemGuid);

    if (!existingItem) {
      // Create the feed item if it doesn't exist
      const newItem: Omit<FeedItemRow, "createdAt" | "updatedAt"> = {
        itemId: generateItemId(),
        subscriptionId: feedId,
        guid: itemGuid,
        title: null,
        link: null,
        author: null,
        publishedAt: null,
        contentHtml: null,
        excerpt: null,
        readState: "unread",
        saved: false,
        documentId: `pending:${jobId}`,
      };
      await this.db.createFeedItem(newItem);
    } else {
      // Update with the import job reference
      // We use jobId as a temporary documentId marker until the job completes
      await this.db.updateFeedItem(existingItem.itemId, {
        documentId: `pending:${jobId}`,
      });
    }
  }

  /**
   * Update an item's documentId after import completes.
   * Call this when the import job finishes successfully.
   */
  async updateItemDocument(feedId: string, itemGuid: string, documentId: string): Promise<void> {
    const item = await this.db.getFeedItemByGuid(feedId, itemGuid);
    if (item) {
      await this.db.updateFeedItem(item.itemId, { documentId });
    }
  }

  /**
   * Mark a feed as errored.
   */
  async markFeedError(feedId: string, errorMessage: string): Promise<void> {
    await this.db.updateRssSubscription(feedId, {
      status: "error",
      errorMessage,
      lastFetchedAt: Date.now(),
    });
  }
}

/**
 * Create a SqliteFeedProvider instance.
 */
export function createSqliteFeedProvider(config: SqliteFeedProviderConfig): SqliteFeedProvider {
  return new SqliteFeedProvider(config);
}
