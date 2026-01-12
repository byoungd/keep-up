/**
 * RSS Ingestor
 *
 * Imports content from RSS items by fetching their linked content.
 */

import type { DbDriver } from "../../driver/types";
import { computeHash, getAssetStore } from "../AssetStore";
import type { IngestResult, IngestorFn } from "../types";

/** Generate a simple hash from content for deduplication */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}

/**
 * RSS Ingestor configuration
 */
export interface RssIngestorConfig {
  /** Database driver for fetching RSS items */
  db: DbDriver;
  /** API endpoint for proxied fetch (bypasses CORS) */
  fetchProxyUrl?: string;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Whether to store raw content in AssetStore (default: true) */
  storeAsset?: boolean;
}

/**
 * Parse RSS sourceRef into components
 * Format: rss:<itemGuid>:<feedId>:<contentUrl>
 */
function parseRssSourceRef(sourceRef: string): {
  itemGuid: string;
  feedId: string;
  contentUrl: string;
} {
  const match = sourceRef.match(/^rss:([^:]+):([^:]+):(.+)$/);
  if (!match) {
    throw new Error("Invalid RSS sourceRef format. Expected: rss:<itemGuid>:<feedId>:<contentUrl>");
  }
  return {
    itemGuid: match[1],
    feedId: match[2],
    contentUrl: match[3],
  };
}

/**
 * Create an RSS ingestor function.
 * sourceRef format: rss:<itemGuid>:<feedId>:<contentUrl>
 */
export function createRssIngestor(config: RssIngestorConfig): IngestorFn {
  const timeoutMs = config.timeoutMs ?? 30000;
  const storeAsset = config.storeAsset ?? true;

  return async (sourceRef: string, onProgress): Promise<IngestResult> => {
    onProgress(10);

    const { itemGuid, feedId, contentUrl } = parseRssSourceRef(sourceRef);

    onProgress(20);

    // Fetch content from the URL
    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      if (config.fetchProxyUrl) {
        response = await fetch(config.fetchProxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: contentUrl }),
          signal: controller.signal,
        });
      } else {
        response = await fetch(contentUrl, { signal: controller.signal });
      }

      clearTimeout(timeoutId);
    } catch (err) {
      throw new Error(
        `Failed to fetch RSS content: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    onProgress(50);

    const contentType = response.headers.get("content-type") ?? "";
    const arrayBuffer = await response.arrayBuffer();
    const text = new TextDecoder().decode(arrayBuffer);

    onProgress(70);

    // Store raw asset if enabled
    let assetInfo: IngestResult["assetInfo"];
    if (storeAsset) {
      const assetStore = getAssetStore();
      const assetHash = await computeHash(arrayBuffer);
      const { storagePath, storageProvider } = await assetStore.write(arrayBuffer, assetHash);

      const mimeType = contentType.split(";")[0].trim() || "text/html";
      assetInfo = {
        assetId: `asset_${assetHash.slice(0, 16)}`,
        assetHash,
        byteSize: arrayBuffer.byteLength,
        mimeType,
        storagePath,
        storageProvider,
      };
    }

    onProgress(85);

    // Extract title from HTML
    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? "RSS Item";

    // Strip scripts and styles
    const content = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "");

    const result: IngestResult = {
      title,
      contentHtml: content,
      canonicalUrl: contentUrl,
      contentHash: hashContent(text),
      rawMetadata: {
        rssItemGuid: itemGuid,
        rssFeedId: feedId,
        rssSourceRef: sourceRef,
      },
      assetInfo,
    };

    onProgress(100);
    return result;
  };
}

/**
 * Helper to create a sourceRef for an RSS item
 */
export function createRssSourceRef(itemGuid: string, feedId: string, contentUrl: string): string {
  return `rss:${itemGuid}:${feedId}:${contentUrl}`;
}
