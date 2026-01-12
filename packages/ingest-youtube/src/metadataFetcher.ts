/**
 * YouTube Metadata Fetcher
 *
 * Fetches video metadata using YouTube oEmbed API (no API key required).
 */

import type { YouTubeVideoMetadata } from "./types";

/**
 * Fetches video metadata from YouTube oEmbed API
 *
 * oEmbed is a free API that doesn't require an API key.
 * Returns basic metadata: title, author, thumbnail.
 *
 * @param videoId - YouTube video ID
 * @param options - Fetch options
 * @returns Video metadata
 */
export async function fetchVideoMetadata(
  videoId: string,
  options?: { timeout?: number }
): Promise<YouTubeVideoMetadata> {
  const timeout = options?.timeout ?? 10000;
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(oembedUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`oEmbed API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return {
      videoId,
      title: data.title || "Untitled Video",
      author: data.author_name || "Unknown",
      thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (error) {
    // Graceful degradation: return basic metadata
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[ingest-youtube] Metadata fetch timeout for ${videoId}`);
    }

    return {
      videoId,
      title: "YouTube Video",
      author: "Unknown",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}
