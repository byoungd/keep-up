/**
 * Atomic Ingestion Adapter for YouTube
 *
 * Converts YouTube transcript results to IngestionMeta format
 * for use with AtomicIngestionService.
 *
 * @see packages/app/src/root/persistence/ATOMIC_INGESTION_CONTRACT.md
 */

import type { YouTubeSource, YouTubeTranscriptResult } from "./types";

/**
 * IngestionMeta format expected by AtomicIngestionService.
 * Defined here to avoid circular dependency with app package.
 */
export interface IngestionMeta {
  /** Document title */
  title: string;
  /** Document content (canonical text) */
  content: string;
  /** Original source identifier (for debugging/tracking) */
  sourceId?: string;
}

/**
 * Converts YouTube transcript results to IngestionMeta for atomic ingestion.
 *
 * Usage:
 * ```typescript
 * const meta = YouTubeAtomicAdapter.toIngestionMeta(result, source);
 * const handle = await ingestionService.beginIngestion(meta);
 * const result = await ingestionService.commitIngestion(handle);
 * ```
 */
export const YouTubeAtomicAdapter = {
  /**
   * Convert transcript result to IngestionMeta.
   * Does NOT create Doc/Blocks - that's AtomicIngestionService's job.
   */
  toIngestionMeta(result: YouTubeTranscriptResult, _source: YouTubeSource): IngestionMeta {
    const title = result.metadata.title || "YouTube Video";

    // Join paragraphs with double newlines as canonical text
    const content = result.fullText;

    // Use videoId as source identifier
    const sourceId = `youtube:${result.metadata.videoId}`;

    return {
      title,
      content,
      sourceId,
    };
  },

  /**
   * Create IngestionMeta with additional metadata in title
   * (useful for search/display)
   */
  toIngestionMetaWithAuthor(result: YouTubeTranscriptResult, source: YouTubeSource): IngestionMeta {
    const meta = YouTubeAtomicAdapter.toIngestionMeta(result, source);

    // Optionally include author in title for better discoverability
    if (result.metadata.author && result.metadata.author !== "Unknown") {
      meta.title = `${result.metadata.title} — ${result.metadata.author}`;
    }

    return meta;
  },
};
