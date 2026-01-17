/**
 * RSS Ingestor
 *
 * Imports content from RSS items by fetching their linked content.
 */

import { type RetryOptions, withRetry } from "@ku0/ingest-rss";
import type { DbDriver } from "../../driver/types";
import { computeHash, getAssetStore } from "../AssetStore";
import type { IngestorFn, IngestResult } from "../types";

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
  /** Retry policy for content fetches */
  retryOptions?: RetryOptions;
}

const DEFAULT_RSS_ITEM_RETRY: RetryOptions = {
  maxRetries: 2,
  initialDelay: 1200,
  maxDelay: 6000,
  backoffFactor: 2,
};

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

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

/**
 * Create an RSS ingestor function.
 * sourceRef format: rss:<itemGuid>:<feedId>:<contentUrl>
 */
export function createRssIngestor(config: RssIngestorConfig): IngestorFn {
  const timeoutMs = config.timeoutMs ?? 30000;
  const storeAsset = config.storeAsset ?? true;
  const { onRetry, ...retryOverrides } = config.retryOptions ?? {};
  const retryPolicy: RetryOptions = {
    ...DEFAULT_RSS_ITEM_RETRY,
    ...retryOverrides,
    onRetry: (attempt, error, delay) => {
      onRetry?.(attempt, error, delay);
    },
  };

  return async (sourceRef: string, onProgress): Promise<IngestResult> => {
    onProgress(10);

    const { itemGuid, feedId, contentUrl } = parseRssSourceRef(sourceRef);

    onProgress(20);

    // Fetch content from the URL with retry policy
    let response: Response;
    try {
      response = await withRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          let nextResponse: Response;
          if (config.fetchProxyUrl) {
            nextResponse = await fetch(config.fetchProxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: contentUrl }),
              signal: controller.signal,
            });
          } else {
            nextResponse = await fetch(contentUrl, { signal: controller.signal });
          }

          if (!nextResponse.ok) {
            const retryAfterMs = parseRetryAfter(nextResponse.headers.get("Retry-After"));
            const error = new Error(`HTTP ${nextResponse.status}: ${nextResponse.statusText}`);
            const errorWithMeta = error as Error & {
              status?: number;
              retryAfterMs?: number;
            };
            errorWithMeta.status = nextResponse.status;
            if (retryAfterMs !== undefined) {
              errorWithMeta.retryAfterMs = retryAfterMs;
            }
            throw error;
          }

          return nextResponse;
        } finally {
          clearTimeout(timeoutId);
        }
      }, retryPolicy);
    } catch (err) {
      throw new Error(
        `Failed to fetch RSS content: ${err instanceof Error ? err.message : String(err)}`
      );
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
