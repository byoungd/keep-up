"use client";

/**
 * RSS Store with Local Persistence
 *
 * Manages RSS subscriptions and feed items with localStorage persistence.
 * Uses a simple state management pattern without external dependencies.
 */

import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export interface RssSubscription {
  id: string;
  url: string;
  title: string;
  displayName?: string;
  siteUrl?: string;
  enabled: boolean;
  lastFetchedAt?: string;
  etag?: string;
  lastModified?: string;
  status: "ok" | "error" | "pending";
  errorMessage?: string;
  createdAt: string;
}

export interface RssFeedItem {
  id: string;
  subscriptionId: string;
  title: string;
  url: string;
  content: string;
  contentHtml?: string;
  publishedAt?: string;
  author?: string;
  guid?: string;
  readState: "unread" | "read";
  savedState: boolean;
  createdAt: string;
}

export interface RssState {
  subscriptions: RssSubscription[];
  items: RssFeedItem[];
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
}

// ============================================================================
// Storage Keys
// ============================================================================

const STORAGE_KEY_SUBSCRIPTIONS = "rss-subscriptions-v1";
const STORAGE_KEY_ITEMS = "rss-items-v1";

// ============================================================================
// Persistence Helpers
// ============================================================================

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn(`[RSS Store] Failed to save ${key} to localStorage`);
  }
}

// ============================================================================
// Store Hook
// ============================================================================

interface RssStoreActions {
  addSubscription: (url: string) => Promise<RssSubscription>;
  removeSubscription: (id: string) => void;
  updateSubscription: (id: string, updates: Partial<RssSubscription>) => void;
  syncFeed: (subscriptionId: string) => Promise<void>;
  syncAllFeeds: () => Promise<void>;
  markAsRead: (itemId: string) => void;
  markAsUnread: (itemId: string) => void;
  markAllAsRead: (subscriptionId?: string) => void;
  toggleSaved: (itemId: string) => void;
}

interface RssStore extends RssState, RssStoreActions {}

const RssStoreContext = React.createContext<RssStore | null>(null);

