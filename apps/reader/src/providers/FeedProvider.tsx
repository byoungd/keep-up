"use client";

import { getDbClient } from "@/lib/db";
import type {
  FeedItemRow,
  ListFeedItemsOptions,
  RssFolder,
  RssSubscriptionRow,
  TopicRow,
  UpdateRssFolderInput,
  UpdateRssSubscriptionInput,
} from "@ku0/db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

// ============================================================================
// Types
// ============================================================================

export type FeedStatus = "ok" | "error" | "pending";

export interface FeedSubscription extends RssSubscriptionRow {
  unreadCount?: number;
}

export interface FeedContextValue {
  // Data
  subscriptions: FeedSubscription[];
  items: FeedItemRow[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  addFeed: (url: string) => Promise<void>;
  removeFeed: (subscriptionId: string) => Promise<void>;
  updateFeed: (subscriptionId: string, updates: UpdateRssSubscriptionInput) => Promise<void>;
  refreshFeed: (subscriptionId: string) => Promise<void>;
  refreshAllFeeds: () => Promise<void>;
  markAsRead: (itemId: string) => Promise<void>;
  markAsUnread: (itemId: string) => Promise<void>;
  markAllAsRead: (subscriptionId: string) => Promise<void>;
  toggleSaved: (itemId: string, currentSaved: boolean) => Promise<void>;

  // Folders
  folders: RssFolder[];
  createFolder: (name: string) => Promise<void>;
  updateFolder: (id: string, updates: UpdateRssFolderInput) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  // Topic Actions
  topics: TopicRow[];
  createTopic: (name: string, color?: string) => Promise<void>;
  updateTopic: (
    topicId: string,
    updates: Partial<Pick<TopicRow, "name" | "color">>
  ) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  addFeedToTopic: (subscriptionId: string, topicId: string) => Promise<void>;
  removeFeedFromTopic: (subscriptionId: string, topicId: string) => Promise<void>;
}

const FeedContext = React.createContext<FeedContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // 1. Fetch Subscriptions
  const {
    data: subscriptions = [],
    isLoading: isLoadingSubs,
    error: subsError,
  } = useQuery({
    queryKey: ["feeds", "subscriptions"],
    queryFn: async () => {
      const db = await getDbClient();
      const subs = await db.listRssSubscriptions();

      // Enhance with unread counts
      const enhanced = await Promise.all(
        subs.map(async (sub) => {
          const count = await db.countUnreadFeedItems(sub.subscriptionId);
          return { ...sub, unreadCount: count };
        })
      );

      return enhanced.sort((a, b) => (b.lastFetchedAt || 0) - (a.lastFetchedAt || 0));
    },
    // Refresh every minute to reflect background polling
    refetchInterval: 60 * 1000,
  });

  // 1a. Fetch Items (full list for counts/navigation)
  const {
    data: items = [],
    isLoading: isLoadingItems,
    error: itemsError,
  } = useQuery({
    queryKey: ["feed-items", "all", "full"],
    queryFn: async () => {
      const db = await getDbClient();
      return db.listFeedItems();
    },
    staleTime: 30 * 1000,
  });

  // 1b. Fetch Topics
  const { data: topics = [] } = useQuery({
    queryKey: ["feeds", "topics"],
    queryFn: async () => {
      const db = await getDbClient();
      return db.listTopics();
    },
  });

  // 1c. Fetch Folders
  const { data: folders = [] } = useQuery({
    queryKey: ["feeds", "folders"],
    queryFn: async () => {
      // const db = await getDbClient();
      // return db.listRssFolders();
      return []; // Stub
    },
    staleTime: 60 * 1000,
  });

