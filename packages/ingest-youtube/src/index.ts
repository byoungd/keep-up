/**
 * @ku0/ingest-youtube - YouTube Transcript Ingestion Package
 *
 * Extracts and ingests YouTube video transcripts for language learning.
 *
 * @example
 * ```typescript
 * import { YouTubeIngestor, createYouTubePlugin } from "@ku0/ingest-youtube";
 *
 * // Simple usage with YouTubeIngestor
 * const ingestor = new YouTubeIngestor();
 * const transcript = await ingestor.getTranscript("https://youtu.be/VIDEO_ID");
 * console.log(transcript.metadata.title);
 * console.log(transcript.paragraphs);
 *
 * // Plugin usage with AtomicIngestionService
 * const plugin = createYouTubePlugin();
 * const metas = await plugin.fetch({ url: "https://youtu.be/VIDEO_ID" });
 * for (const meta of metas) {
 *   const handle = await ingestionService.beginIngestion(meta);
 *   await ingestionService.commitIngestion(handle);
 * }
 * ```
 */

// Types
export type {
  YouTubeSource,
  YouTubeVideoMetadata,
  TranscriptSegment,
  TranscriptParagraph,
  YouTubeTranscriptResult,
  YouTubeIngestOptions,
} from "./types";

// URL utilities
export {
  extractVideoId,
  isValidVideoId,
  buildWatchUrl,
  buildTimestampedUrl,
} from "./urlParser";

// Fetchers
export { fetchVideoMetadata } from "./metadataFetcher";
export { fetchTranscript } from "./transcriptFetcher";

// Processing
export {
  groupIntoParagraphs,
  formatTimestamp,
  countWords,
} from "./paragraphGrouper";

// Atomic ingestion
export { YouTubeAtomicAdapter, type IngestionMeta } from "./atomicAdapter";

// Plugin
export { createYouTubePlugin, type ContentSourcePlugin } from "./plugin";

// High-level API
export { YouTubeIngestor } from "./YouTubeIngestor";
