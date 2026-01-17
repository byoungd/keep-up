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

// Atomic ingestion
export { type IngestionMeta, YouTubeAtomicAdapter } from "./atomicAdapter";
// Fetchers
export { fetchVideoMetadata } from "./metadataFetcher";
// Processing
export {
  countWords,
  formatTimestamp,
  groupIntoParagraphs,
} from "./paragraphGrouper";
// Plugin
export { type ContentSourcePlugin, createYouTubePlugin } from "./plugin";
export { fetchTranscript } from "./transcriptFetcher";
// Types
export type {
  TranscriptParagraph,
  TranscriptSegment,
  YouTubeIngestOptions,
  YouTubeSource,
  YouTubeTranscriptResult,
  YouTubeVideoMetadata,
} from "./types";
// URL utilities
export {
  buildTimestampedUrl,
  buildWatchUrl,
  extractVideoId,
  isValidVideoId,
} from "./urlParser";

// High-level API
export { YouTubeIngestor } from "./YouTubeIngestor";
