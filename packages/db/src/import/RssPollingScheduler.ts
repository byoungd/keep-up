/**
 * RSS Polling Scheduler
 *
 * Background scheduler for automatically refreshing RSS feeds.
 * Uses the ImportManager to process new RSS items.
 */

import type { DbDriver } from "../driver/types";
import type { ImportManager } from "./ImportManager";
import { createRssSourceRef } from "./ingestors/rssIngestor";

/**
 * RSS Feed subscription info from external source.
 */
export interface RssFeedSubscription {
  feedId: string;
  feedUrl: string;
  pollIntervalMs: number;
  lastPollAt: number | null;
}

/**
 * RSS item from a feed.
 */
export interface RssItemInfo {
  guid: string;
  title: string;
  link: string;
  pubDate: number | null;
}

/**
 * FeedProvider interface - abstraction for accessing feed subscriptions.
 * This allows the scheduler to work with different feed storage implementations.
 */
export interface FeedProvider {
  /** Get all subscribed feeds */
  getSubscriptions(): Promise<RssFeedSubscription[]>;
  /** Get new items from a feed URL (fetches and parses the feed) */
  fetchFeedItems(feedUrl: string): Promise<RssItemInfo[]>;
  /** Mark a feed as polled */
  markPolled(feedId: string): Promise<void>;
  /** Check if an item has already been imported */
  isItemImported(feedId: string, itemGuid: string): Promise<boolean>;
  /** Mark an item as imported */
  markItemImported(feedId: string, itemGuid: string, jobId: string): Promise<void>;
}

/**
 * Configuration for the RSS polling scheduler.
 */
export interface RssPollingSchedulerConfig {
  /** Database driver */
  db: DbDriver;
  /** Import manager instance */
  importManager: ImportManager;
  /** Feed provider for accessing subscriptions */
  feedProvider: FeedProvider;
  /** Minimum interval between poll cycles (default: 60000ms) */
  minPollIntervalMs?: number;
  /** Maximum concurrent feed fetches (default: 3) */
  maxConcurrentFeeds?: number;
}

/**
 * RSS Polling Scheduler
 *
 * Periodically checks RSS feeds for new items and enqueues them for import.
 */
export class RssPollingScheduler {
  private db: DbDriver;
  private importManager: ImportManager;
  private feedProvider: FeedProvider;
  private minPollIntervalMs: number;
  private maxConcurrentFeeds: number;

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isPaused = false;

  constructor(config: RssPollingSchedulerConfig) {
    this.db = config.db;
    this.importManager = config.importManager;
    this.feedProvider = config.feedProvider;
    this.minPollIntervalMs = config.minPollIntervalMs ?? 60000;
    this.maxConcurrentFeeds = config.maxConcurrentFeeds ?? 3;
  }

  /**
   * Start the polling scheduler.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.isPaused = false;
    this.schedulePollCycle();
  }

  /**
   * Stop the polling scheduler.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Pause the scheduler (keeps state but doesn't poll).
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume the scheduler.
   */
  resume(): void {
    if (this.isPaused && this.isRunning) {
      this.isPaused = false;
      this.schedulePollCycle();
    }
  }

  /**
   * Force a poll cycle immediately.
   */
  async pollNow(): Promise<number> {
    return this.runPollCycle();
  }

  /**
   * Schedule the next poll cycle.
   */
  private schedulePollCycle(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      await this.runPollCycle();
      this.schedulePollCycle();
    }, this.minPollIntervalMs);
  }

  /**
   * Run a poll cycle: check feeds due for refresh and process new items.
   * @returns Number of new items enqueued
   */
  private async runPollCycle(): Promise<number> {
    if (!this.isRunning || this.isPaused) {
      return 0;
    }

    const subscriptions = await this.feedProvider.getSubscriptions();
    const now = Date.now();

    // Find feeds due for polling
    const dueFeeds = subscriptions.filter((feed) => {
      if (!feed.lastPollAt) {
        return true;
      }
      return now - feed.lastPollAt >= feed.pollIntervalMs;
    });

    if (dueFeeds.length === 0) {
      return 0;
    }

    // Process feeds in batches
    let totalEnqueued = 0;
    for (let i = 0; i < dueFeeds.length; i += this.maxConcurrentFeeds) {
      const batch = dueFeeds.slice(i, i + this.maxConcurrentFeeds);
      const results = await Promise.allSettled(batch.map((feed) => this.pollFeed(feed)));

      for (const result of results) {
        if (result.status === "fulfilled") {
          totalEnqueued += result.value;
        } else {
          console.warn("[RssPollingScheduler] Feed poll failed:", result.reason);
        }
      }
    }

    return totalEnqueued;
  }

  /**
   * Poll a single feed for new items.
   * @returns Number of new items enqueued
   */
  private async pollFeed(feed: RssFeedSubscription): Promise<number> {
    try {
      const items = await this.feedProvider.fetchFeedItems(feed.feedUrl);
      let enqueued = 0;

      for (const item of items) {
        // Check if already imported
        const isImported = await this.feedProvider.isItemImported(feed.feedId, item.guid);
        if (isImported) {
          continue;
        }

        // Create sourceRef for the RSS item
        const sourceRef = createRssSourceRef(item.guid, feed.feedId, item.link);

        // Enqueue for import
        const jobId = await this.importManager.enqueue({
          sourceType: "rss",
          sourceRef,
        });

        // Mark as imported
        await this.feedProvider.markItemImported(feed.feedId, item.guid, jobId);
        enqueued++;
      }

      // Mark feed as polled
      await this.feedProvider.markPolled(feed.feedId);

      return enqueued;
    } catch (err) {
      console.error(`[RssPollingScheduler] Failed to poll feed ${feed.feedId}:`, err);
      throw err;
    }
  }
}

/**
 * Create an RSS polling scheduler instance.
 */
export function createRssPollingScheduler(config: RssPollingSchedulerConfig): RssPollingScheduler {
  return new RssPollingScheduler(config);
}
