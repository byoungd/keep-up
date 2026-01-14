"use client";

/**
 * useRssFeeds - Hook to manage RSS subscriptions and feed items using DbClient.
 * Replaces localStorage-based useRssStore with SQLite/IndexedDB persistence.
 */

import type { FeedItemRow, ListFeedItemsOptions, RssSubscriptionRow } from "@ku0/db";
import { useCallback, useEffect, useState } from "react";
import { getDbClient } from "../lib/db";

export interface UseRssFeedsOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

export interface RssFeedsState {
  subscriptions: RssSubscriptionRow[];
  items: FeedItemRow[];
  unreadCount: number;
  isLoading: boolean;
  isHydrated: boolean;
  error: Error | null;
}

export interface RssFeedsActions {
  /** Add a new RSS subscription */
  addSubscription: (url: string, title?: string) => Promise<string>;
  /** Remove a subscription and its items */
  removeSubscription: (subscriptionId: string) => Promise<void>;
  /** Update subscription settings */
  updateSubscription: (
    subscriptionId: string,
    updates: { displayName?: string; enabled?: boolean; folderId?: string | null }
  ) => Promise<void>;
  /** Mark a feed item as read */
  markAsRead: (itemId: string) => Promise<void>;
  /** Mark a feed item as unread */
  markAsUnread: (itemId: string) => Promise<void>;
  /** Toggle saved state of a feed item */
  toggleSaved: (itemId: string) => Promise<void>;
  /** Refresh subscriptions and items from database */
  refresh: () => Promise<void>;
  /** List feed items with filters */
  listItems: (options?: ListFeedItemsOptions) => Promise<FeedItemRow[]>;
}

export type UseRssFeedsReturn = RssFeedsState & RssFeedsActions;

export function useRssFeeds(options?: UseRssFeedsOptions): UseRssFeedsReturn {
  const autoFetch = options?.autoFetch ?? true;

  const [subscriptions, setSubscriptions] = useState<RssSubscriptionRow[]>([]);
  const [items, setItems] = useState<FeedItemRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch all subscriptions and recent items
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const client = await getDbClient();

      const [subs, feedItems, count] = await Promise.all([
        client.listRssSubscriptions(),
        client.listFeedItems({ limit: 100 }),
        client.countUnreadFeedItems(),
      ]);

      setSubscriptions(subs);
      setItems(feedItems);
      setUnreadCount(count);
      setIsHydrated(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add a new subscription
  const addSubscription = useCallback(
    async (url: string, title?: string): Promise<string> => {
      const client = await getDbClient();

      // Check for duplicate
      const existing = await client.getRssSubscriptionByUrl(url);
      if (existing) {
        throw new Error("Subscription already exists");
      }

      const subscriptionId = crypto.randomUUID();
      await client.createRssSubscription({
        subscriptionId,
        url,
        title: title ?? null,
        displayName: null,
        siteUrl: null,
        folderId: null,
        enabled: true,
        lastFetchedAt: null,
        status: "ok",
        errorMessage: null,
        etag: null,
        lastModified: null,
      });

      await refresh();
      return subscriptionId;
    },
    [refresh]
  );

  // Remove a subscription
  const removeSubscription = useCallback(
    async (subscriptionId: string): Promise<void> => {
      const client = await getDbClient();
      await client.deleteRssSubscription(subscriptionId);
      await refresh();
    },
    [refresh]
  );

  // Update subscription
  const updateSubscription = useCallback(
    async (
      subscriptionId: string,
      updates: { displayName?: string; enabled?: boolean; folderId?: string | null }
    ): Promise<void> => {
      const client = await getDbClient();
      await client.updateRssSubscription(subscriptionId, updates);
      await refresh();
    },
    [refresh]
  );

  // Mark item as read
  const markAsRead = useCallback(async (itemId: string): Promise<void> => {
    const client = await getDbClient();
    await client.updateFeedItem(itemId, { readState: "read" });

    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, readState: "read" as const } : item))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark item as unread
  const markAsUnread = useCallback(async (itemId: string): Promise<void> => {
    const client = await getDbClient();
    await client.updateFeedItem(itemId, { readState: "unread" });

    setItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, readState: "unread" as const } : item
      )
    );
    setUnreadCount((prev) => prev + 1);
  }, []);

  // Toggle saved
  const toggleSaved = useCallback(
    async (itemId: string): Promise<void> => {
      const item = items.find((i) => i.itemId === itemId);
      if (!item) {
        return;
      }

      const client = await getDbClient();
      await client.updateFeedItem(itemId, { saved: !item.saved });

      setItems((prev) => prev.map((i) => (i.itemId === itemId ? { ...i, saved: !i.saved } : i)));
    },
    [items]
  );

  // List items with filters
  const listItems = useCallback(
    async (filterOptions?: ListFeedItemsOptions): Promise<FeedItemRow[]> => {
      const client = await getDbClient();
      return client.listFeedItems(filterOptions);
    },
    []
  );

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      refresh();
    }
  }, [autoFetch, refresh]);

  return {
    subscriptions,
    items,
    unreadCount,
    isLoading,
    isHydrated,
    error,
    addSubscription,
    removeSubscription,
    updateSubscription,
    markAsRead,
    markAsUnread,
    toggleSaved,
    refresh,
    listItems,
  };
}
