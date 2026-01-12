/**
 * File Ingestor
 *
 * Parses content from local files (.md, .txt).
 * Uses IndexedDB to store pending files for reload resilience.
 */

import { computeHash, getAssetStore } from "../AssetStore";
import {
  deletePendingFile,
  getPendingFile,
  cleanupStalePendingFiles as idbCleanup,
  getPendingFileCount as idbGetCount,
  storePendingFile,
} from "../PendingFileStore";
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

/** Parse YAML frontmatter from Markdown */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  const lines = frontmatterMatch[1].split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      frontmatter[match[1].toLowerCase()] = match[2].replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, body: frontmatterMatch[2] };
}

/** Extract metadata and content from HTML */
function parseHtml(html: string): { title: string; author?: string; content: string } {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

  // Extract author from meta tag
  const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);

  // Strip scripts, styles, and extract body content
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "");

  // Extract body if present
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    content = bodyMatch[1];
  }

  return {
    title: titleMatch?.[1]?.trim() ?? "Untitled",
    author: authorMatch?.[1],
    content: content.trim(),
  };
}

/** Check if file is HTML based on extension */
function isHtmlFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "html" || ext === "htm";
}

/** Get mime type from file name */
function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "html":
    case "htm":
      return "text/html";
    default:
      return "application/octet-stream";
  }
}

/**
 * Clean up stale pending files that haven't been processed.
 * Delegates to PendingFileStore.
 */
export async function cleanupStalePendingFiles(): Promise<number> {
  return idbCleanup();
}

/**
 * Remove a specific pending file (e.g., when import is cancelled).
 */
export async function removePendingFile(sourceRef: string): Promise<void> {
  await deletePendingFile(sourceRef);
}

/**
 * Get the count of pending files (useful for debugging).
 */
export async function getPendingFileCount(): Promise<number> {
  return idbGetCount();
}

/**
 * Register a file for later ingestion.
 * Stores file in IndexedDB for reload resilience.
 * Returns a unique sourceRef to use when enqueueing the import job.
 *
 * NOTE: This is now async! Callers must await.
 */
export async function registerFile(file: File): Promise<string> {
  // Clean up stale files periodically
  idbCleanup().catch(console.error);

  return storePendingFile(file);
}

/**
 * Create a file ingestor function.
 * @param storeAsset Whether to store raw file bytes in AssetStore (default: true)
 */
export function createFileIngestor(options: { storeAsset?: boolean } = {}): IngestorFn {
  const storeAsset = options.storeAsset ?? true;

  return async (sourceRef: string, onProgress): Promise<IngestResult> => {
    // Retrieve file from IndexedDB
    const fileData = await getPendingFile(sourceRef);
    if (!fileData) {
      throw new Error(
        `File not found for sourceRef: ${sourceRef}. It may have been deleted or the page was reloaded before storage completed.`
      );
    }

    const { buffer, name, lastModified } = fileData;

    onProgress(10);

    // Decode ArrayBuffer to text
    const decoder = new TextDecoder();
    const text = decoder.decode(buffer);

    onProgress(40);

    // Remove from pending after successful read
    await deletePendingFile(sourceRef);

    // Store raw asset if enabled
    let assetInfo: IngestResult["assetInfo"];
    if (storeAsset) {
      const assetStore = getAssetStore();
      const assetHash = await computeHash(buffer);
      const { storagePath, storageProvider } = await assetStore.write(buffer, assetHash);

      assetInfo = {
        assetId: `asset_${assetHash.slice(0, 16)}`,
        assetHash,
        byteSize: buffer.byteLength,
        mimeType: getMimeType(name),
        storagePath,
        storageProvider,
      };
    }

    onProgress(60);

    // Process based on file type
    let result: IngestResult;

    if (isHtmlFile(name)) {
      // Handle HTML files
      const parsed = parseHtml(text);
      result = {
        title: parsed.title,
        contentHtml: parsed.content,
        author: parsed.author,
        publishedAt: lastModified,
        contentHash: hashContent(parsed.content),
        rawMetadata: {
          fileName: name,
          fileSize: buffer.byteLength,
        },
        assetInfo,
      };
    } else {
      // Handle Markdown/Text files
      const { frontmatter, body } = parseFrontmatter(text);
      result = {
        title: frontmatter.title ?? name.replace(/\.(md|markdown|txt)$/, ""),
        contentMarkdown: body,
        author: frontmatter.author,
        publishedAt: frontmatter.date ? Date.parse(frontmatter.date) : lastModified,
        contentHash: hashContent(body),
        rawMetadata: {
          fileName: name,
          fileSize: buffer.byteLength,
        },
        assetInfo,
      };
    }

    onProgress(100);
    return result;
  };
}
