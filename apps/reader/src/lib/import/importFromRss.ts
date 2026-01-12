import { type ImportResult, type IngestionMeta, importFromIngestionMeta } from "./ingestToLoro";

export interface RSSFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  guid?: string;
}

export interface RSSFeedResult {
  feedTitle: string;
  items: RSSFeedItem[];
  etag?: string;
  lastModified?: string;
}

/**
 * Fetch and parse an RSS feed.
 * Uses a lightweight browser-compatible approach.
 */
export async function fetchRssFeed(feedUrl: string): Promise<RSSFeedResult> {
  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  // Check for parsing errors
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid XML feed");
  }

  // Try RSS 2.0 format first
  const channel = doc.querySelector("channel");
  if (channel) {
    return parseRss2Feed(channel, response.headers);
  }

  // Try Atom format
  const feed = doc.querySelector("feed");
  if (feed) {
    return parseAtomFeed(feed, response.headers);
  }

  throw new Error("Unknown feed format");
}

function parseRss2Feed(channel: Element, headers: Headers): RSSFeedResult {
  const items: RSSFeedItem[] = [];
  const itemElements = channel.querySelectorAll("item");

  for (const item of itemElements) {
    items.push({
      title: item.querySelector("title")?.textContent?.trim() || "Untitled",
      link: item.querySelector("link")?.textContent?.trim() || "",
      pubDate: item.querySelector("pubDate")?.textContent?.trim(),
      content:
        item.querySelector("content\\:encoded")?.textContent?.trim() ||
        item.querySelector("description")?.textContent?.trim(),
      guid: item.querySelector("guid")?.textContent?.trim(),
    });
  }

  return {
    feedTitle: channel.querySelector("title")?.textContent?.trim() || "RSS Feed",
    items,
    etag: headers.get("etag") || undefined,
    lastModified: headers.get("last-modified") || undefined,
  };
}

function parseAtomFeed(feed: Element, headers: Headers): RSSFeedResult {
  const items: RSSFeedItem[] = [];
  const entries = feed.querySelectorAll("entry");

  for (const entry of entries) {
    const linkEl = entry.querySelector("link[rel='alternate'], link");
    items.push({
      title: entry.querySelector("title")?.textContent?.trim() || "Untitled",
      link: linkEl?.getAttribute("href") || "",
      pubDate: entry.querySelector("published, updated")?.textContent?.trim(),
      content:
        entry.querySelector("content")?.textContent?.trim() ||
        entry.querySelector("summary")?.textContent?.trim(),
      guid: entry.querySelector("id")?.textContent?.trim(),
    });
  }

  return {
    feedTitle: feed.querySelector("title")?.textContent?.trim() || "Atom Feed",
    items,
    etag: headers.get("etag") || undefined,
    lastModified: headers.get("last-modified") || undefined,
  };
}

/**
 * Import a single RSS feed item as a Loro document.
 */
export async function importRssFeedItem(item: RSSFeedItem, feedUrl: string): Promise<ImportResult> {
  const meta: IngestionMeta = {
    title: item.title,
    content: item.content || "",
    sourceId: item.guid || item.link,
  };

  const sourceUrl = item.link || feedUrl;
  return importFromIngestionMeta(meta, "rss", sourceUrl);
}

/**
 * Import all items from an RSS feed.
 */
export async function importRssFeed(feedUrl: string): Promise<ImportResult[]> {
  const feed = await fetchRssFeed(feedUrl);
  const results: ImportResult[] = [];

  for (const item of feed.items) {
    try {
      const result = await importRssFeedItem(item, feedUrl);
      results.push(result);
    } catch (err) {
      console.error(`[importRssFeed] Failed to import ${item.title}:`, err);
    }
  }

  return results;
}
