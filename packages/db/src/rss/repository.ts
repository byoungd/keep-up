/**
 * RSS Repository
 * CRUD operations for RSS subscriptions, folders, and feed items.
 *
 * Note: This uses browser localStorage as a simple persistence layer
 * since the main DbDriver is focused on document/CRDT operations.
 * Future: Migrate to full DbDriver integration when RSS driver methods are added.
 */

import type {
  CreateFeedItemInput,
  CreateRssFolderInput,
  CreateRssSubscriptionInput,
  FeedItem,
  FeedItemsFilter,
  RssFolder,
  RssSubscription,
  RssSubscriptionsFilter,
  UpdateFeedItemInput,
  UpdateRssFolderInput,
  UpdateRssSubscriptionInput,
} from "./types";

const STORAGE_KEY_FOLDERS = "rss_folders";
const STORAGE_KEY_SUBSCRIPTIONS = "rss_subscriptions";
const STORAGE_KEY_ITEMS = "feed_items";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getStorage<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setStorage<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

// ============ RSS Folders ============

export function createFolder(input: CreateRssFolderInput): RssFolder {
  const now = Date.now();
  const folder: RssFolder = {
    folderId: generateId(),
    name: input.name,
    orderIndex: input.orderIndex ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  const folders = getStorage<RssFolder>(STORAGE_KEY_FOLDERS);
  folders.push(folder);
  setStorage(STORAGE_KEY_FOLDERS, folders);

  return folder;
}

export function listFolders(): RssFolder[] {
  return getStorage<RssFolder>(STORAGE_KEY_FOLDERS).sort(
    (a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt
  );
}

export function updateFolder(folderId: string, input: UpdateRssFolderInput): void {
  const folders = getStorage<RssFolder>(STORAGE_KEY_FOLDERS);
  const index = folders.findIndex((f) => f.folderId === folderId);

  if (index === -1) {
    return;
  }

  if (input.name !== undefined) {
    folders[index].name = input.name;
  }
  if (input.orderIndex !== undefined) {
    folders[index].orderIndex = input.orderIndex;
  }
  folders[index].updatedAt = Date.now();

  setStorage(STORAGE_KEY_FOLDERS, folders);
}

export function deleteFolder(folderId: string): void {
  const folders = getStorage<RssFolder>(STORAGE_KEY_FOLDERS);
  setStorage(
    STORAGE_KEY_FOLDERS,
    folders.filter((f) => f.folderId !== folderId)
  );

  // Clear folder reference from subscriptions
  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);
  for (const s of subs) {
    if (s.folderId === folderId) {
      s.folderId = null;
    }
  }
  setStorage(STORAGE_KEY_SUBSCRIPTIONS, subs);
}

// ============ RSS Subscriptions ============

export function createSubscription(input: CreateRssSubscriptionInput): RssSubscription {
  const now = Date.now();
  const subscription: RssSubscription = {
    subscriptionId: generateId(),
    url: input.url,
    title: input.title ?? null,
    displayName: input.displayName ?? null,
    siteUrl: input.siteUrl ?? null,
    folderId: input.folderId ?? null,
    enabled: true,
    lastFetchedAt: null,
    status: "ok",
    errorMessage: null,
    etag: null,
    lastModified: null,
    createdAt: now,
    updatedAt: now,
  };

  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);

  // Check for duplicate URL
  if (subs.some((s) => s.url === input.url)) {
    throw new Error("Subscription with this URL already exists");
  }

  subs.push(subscription);
  setStorage(STORAGE_KEY_SUBSCRIPTIONS, subs);

  return subscription;
}

export function getSubscriptionByUrl(url: string): RssSubscription | null {
  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);
  return subs.find((s) => s.url === url) ?? null;
}

export function getSubscriptionById(subscriptionId: string): RssSubscription | null {
  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);
  return subs.find((s) => s.subscriptionId === subscriptionId) ?? null;
}

export function listSubscriptions(filter?: RssSubscriptionsFilter): RssSubscription[] {
  let subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);

  if (filter?.folderId !== undefined) {
    subs = subs.filter((s) => s.folderId === filter.folderId);
  }
  if (filter?.enabled !== undefined) {
    subs = subs.filter((s) => s.enabled === filter.enabled);
  }
  if (filter?.status !== undefined) {
    subs = subs.filter((s) => s.status === filter.status);
  }

  return subs.sort((a, b) => b.createdAt - a.createdAt);
}

