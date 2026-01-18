/**
 * Full Text Fetcher
 *
 * Fetches full article content when RSS feed only provides snippets.
 * Uses Mozilla Readability for content extraction.
 */

import { observability } from "@ku0/core";
import { type ExtractedContent, type ExtractOptions, extractFromHtml } from "./contentExtractor";
import { type RetryOptions, withRetry } from "./retry";

export interface FetchFullTextOptions extends ExtractOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom user agent */
  userAgent?: string;
  /** Retry options */
  retry?: RetryOptions;
}

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; LinguaStream/1.0; +https://example.com)";
const logger = observability.getLogger();

/**
 * Fetch and extract full article content from a URL.
 */
export async function fetchFullText(
  url: string,
  options: FetchFullTextOptions = {}
): Promise<ExtractedContent | null> {
  const {
    timeout = DEFAULT_TIMEOUT,
    userAgent = DEFAULT_USER_AGENT,
    retry,
    ...extractOptions
  } = options;

  const fetchFn = async (): Promise<ExtractedContent | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return extractFromHtml(html, { ...extractOptions, baseUrl: url });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (retry) {
    return withRetry(fetchFn, retry);
  }

  return fetchFn();
}

/**
 * Batch fetch full text for multiple URLs.
 * Returns a map of URL to extracted content (null if extraction failed).
 */
export async function fetchFullTextBatch(
  urls: string[],
  options: FetchFullTextOptions = {}
): Promise<Map<string, ExtractedContent | null>> {
  const results = new Map<string, ExtractedContent | null>();

  // Process in parallel with concurrency limit
  const concurrency = 3;
  const chunks: string[][] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    chunks.push(urls.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (url) => {
      try {
        const content = await fetchFullText(url, options);
        results.set(url, content);
      } catch (error) {
        logger.warn("ingest", "Failed to fetch full text", {
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        results.set(url, null);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Check if we should attempt to fetch full text for an item.
 * Returns true if the content appears to be a snippet.
 */
export function shouldFetchFullText(content: string | undefined, snippetThreshold = 500): boolean {
  if (!content) {
    return true;
  }

  // Strip HTML and check length
  const textContent = content
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return textContent.length < snippetThreshold;
}