  // 2. Add Feed Mutation
  const addFeedMutation = useMutation({
    mutationFn: async (url: string) => {
      // Validate URL first
      try {
        new URL(url);
      } catch {
        throw new Error("Invalid URL");
      }

      const db = await getDbClient();

      // Check for duplicates
      const existing = await db.getRssSubscriptionByUrl(url);
      if (existing) {
        throw new Error("Feed already exists");
      }

      // Initial Fetch to get Title (using the scheduler's provider if available, or fetch direct)
      // Since Scheduler/Provider might be in worker, we use a simpler fetch for title metadata if needed
      // But DbDriver.createRssSubscription is manual.
      // We can trigger an immediate poll after creation.

      const newId = crypto.randomUUID();
      await db.createRssSubscription({
        subscriptionId: newId,
        url,
        title: url, // Temporary, will update after poll
        displayName: null,
        siteUrl: null,
        folderId: null,
        enabled: true,
        status: "ok",
        errorMessage: null,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
      });

      // Trigger poll immediately if scheduler is running
      // Note: pollFeed is private, so we rely on background polling or separate trigger if available.
      // const scheduler = getRssScheduler();
      // if (scheduler) {
      //   const sub = await db.getRssSubscription(newId);
      //   if (sub) {
      //      // scheduler.pollFeed(sub);
      //   }
      // }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  // 3. Remove Feed Mutation
  const removeFeedMutation = useMutation({
    mutationFn: async (id: string) => {
      const db = await getDbClient();
      await db.deleteRssSubscription(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  // 3b. Update Feed Mutation
  const updateFeedMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateRssSubscriptionInput }) => {
      const db = await getDbClient();
      await db.updateRssSubscription(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  const refreshAllFeeds = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["feeds"] }),
      queryClient.invalidateQueries({ queryKey: ["feed-items"] }),
    ]);
  }, [queryClient]);

  // 5. Mark as Read
  const markReadMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const db = await getDbClient();
      await db.updateFeedItem(itemId, { readState: "read" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  const markUnreadMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const db = await getDbClient();
      await db.updateFeedItem(itemId, { readState: "unread" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  // 6. Mark All as Read
  const markAllReadMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      const db = await getDbClient();
      // Batch update is efficient
      const items = await db.listFeedItems({ subscriptionId, readState: "unread" });

      await db.batch(
        items.map((item) => () => db.updateFeedItem(item.itemId, { readState: "read" }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
      queryClient.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  // 7. Toggle Saved
  const toggleSavedMutation = useMutation({
    mutationFn: async ({ itemId, currentSaved }: { itemId: string; currentSaved: boolean }) => {
      const db = await getDbClient();
      await db.updateFeedItem(itemId, { saved: !currentSaved });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed-items"] });
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  // 7b. Folder Mutations
  const createFolderMutation = useMutation({
    mutationFn: async (_name: string) => {
      // Stub
      // const db = await getDbClient();
      // await db.createRssFolder({ name });
      console.warn("Folder creation not implemented yet in new DB");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "folders"] });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({
      id: _id,
      updates: _updates,
    }: { id: string; updates: UpdateRssFolderInput }) => {
      // Stub
      // const db = await getDbClient();
      // await db.updateRssFolder(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "folders"] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (_id: string) => {
      // Stub
      // const db = await getDbClient();
      // await db.deleteRssFolder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "folders"] });
      queryClient.invalidateQueries({ queryKey: ["feeds", "subscriptions"] });
    },
  });

  // 8. Topic Mutations
  const createTopicMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) => {
      const db = await getDbClient();
      await db.createTopic({
        topicId: crypto.randomUUID(),
        name,
        color: color ?? null,
        description: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "topics"] });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TopicRow> }) => {
      const db = await getDbClient();
      await db.updateTopic(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "topics"] });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      const db = await getDbClient();
      await db.deleteTopic(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds", "topics"] });
    },
  });

  const addFeedToTopicMutation = useMutation({
    mutationFn: async ({ subId, topicId }: { subId: string; topicId: string }) => {
      const db = await getDbClient();
      await db.addSubscriptionToTopic(subId, topicId);
    },
    onSuccess: () => {
      // Invalidate both subscriptions (views might change) and topics
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  const removeFeedFromTopicMutation = useMutation({
    mutationFn: async ({ subId, topicId }: { subId: string; topicId: string }) => {
      const db = await getDbClient();
      await db.removeSubscriptionFromTopic(subId, topicId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feeds"] });
    },
  });

  const value: FeedContextValue = {
    subscriptions,
    items,
    isLoading: isLoadingSubs || isLoadingItems,
    error: (subsError ?? itemsError ?? null) as Error | null,
    addFeed: async (url) => addFeedMutation.mutateAsync(url),
    removeFeed: async (id) => removeFeedMutation.mutateAsync(id),
    updateFeed: async (id, updates) => updateFeedMutation.mutateAsync({ id, updates }),
    refreshFeed: async (_id) => refreshAllFeeds(),
    refreshAllFeeds,
    markAsRead: async (id) => markReadMutation.mutateAsync(id),
    markAsUnread: async (id) => markUnreadMutation.mutateAsync(id),
    markAllAsRead: async (subId) => markAllReadMutation.mutateAsync(subId),
    toggleSaved: async (id, saved) =>
      toggleSavedMutation.mutateAsync({ itemId: id, currentSaved: saved }),

    // Folders
    folders,
    createFolder: async (name) => createFolderMutation.mutateAsync(name),
    updateFolder: async (id, updates) => updateFolderMutation.mutateAsync({ id, updates }),
    deleteFolder: async (id) => deleteFolderMutation.mutateAsync(id),

    // Topics
    topics,
    createTopic: async (name, color) => createTopicMutation.mutateAsync({ name, color }),
    updateTopic: async (id, updates) => updateTopicMutation.mutateAsync({ id, updates }),
    deleteTopic: async (id) => deleteTopicMutation.mutateAsync(id),
    addFeedToTopic: async (subId, topicId) =>
      addFeedToTopicMutation.mutateAsync({ subId, topicId }),
    removeFeedFromTopic: async (subId, topicId) =>
      removeFeedFromTopicMutation.mutateAsync({ subId, topicId }),
  };

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeedProvider() {
  const context = React.useContext(FeedContext);
  if (!context) {
    throw new Error("useFeedProvider must be used within FeedProvider");
  }
  return context;
}

export function useFeedItems(filter = "all", options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["feed-items", filter],
    queryFn: async () => {
      const db = await getDbClient();
      const dbOptions: ListFeedItemsOptions = { limit: 50 }; // Default limit

      if (filter === "unread") {
        dbOptions.readState = "unread";
      } else if (filter === "saved") {
        dbOptions.saved = true;
      } else if (filter !== "all") {
        if (filter.startsWith("topic:")) {
          dbOptions.topicId = filter.replace("topic:", "");
        } else {
          dbOptions.subscriptionId = filter;
        }
      }

      return db.listFeedItems(dbOptions);
    },
    // Refresh often or listen to invalidation
    staleTime: 1000 * 30,
    enabled: options.enabled,
  });
}
