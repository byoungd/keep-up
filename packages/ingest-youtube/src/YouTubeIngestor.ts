/**
 * YouTube Ingestor
 *
 * High-level API that combines all YouTube ingestion steps.
 * Use this for simple use cases; use individual components for more control.
 */

import { type IngestionMeta, YouTubeAtomicAdapter } from "./atomicAdapter";
import { fetchVideoMetadata } from "./metadataFetcher";
import { countWords, groupIntoParagraphs } from "./paragraphGrouper";
import { fetchTranscript } from "./transcriptFetcher";
import type { YouTubeIngestOptions, YouTubeSource, YouTubeTranscriptResult } from "./types";
import { extractVideoId } from "./urlParser";

/**
 * High-level YouTube transcript ingestor
 *
 * @example
 * ```typescript
 * const ingestor = new YouTubeIngestor();
 *
 * // Get full transcript with metadata
 * const transcript = await ingestor.getTranscript("https://youtu.be/VIDEO_ID");
 * console.log(transcript.metadata.title);
 * console.log(transcript.paragraphs);
 *
 * // Or get IngestionMeta for atomic ingestion
 * const meta = await ingestor.fetchForIngestion({ url: "https://youtu.be/VIDEO_ID" });
 * const handle = await ingestionService.beginIngestion(meta);
 * await ingestionService.commitIngestion(handle);
 * ```
 */
export class YouTubeIngestor {
  /**
   * Get full transcript with metadata, paragraphs, and timing
   *
   * @param urlOrId - YouTube URL or video ID
   * @param options - Ingestion options
   * @returns Complete transcript result
   */
  async getTranscript(
    urlOrId: string,
    options: YouTubeIngestOptions = {}
  ): Promise<YouTubeTranscriptResult> {
    const videoId = extractVideoId(urlOrId);

    if (!videoId) {
      throw new Error(`Invalid YouTube URL or video ID: ${urlOrId}`);
    }

    const language = options.language ?? "en";

    // Fetch metadata and transcript in parallel
    const [metadata, segments] = await Promise.all([
      fetchVideoMetadata(videoId, { timeout: options.timeout }),
      fetchTranscript(videoId, language),
    ]);

    // Group into paragraphs
    const paragraphs = groupIntoParagraphs(segments);
    const fullText = paragraphs.map((p) => p.text).join("\n\n");

    // Calculate duration
    const totalDuration =
      segments.length > 0
        ? segments[segments.length - 1].offset + segments[segments.length - 1].duration
        : 0;

    return {
      metadata,
      fullText,
      paragraphs,
      segments,
      language,
      totalDuration,
      wordCount: countWords(paragraphs),
    };
  }

  /**
   * Fetch transcript and convert to IngestionMeta for atomic ingestion
   *
   * @param source - YouTube source (URL or video ID)
   * @param options - Ingestion options
   * @returns IngestionMeta for AtomicIngestionService
   */
  async fetchForIngestion(
    source: YouTubeSource,
    options: YouTubeIngestOptions = {}
  ): Promise<IngestionMeta> {
    const result = await this.getTranscript(source.url, options);
    return YouTubeAtomicAdapter.toIngestionMeta(result, source);
  }
}