export function updateSubscription(
  subscriptionId: string,
  input: UpdateRssSubscriptionInput
): void {
  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);
  const index = subs.findIndex((s) => s.subscriptionId === subscriptionId);

  if (index === -1) {
    return;
  }

  const sub = subs[index];

  if (input.displayName !== undefined) {
    sub.displayName = input.displayName;
  }
  if (input.folderId !== undefined) {
    sub.folderId = input.folderId;
  }
  if (input.enabled !== undefined) {
    sub.enabled = input.enabled;
  }
  if (input.title !== undefined) {
    sub.title = input.title;
  }
  if (input.siteUrl !== undefined) {
    sub.siteUrl = input.siteUrl;
  }
  if (input.lastFetchedAt !== undefined) {
    sub.lastFetchedAt = input.lastFetchedAt;
  }
  if (input.status !== undefined) {
    sub.status = input.status;
  }
  if (input.errorMessage !== undefined) {
    sub.errorMessage = input.errorMessage;
  }
  if (input.etag !== undefined) {
    sub.etag = input.etag;
  }
  if (input.lastModified !== undefined) {
    sub.lastModified = input.lastModified;
  }

  sub.updatedAt = Date.now();
  setStorage(STORAGE_KEY_SUBSCRIPTIONS, subs);
}

export function deleteSubscription(subscriptionId: string): void {
  const subs = getStorage<RssSubscription>(STORAGE_KEY_SUBSCRIPTIONS);
  setStorage(
    STORAGE_KEY_SUBSCRIPTIONS,
    subs.filter((s) => s.subscriptionId !== subscriptionId)
  );

  // Delete associated feed items
  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  setStorage(
    STORAGE_KEY_ITEMS,
    items.filter((i) => i.subscriptionId !== subscriptionId)
  );
}

// ============ Feed Items ============

export function createFeedItem(input: CreateFeedItemInput): FeedItem {
  const now = Date.now();
  const item: FeedItem = {
    itemId: generateId(),
    subscriptionId: input.subscriptionId,
    guid: input.guid ?? null,
    title: input.title ?? null,
    link: input.link ?? null,
    author: input.author ?? null,
    publishedAt: input.publishedAt ?? null,
    contentHtml: input.contentHtml ?? null,
    excerpt: input.excerpt ?? null,
    readState: "unread",
    saved: false,
    documentId: null,
    createdAt: now,
    updatedAt: now,
  };

  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  items.push(item);
  setStorage(STORAGE_KEY_ITEMS, items);

  return item;
}

export function getFeedItemByGuid(subscriptionId: string, guid: string): FeedItem | null {
  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  return items.find((i) => i.subscriptionId === subscriptionId && i.guid === guid) ?? null;
}

export function listFeedItems(filter?: FeedItemsFilter): FeedItem[] {
  let items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);

  if (filter?.subscriptionId !== undefined) {
    items = items.filter((i) => i.subscriptionId === filter.subscriptionId);
  }
  if (filter?.folderId !== undefined) {
    const subs = listSubscriptions({ folderId: filter.folderId });
    const subIds = new Set(subs.map((s) => s.subscriptionId));
    items = items.filter((i) => subIds.has(i.subscriptionId));
  }
  if (filter?.readState !== undefined) {
    items = items.filter((i) => i.readState === filter.readState);
  }
  if (filter?.saved !== undefined) {
    items = items.filter((i) => i.saved === filter.saved);
  }

  // Sort by published date descending
  items.sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));

  // Apply pagination
  if (filter?.offset) {
    items = items.slice(filter.offset);
  }
  if (filter?.limit) {
    items = items.slice(0, filter.limit);
  }

  return items;
}

export function updateFeedItem(itemId: string, input: UpdateFeedItemInput): void {
  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  const index = items.findIndex((i) => i.itemId === itemId);

  if (index === -1) {
    return;
  }

  const item = items[index];

  if (input.readState !== undefined) {
    item.readState = input.readState;
  }
  if (input.saved !== undefined) {
    item.saved = input.saved;
  }
  if (input.documentId !== undefined) {
    item.documentId = input.documentId;
  }
  if (input.contentHtml !== undefined) {
    item.contentHtml = input.contentHtml;
  }

  item.updatedAt = Date.now();
  setStorage(STORAGE_KEY_ITEMS, items);
}

export function markAllAsRead(subscriptionId?: string): number {
  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  let count = 0;

  for (const item of items) {
    if (item.readState === "unread") {
      if (!subscriptionId || item.subscriptionId === subscriptionId) {
        item.readState = "read";
        item.updatedAt = Date.now();
        count++;
      }
    }
  }

  setStorage(STORAGE_KEY_ITEMS, items);
  return count;
}

export function getUnreadCount(subscriptionId?: string): number {
  const items = getStorage<FeedItem>(STORAGE_KEY_ITEMS);
  return items.filter((i) => {
    if (i.readState !== "unread") {
      return false;
    }
    if (subscriptionId && i.subscriptionId !== subscriptionId) {
      return false;
    }
    return true;
  }).length;
}
