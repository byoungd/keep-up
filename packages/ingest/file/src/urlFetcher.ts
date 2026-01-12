/**
 * URL Fetcher - Downloads files from URLs for import
 */

import { FileImportError } from "./errors";

export interface UrlFetchOptions {
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Maximum file size in bytes (default: 50MB) */
  maxSize?: number;
  /** User agent string */
  userAgent?: string;
}

export interface UrlFetchResult {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  contentLength?: number;
}

export class UrlFetchError extends FileImportError {
  readonly url: string;
  readonly statusCode?: number;

  constructor(message: string, url: string, statusCode?: number) {
    super(message);
    this.name = "UrlFetchError";
    this.url = url;
    this.statusCode = statusCode;
  }
}

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

/**
 * Fetch a file from a URL.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fetch logic
export async function fetchFromUrl(
  url: string,
  options?: UrlFetchOptions
): Promise<UrlFetchResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "User-Agent": options?.userAgent || "Mozilla/5.0 FileImporter/1.0",
    };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new UrlFetchError(
        `HTTP ${response.status}: ${response.statusText}`,
        url,
        response.status
      );
    }

    // Check content length
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength) > maxSize) {
      throw new UrlFetchError(
        `File too large: ${contentLength} bytes exceeds ${maxSize} bytes`,
        url
      );
    }

    // Get content type
    const contentType = response.headers.get("content-type")?.split(";")[0].trim();

    // Extract filename from URL or Content-Disposition
    const filename = extractFilename(url, response.headers);

    // Read response as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check actual size
    if (buffer.length > maxSize) {
      throw new UrlFetchError(
        `File too large: ${buffer.length} bytes exceeds ${maxSize} bytes`,
        url
      );
    }

    return {
      buffer,
      filename,
      mimeType: contentType || undefined,
      contentLength: buffer.length,
    };
  } catch (error) {
    if (error instanceof UrlFetchError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new UrlFetchError(`Request timeout after ${timeout}ms`, url);
      }
      throw new UrlFetchError(error.message, url);
    }
    throw new UrlFetchError("Unknown fetch error", url);
  }
}

/**
 * Extract filename from URL or headers.
 */
function extractFilename(url: string, headers: Headers): string {
  // Try Content-Disposition header
  const disposition = headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match?.[1]) {
      return match[1].replace(/['"]/g, "");
    }
  }

  // Extract from URL path
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      return lastSegment.split("?")[0];
    }
  } catch {
    // Invalid URL
  }

  return "downloaded_file";
}
