import type { Doc } from "@keepup/core";
import type { RetryOptions } from "./retry";

export interface RSSIngestOptions {
  /**
   * Timeout for fetching the feed in milliseconds.
   * @default 10000
   */
  timeout?: number;

  /**
   * User agent string to use for fetching.
   */
  userAgent?: string;

  /**
   * Retry policy for feed fetches.
   */
  retry?: RetryOptions;
}

export interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
  author?: string;
  categories?: string[];
  // biome-ignore lint/suspicious/noExplicitAny: extensible item
  [key: string]: any;
}

export interface FeedSource {
  url: string;
  platform?: "Reddit" | "Hacker News" | string;
}

export interface IngestDoc extends Doc {
  canonicalHash: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface IngestResult {
  doc: IngestDoc;
  originalId: string;
  raw: RSSItem;
}