export function RssStoreProvider({ children }: { children: React.ReactNode }) {
  const [subscriptions, setSubscriptions] = React.useState<RssSubscription[]>([]);
  const [items, setItems] = React.useState<RssFeedItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  // Load from localStorage on mount
  React.useEffect(() => {
    setSubscriptions(loadFromStorage(STORAGE_KEY_SUBSCRIPTIONS, []));
    setItems(loadFromStorage(STORAGE_KEY_ITEMS, []));
    setHydrated(true);
  }, []);

  // Persist subscriptions
  React.useEffect(() => {
    if (hydrated) {
      saveToStorage(STORAGE_KEY_SUBSCRIPTIONS, subscriptions);
    }
  }, [subscriptions, hydrated]);

  // Persist items
  React.useEffect(() => {
    if (hydrated) {
      saveToStorage(STORAGE_KEY_ITEMS, items);
    }
  }, [items, hydrated]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const addSubscription = React.useCallback(async (url: string): Promise<RssSubscription> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rss/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch feed");
      }

      const subscription: RssSubscription = {
        id: crypto.randomUUID(),
        url,
        title: data.items?.[0]?.title ? extractDomain(url) : extractDomain(url),
        enabled: true,
        status: "ok",
        createdAt: new Date().toISOString(),
        lastFetchedAt: new Date().toISOString(),
        etag: data.etag,
        lastModified: data.lastModified,
      };

      // Add feed items
      const newItems: RssFeedItem[] = (data.items || []).map((item: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        subscriptionId: subscription.id,
        title: (item.title as string) || "Untitled",
        url: (item.url as string) || url,
        content: (item.content as string) || "",
        contentHtml: item.contentHtml as string,
        publishedAt: item.publishedAt as string,
        author: item.author as string,
        guid: item.guid as string,
        readState: "unread" as const,
        savedState: false,
        createdAt: new Date().toISOString(),
      }));

      setSubscriptions((prev) => [...prev, subscription]);
      setItems((prev) => [...prev, ...newItems]);
      setIsLoading(false);

      return subscription;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setIsLoading(false);
      throw err;
    }
  }, []);

  const removeSubscription = React.useCallback((id: string) => {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    // Optionally keep items: setItems((prev) => prev.filter((i) => i.subscriptionId !== id));
  }, []);

  const updateSubscription = React.useCallback((id: string, updates: Partial<RssSubscription>) => {
    setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const syncFeed = React.useCallback(
    async (subscriptionId: string) => {
      const sub = subscriptions.find((s) => s.id === subscriptionId);
      if (!sub || !sub.enabled) {
        return;
      }

      try {
        const response = await fetch("/api/rss/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: sub.url,
            etag: sub.etag,
            lastModified: sub.lastModified,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setSubscriptions((prev) =>
            prev.map((s) =>
              s.id === subscriptionId
                ? { ...s, status: "error" as const, errorMessage: data.error }
                : s
            )
          );
          return;
        }

        if (!data.modified) {
          // No new items
          setSubscriptions((prev) =>
            prev.map((s) =>
              s.id === subscriptionId
                ? { ...s, lastFetchedAt: new Date().toISOString(), status: "ok" as const }
                : s
            )
          );
          return;
        }

        // Dedupe and add new items
        const existingGuids = new Set(
          items.filter((i) => i.subscriptionId === subscriptionId).map((i) => i.guid)
        );
        const newItems: RssFeedItem[] = (data.items || [])
          .filter((item: Record<string, unknown>) => !existingGuids.has(item.guid as string))
          .map((item: Record<string, unknown>) => ({
            id: crypto.randomUUID(),
            subscriptionId,
            title: (item.title as string) || "Untitled",
            url: (item.url as string) || sub.url,
            content: (item.content as string) || "",
            contentHtml: item.contentHtml as string,
            publishedAt: item.publishedAt as string,
            author: item.author as string,
            guid: item.guid as string,
            readState: "unread" as const,
            savedState: false,
            createdAt: new Date().toISOString(),
          }));

        if (newItems.length > 0) {
          setItems((prev) => [...newItems, ...prev]);
        }

        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === subscriptionId
              ? {
                  ...s,
                  lastFetchedAt: new Date().toISOString(),
                  etag: data.etag,
                  lastModified: data.lastModified,
                  status: "ok" as const,
                  errorMessage: undefined,
                }
              : s
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        setSubscriptions((prev) =>
          prev.map((s) =>
            s.id === subscriptionId ? { ...s, status: "error" as const, errorMessage: message } : s
          )
        );
      }
    },
    [subscriptions, items]
  );

  const syncAllFeeds = React.useCallback(async () => {
    setIsLoading(true);
    await Promise.all(subscriptions.filter((s) => s.enabled).map((s) => syncFeed(s.id)));
    setIsLoading(false);
  }, [subscriptions, syncFeed]);

  const markAsRead = React.useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, readState: "read" as const } : i))
    );
  }, []);

  const markAsUnread = React.useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, readState: "unread" as const } : i))
    );
  }, []);

  const markAllAsRead = React.useCallback((subscriptionId?: string) => {
    setItems((prev) =>
      prev.map((i) =>
        subscriptionId === undefined || i.subscriptionId === subscriptionId
          ? { ...i, readState: "read" as const }
          : i
      )
    );
  }, []);

  const toggleSaved = React.useCallback((itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, savedState: !i.savedState } : i))
    );
  }, []);

  const store: RssStore = {
    subscriptions,
    items,
    isLoading,
    isHydrated: hydrated,
    error,
    addSubscription,
    removeSubscription,
    updateSubscription,
    syncFeed,
    syncAllFeeds,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    toggleSaved,
  };

  return <RssStoreContext.Provider value={store}>{children}</RssStoreContext.Provider>;
}

export function useRssStore(): RssStore {
  const context = React.useContext(RssStoreContext);
  if (!context) {
    throw new Error("useRssStore must be used within RssStoreProvider");
  }
  return context;
}

export function useRssStoreOptional(): RssStore | null {
  return React.useContext(RssStoreContext);
}

// ============================================================================
// Utility
// ============================================================================

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
