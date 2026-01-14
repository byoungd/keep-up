import { observability } from "@keepup/core";
import { type RetryOptions, withRetry } from "./retry";
import type { FeedSource, RSSIngestOptions } from "./types";

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  initialDelay: 1200,
  maxDelay: 6000,
  backoffFactor: 2,
};

const logger = observability.getLogger();

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function buildRetryOptions(
  options: RetryOptions | undefined,
  context: Record<string, unknown>
): RetryOptions {
  const merged: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const originalOnRetry = options?.onRetry;

  return {
    ...merged,
    onRetry: (attempt, error, delay) => {
      originalOnRetry?.(attempt, error, delay);
      const err = toError(error);
      logger.warn("ingest", "RSS fetch retry scheduled", {
        ...context,
        attempt,
        delayMs: delay,
        error: err.message,
      });
    },
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

export interface FetchResult {
  content: string;
  /** ETag header for conditional requests */
  etag?: string;
  /** Last-Modified header for conditional requests */
  lastModified?: string;
  /** Whether content was modified (false if 304 Not Modified) */
  modified: boolean;
  /** Fetch duration in milliseconds */
  durationMs?: number;
}

export interface ConditionalFetchOptions extends RSSIngestOptions {
  /** ETag from previous request */
  etag?: string;
  /** Last-Modified from previous request */
  lastModified?: string;
  /** Retry options */
  retry?: RetryOptions;
  /** Proxy URL for bypassing CORS in browser */
  proxyUrl?: string;
}

// biome-ignore lint/complexity/noStaticOnlyClass: utility class pattern
export class RSSFetcher {
  /**
   * Fetch RSS feed content.
   * @deprecated Use fetchWithConditional for better caching support.
   */
  static async fetch(source: FeedSource, options: RSSIngestOptions = {}): Promise<string> {
    const result = await RSSFetcher.fetchWithConditional(source, options);
    return result.content;
  }

  /**
   * Fetch RSS feed with conditional request support (ETag/Last-Modified).
   * Returns cached headers for subsequent conditional requests.
   */
  static async fetchWithConditional(
    source: FeedSource,
    options: ConditionalFetchOptions = {}
  ): Promise<FetchResult> {
    const timeout = options.timeout || DEFAULT_TIMEOUT;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fetch logic
    const fetchFn = async (): Promise<FetchResult> => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const start = Date.now();

      try {
        // Use proxy if provided (for browser CORS bypass)
        if (options.proxyUrl) {
          const proxyUrl = new URL(options.proxyUrl);
          proxyUrl.searchParams.set("url", source.url);
          proxyUrl.searchParams.set("type", "feed");

          const headers: Record<string, string> = {
            "Cache-Control": "no-cache",
          };
          if (options.etag) {
            headers["If-None-Match"] = options.etag;
          }
          if (options.lastModified) {
            headers["If-Modified-Since"] = options.lastModified;
          }

          const response = await fetch(proxyUrl.toString(), {
            signal: controller.signal,
            cache: "no-store",
            headers,
          });

          if (response.status === 304) {
            return {
              content: "",
              etag: options.etag,
              lastModified: options.lastModified,
              modified: false,
              durationMs: Date.now() - start,
            };
          }

          if (!response.ok) {
            const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(
              `Failed to fetch RSS via proxy: ${response.status} ${errorData.error || response.statusText}`
            );
            // biome-ignore lint/suspicious/noExplicitAny: error property
            (error as any).status = response.status;
            if (retryAfterMs !== undefined) {
              // biome-ignore lint/suspicious/noExplicitAny: error property
              (error as any).retryAfterMs = retryAfterMs;
            }
            throw error;
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(`Proxy error: ${data.error}`);
          }

          return {
            content: data.content,
            etag: data.etag,
            lastModified: data.lastModified,
            modified: true,
            durationMs: Date.now() - start,
          };
        }

        // Direct fetch (server-side or CORS-enabled feeds)
        const headers = RSSFetcher.buildHeaders(source, options);
        const response = await fetch(source.url, {
          headers,
          signal: controller.signal,
          cache: "no-store",
        });

        // Handle 304 Not Modified
        if (response.status === 304) {
          return {
            content: "",
            etag: options.etag,
            lastModified: options.lastModified,
            modified: false,
            durationMs: Date.now() - start,
          };
        }

        if (!response.ok) {
          const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
          const error = new Error(`Failed to fetch RSS: ${response.status} ${response.statusText}`);
          // biome-ignore lint/suspicious/noExplicitAny: error property
          (error as any).status = response.status;
          if (retryAfterMs !== undefined) {
            // biome-ignore lint/suspicious/noExplicitAny: error property
            (error as any).retryAfterMs = retryAfterMs;
          }
          throw error;
        }

        const content = await response.text();
        const responseHeaders = response.headers;
        const getHeader = (name: string) =>
          typeof responseHeaders?.get === "function"
            ? (responseHeaders.get(name) ?? undefined)
            : undefined;

        return {
          content,
          etag: getHeader("ETag"),
          lastModified: getHeader("Last-Modified"),
          modified: true,
          durationMs: Date.now() - start,
        };
      } finally {
        clearTimeout(id);
      }
    };

    return withRetry(
      fetchFn,
      buildRetryOptions(options.retry, {
        stage: "fetch",
        sourceUrl: source.url,
        viaProxy: Boolean(options.proxyUrl),
      })
    );
  }

  private static buildHeaders(
    source: FeedSource,
    options: ConditionalFetchOptions
  ): Record<string, string> {
    const isReddit = source.url.includes("reddit.com") || source.platform === "Reddit";

    const headers: Record<string, string> = isReddit
      ? {
          "User-Agent": "LinguaStream/1.0 (by u/linguastream)",
          Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        }
      : {
          "User-Agent": "Mozilla/5.0 (compatible; LinguaStream/1.0; +https://example.com)",
          Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        };

    if (options.userAgent) {
      headers["User-Agent"] = options.userAgent;
    }

    // Add conditional request headers
    if (options.etag) {
      headers["If-None-Match"] = options.etag;
    }
    if (options.lastModified) {
      headers["If-Modified-Since"] = options.lastModified;
    }

    return headers;
  }
}
