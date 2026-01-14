/**
 * YouTube Content Source Plugin
 *
 * Implements the ContentSourcePlugin pattern for YouTube content ingestion.
 * Returns IngestionMeta for use with AtomicIngestionService.
 */

import { type IngestionMeta, YouTubeAtomicAdapter } from "./atomicAdapter";
import { fetchVideoMetadata } from "./metadataFetcher";
import { countWords, groupIntoParagraphs } from "./paragraphGrouper";
import { fetchTranscript } from "./transcriptFetcher";
import type { YouTubeIngestOptions, YouTubeSource, YouTubeTranscriptResult } from "./types";
import { extractVideoId } from "./urlParser";

/**
 * Internal plugin contract for content sources.
 * Matches the pattern from @ku0/ingest-rss.
 */
export interface ContentSourcePlugin<TSource, TOptions, TMeta> {
  /** Plugin identifier */
  id: string;
  /** Plugin version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Fetch content and return ingestion metadata */
  fetch(source: TSource, options?: TOptions): Promise<TMeta[]>;
}

/**
 * Dependencies that can be injected for testing
 */
export interface YouTubePluginDependencies {
  fetchMetadata?: typeof fetchVideoMetadata;
  fetchTranscript?: typeof fetchTranscript;
}

/**
 * Create the YouTube content source plugin.
 * Returns ingestion metadata for AtomicIngestionService.
 *
 * @example
 * ```typescript
 * const plugin = createYouTubePlugin();
 * const metas = await plugin.fetch({ url: "https://youtu.be/VIDEO_ID" });
 *
 * for (const meta of metas) {
 *   const handle = await ingestionService.beginIngestion(meta);
 *   await ingestionService.commitIngestion(handle);
 * }
 * ```
 */
export function createYouTubePlugin(
  dependencies: YouTubePluginDependencies = {}
): ContentSourcePlugin<YouTubeSource, YouTubeIngestOptions, IngestionMeta> {
  const getMetadata = dependencies.fetchMetadata ?? fetchVideoMetadata;
  const getTranscript = dependencies.fetchTranscript ?? fetchTranscript;

  return {
    id: "youtube",
    version: "1.0.0",
    description: "YouTube video transcript ingestion",

    async fetch(
      source: YouTubeSource,
      options: YouTubeIngestOptions = {}
    ): Promise<IngestionMeta[]> {
      const videoId = extractVideoId(source.url);

      if (!videoId) {
        throw new Error(`Invalid YouTube URL: ${source.url}`);
      }

      const language = options.language ?? source.preferredLanguage ?? "en";

      // Fetch metadata and transcript in parallel
      const [metadata, segments] = await Promise.all([
        getMetadata(videoId, { timeout: options.timeout }),
        getTranscript(videoId, language),
      ]);

      // Group into paragraphs
      const paragraphs = groupIntoParagraphs(segments);
      const fullText = paragraphs.map((p) => p.text).join("\n\n");

      // Calculate stats
      const totalDuration =
        segments.length > 0
          ? segments[segments.length - 1].offset + segments[segments.length - 1].duration
          : 0;

      const result: YouTubeTranscriptResult = {
        metadata,
        fullText,
        paragraphs,
        segments,
        language,
        totalDuration,
        wordCount: countWords(paragraphs),
      };

      // Convert to IngestionMeta
      const meta = YouTubeAtomicAdapter.toIngestionMeta(result, source);

      // Return as array (plugin interface expects array for batch operations)
      return [meta];
    },
  };
}
