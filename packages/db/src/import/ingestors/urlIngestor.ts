/**
 * URL Ingestor
 *
 * Fetches and parses content from URLs (HTML or Markdown).
 */

import { computeHash, getAssetStore } from "../AssetStore";
import type { IngestorFn, IngestResult } from "../types";

/** Generate a simple hash from content for deduplication */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}

/** Detect if content is Markdown based on common patterns */
function isMarkdown(content: string): boolean {
  // Check for common Markdown patterns
  const mdPatterns = [
    /^#{1,6}\s/m, // Headers
    /^\s*[-*+]\s/m, // Unordered lists
    /^\s*\d+\.\s/m, // Ordered lists
    /\[.+\]\(.+\)/, // Links
    /^```/m, // Code blocks
    /^---\s*$/m, // Frontmatter or horizontal rule
  ];
  return mdPatterns.some((p) => p.test(content));
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

/** Extract metadata from HTML */
function parseHtml(html: string): { title: string; author?: string; content: string } {
  // Simple regex-based extraction (sufficient for most cases)
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
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

/**
 * Transform GitHub URLs to raw content URLs.
 * Handles: blob, tree (fetches README), and raw URLs.
 */
function transformGitHubUrl(url: string): { url: string; isGitHub: boolean } {
  // Match GitHub blob URLs: github.com/user/repo/blob/branch/path
  const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (blobMatch) {
    const [, owner, repo, ref, path] = blobMatch;
    return {
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
      isGitHub: true,
    };
  }

  // Match GitHub tree URLs: github.com/user/repo/tree/branch
  // For tree URLs, try to fetch the README
  const treeMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?(?:\/(.*))?$/
  );
  if (treeMatch) {
    const [, owner, repo, ref = "main", subpath = ""] = treeMatch;
    // Try README.md in the specified path
    const readmePath = subpath ? `${subpath}/README.md` : "README.md";
    return {
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${readmePath}`,
      isGitHub: true,
    };
  }

  // Match raw.githubusercontent.com URLs (already correct)
  if (url.includes("raw.githubusercontent.com")) {
    return { url, isGitHub: true };
  }

  return { url, isGitHub: false };
}

/**
 * URL Ingestor configuration
 */
export interface UrlIngestorConfig {
  /** API endpoint for proxied fetch (bypasses CORS) */
  fetchProxyUrl?: string;
  /** Timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Whether to store raw content in AssetStore (default: true) */
  storeAsset?: boolean;
}

/**
 * Create a URL ingestor function.
 */
export function createUrlIngestor(config: UrlIngestorConfig = {}): IngestorFn {
  const timeoutMs = config.timeoutMs ?? 30000;
  const storeAsset = config.storeAsset ?? true;

  return async (sourceRef: string, onProgress) => {
    onProgress(10);

    // Transform GitHub URLs to raw content URLs
    const { url: fetchUrl, isGitHub } = transformGitHubUrl(sourceRef);

    const response = await fetchContent(fetchUrl, config, timeoutMs);
    if (!response.ok) {
      // For GitHub tree URLs, try alternate README locations if first fails
      if (isGitHub && response.status === 404 && fetchUrl.endsWith("README.md")) {
        // Try readme.md (lowercase)
        const altUrl = fetchUrl.replace(/README\.md$/, "readme.md");
        const altResponse = await fetchContent(altUrl, config, timeoutMs);
        if (!altResponse.ok) {
          throw new Error(
            "GitHub repository has no README. Try importing a specific file URL instead."
          );
        }
        return processGitHubResponse(altResponse, sourceRef, onProgress, storeAsset);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    onProgress(40);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "";
    const text = new TextDecoder().decode(arrayBuffer);

    onProgress(60);
    const assetInfo = await storeRawAsset(arrayBuffer, contentType, storeAsset);

    onProgress(80);
    // For GitHub raw URLs, force Markdown detection
    const effectiveSourceRef = isGitHub && fetchUrl.endsWith(".md") ? fetchUrl : sourceRef;
    const result = processContent(text, contentType, effectiveSourceRef, assetInfo);

    onProgress(100);
    return result;
  };
}

async function fetchContent(
  url: string,
  config: UrlIngestorConfig,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (config.fetchProxyUrl) {
      return await fetch(config.fetchProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
    }
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function storeRawAsset(
  arrayBuffer: ArrayBuffer,
  contentType: string,
  shouldStore: boolean
): Promise<IngestResult["assetInfo"]> {
  if (!shouldStore) {
    return undefined;
  }

  const assetStore = getAssetStore();
  const assetHash = await computeHash(arrayBuffer);
  const { storagePath, storageProvider } = await assetStore.write(arrayBuffer, assetHash);

  const mimeType = contentType.split(";")[0].trim() || "text/html";
  return {
    assetId: `asset_${assetHash.slice(0, 16)}`,
    assetHash,
    byteSize: arrayBuffer.byteLength,
    mimeType,
    storagePath,
    storageProvider,
  };
}

/** Process GitHub response after fallback fetch */
async function processGitHubResponse(
  response: Response,
  originalSourceRef: string,
  onProgress: (progress: number) => void,
  shouldStoreAsset: boolean
): Promise<IngestResult> {
  onProgress(40);
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "";
  const text = new TextDecoder().decode(arrayBuffer);

  onProgress(60);
  const assetInfo = await storeRawAsset(arrayBuffer, contentType, shouldStoreAsset);

  onProgress(80);
  // Force Markdown processing for GitHub README files
  const result = processContent(text, "text/markdown", originalSourceRef, assetInfo);

  onProgress(100);
  return result;
}

function processContent(
  text: string,
  contentType: string,
  sourceRef: string,
  assetInfo: IngestResult["assetInfo"]
): IngestResult {
  const isMd =
    contentType.includes("text/markdown") ||
    (contentType.includes("text/plain") && isMarkdown(text)) ||
    sourceRef.endsWith(".md");

  if (isMd) {
    const { frontmatter, body } = parseFrontmatter(text);
    return {
      title: frontmatter.title ?? sourceRef.split("/").pop() ?? "Untitled",
      contentMarkdown: body,
      author: frontmatter.author,
      publishedAt: frontmatter.date ? Date.parse(frontmatter.date) : undefined,
      canonicalUrl: sourceRef,
      contentHash: hashContent(body),
      assetInfo,
    };
  }

  const parsed = parseHtml(text);
  return {
    title: parsed.title,
    contentHtml: parsed.content,
    author: parsed.author,
    canonicalUrl: sourceRef,
    contentHash: hashContent(parsed.content),
    assetInfo,
  };
}
