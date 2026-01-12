/**
 * RSS Data Types
 * TypeScript interfaces for RSS subscription management.
 */

// ============ RSS Folder ============

export interface RssFolder {
  folderId: string;
  name: string;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateRssFolderInput {
  name: string;
  orderIndex?: number;
}

export interface UpdateRssFolderInput {
  name?: string;
  orderIndex?: number;
}

// ============ RSS Subscription ============

export type RssSubscriptionStatus = "ok" | "error";

export interface RssSubscription {
  subscriptionId: string;
  url: string;
  title: string | null;
  displayName: string | null;
  siteUrl: string | null;
  folderId: string | null;
  enabled: boolean;
  lastFetchedAt: number | null;
  status: RssSubscriptionStatus;
  errorMessage: string | null;
  etag: string | null;
  lastModified: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateRssSubscriptionInput {
  url: string;
  title?: string;
  displayName?: string;
  siteUrl?: string;
  folderId?: string;
}

export interface UpdateRssSubscriptionInput {
  displayName?: string;
  folderId?: string | null;
  enabled?: boolean;
  title?: string;
  siteUrl?: string;
  lastFetchedAt?: number;
  status?: RssSubscriptionStatus;
  errorMessage?: string | null;
  etag?: string | null;
  lastModified?: string | null;
}

// ============ Feed Item ============

export type FeedItemReadState = "unread" | "read";

export interface FeedItem {
  itemId: string;
  subscriptionId: string;
  guid: string | null;
  title: string | null;
  link: string | null;
  author: string | null;
  publishedAt: number | null;
  contentHtml: string | null;
  excerpt: string | null;
  readState: FeedItemReadState;
  saved: boolean;
  documentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateFeedItemInput {
  subscriptionId: string;
  guid?: string;
  title?: string;
  link?: string;
  author?: string;
  publishedAt?: number;
  contentHtml?: string;
  excerpt?: string;
}

export interface UpdateFeedItemInput {
  readState?: FeedItemReadState;
  saved?: boolean;
  documentId?: string;
  contentHtml?: string;
}

// ============ Query Filters ============

export interface FeedItemsFilter {
  subscriptionId?: string;
  folderId?: string;
  readState?: FeedItemReadState;
  saved?: boolean;
  limit?: number;
  offset?: number;
}

export interface RssSubscriptionsFilter {
  folderId?: string;
  enabled?: boolean;
  status?: RssSubscriptionStatus;
}
