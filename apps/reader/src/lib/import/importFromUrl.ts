/**
 * Import from URL
 *
 * Fetches content from a URL and imports it as a Loro document.
 * Uses native fetch instead of @ku0/ingest-file for browser compatibility.
 */

import type { DocSourceType } from "@/lib/persistence/docMetadata";
import { type ImportResult, type IngestionMeta, importFromIngestionMeta } from "./ingestToLoro";

/**
 * Fetch and parse content from a URL.
 */
async function fetchAndParseUrl(url: string): Promise<IngestionMeta> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/plain, text/markdown, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();

  // Extract title from URL
  const urlPath = new URL(url).pathname;
  const filename = urlPath.split("/").pop() || "Untitled";
  const title = filename.replace(/\.(md|txt|markdown)$/i, "");

  return {
    title,
    content,
    sourceId: url,
  };
}

/**
 * Import a document from a URL.
 *
 * @param url - The URL to import from
 * @param sourceType - The type of source (github, url, rss)
 * @returns ImportResult with docId, metadata, and snapshot
 */
export async function importFromUrl(url: string, sourceType: DocSourceType): Promise<ImportResult> {
  const meta = await fetchAndParseUrl(url);
  return importFromIngestionMeta(meta, sourceType, url);
}
