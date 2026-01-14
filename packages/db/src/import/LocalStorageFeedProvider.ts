/**
 * LocalStorage-based FeedProvider Implementation
 *
 * Bridges the RSS repository (localStorage) with the RssPollingScheduler.
 * Provides feed subscription data and tracks imported items.
 */

import type { RetryOptions } from "@packages/ingest-rss";
import {
  createFeedItem,
  getFeedItemByGuid,
  getSubscriptionById,
  listSubscriptions,
  updateFeedItem,
  updateSubscription,
} from "../rss/repository";
import type { FeedProvider, RssFeedSubscription, RssItemInfo } from "./RssPollingScheduler";

/** Default poll interval: 15 minutes */
const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Configuration for the LocalStorageFeedProvider
 */
export interface LocalStorageFeedProviderConfig {
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
 * FeedProvider implementation using localStorage-based RSS repository.
 *
 * This provider:
 * - Reads subscriptions from localStorage via the RSS repository
 * - Fetches RSS feeds using the ingest-rss package
 * - Tracks imported items via FeedItem.documentId
 */
export class LocalStorageFeedProvider implements FeedProvider {
  private proxyUrl?: string;
  private defaultPollIntervalMs: number;
  private fetchTimeoutMs: number;
  private fetchRetryOptions?: RetryOptions;

  constructor(config: LocalStorageFeedProviderConfig = {}) {
    this.proxyUrl = config.proxyUrl;
    this.defaultPollIntervalMs = config.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? 30000;
    this.fetchRetryOptions = config.fetchRetryOptions;
  }

  /**
   * Get all enabled RSS subscriptions.
   */
  async getSubscriptions(): Promise<RssFeedSubscription[]> {
    const subscriptions = listSubscriptions({ enabled: true });

    return subscriptions.map((sub) => ({
      feedId: sub.subscriptionId,
      feedUrl: sub.url,
      pollIntervalMs: this.defaultPollIntervalMs,
      lastPollAt: sub.lastFetchedAt,
    }));
  }

  /**
   * Fetch and parse items from a feed URL.
   * Uses the RSSIngestor from @packages/ingest-rss.
   */
  async fetchFeedItems(feedUrl: string): Promise<RssItemInfo[]> {
    // Dynamically import to avoid bundling issues in non-worker contexts
    const { RSSIngestor } = await import("@packages/ingest-rss");

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
    updateSubscription(feedId, {
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
    const item = getFeedItemByGuid(feedId, itemGuid);
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
    let item = getFeedItemByGuid(feedId, itemGuid);

    if (!item) {
      // Create the feed item if it doesn't exist
      item = createFeedItem({
        subscriptionId: feedId,
        guid: itemGuid,
        title: undefined,
        link: undefined,
      });
    }

    // Update with the import job reference
    // We use jobId as a temporary documentId marker until the job completes
    updateFeedItem(item.itemId, {
      documentId: `pending:${jobId}`,
    });
  }

  /**
   * Update an item's documentId after import completes.
   * Call this when the import job finishes successfully.
   */
  async updateItemDocument(feedId: string, itemGuid: string, documentId: string): Promise<void> {
    const item = getFeedItemByGuid(feedId, itemGuid);
    if (item) {
      updateFeedItem(item.itemId, { documentId });
    }
  }

  /**
   * Mark a feed as errored.
   */
  async markFeedError(feedId: string, errorMessage: string): Promise<void> {
    const sub = getSubscriptionById(feedId);
    if (sub) {
      updateSubscription(feedId, {
        status: "error",
        errorMessage,
        lastFetchedAt: Date.now(),
      });
    }
  }
}

/**
 * Create a LocalStorageFeedProvider instance.
 */
export function createLocalStorageFeedProvider(
  config?: LocalStorageFeedProviderConfig
): LocalStorageFeedProvider {
  return new LocalStorageFeedProvider(config);
}
