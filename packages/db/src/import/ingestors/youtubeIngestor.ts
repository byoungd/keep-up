/**
 * YouTube Ingestor
 *
 * Integrates @ku0/ingest-youtube to fetch transcripts.
 */

// We use dynamic import or expect the package to be available.
// Since it's a monorepo package, we import it directly.
import { type TranscriptParagraph, YouTubeIngestor } from "@ku0/ingest-youtube";
import type { IngestResult, IngestorFn } from "../types";

/**
 * Configure the YouTube ingestor.
 */
export interface YouTubeIngestorConfig {
  /** Optional language code (default: 'en') */
  language?: string;
}

/**
 * Create a YouTube ingestor function.
 */
export function createYouTubeIngestor(config: YouTubeIngestorConfig = {}): IngestorFn {
  const yt = new YouTubeIngestor();

  return async (sourceRef: string, onProgress): Promise<IngestResult> => {
    onProgress(10);

    try {
      // sourceRef is expected to be a URL or Video ID
      const transcript = await yt.getTranscript(sourceRef, {
        language: config.language,
      });

      onProgress(80);

      const metadata = transcript.metadata ?? {};
      const videoId = metadata.videoId ?? sourceRef;
      const author = metadata.author ?? "";
      const thumbnailUrl = metadata.thumbnailUrl ?? "";

      // Format content as HTML with simple semantic structure
      // We explicitly include timestamps in data attributes for future alignment
      const contentHtml = transcript.paragraphs
        .map(
          (p: TranscriptParagraph) =>
            `<p data-start="${p.startTime}" data-duration="${p.endTime - p.startTime}">${p.text}</p>`
        )
        .join("\n");

      // Also provide a markdown version
      const contentMarkdown = transcript.paragraphs
        .map((p: TranscriptParagraph) => `> ${p.text}  \n`)
        .join("\n");

      const result: IngestResult = {
        title: metadata.title,
        contentHtml,
        contentMarkdown,
        author,
        publishedAt: Date.now(), // YouTube API doesn't always give exact publish date in simple metadata
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        contentHash: `yt_${videoId}`,
        rawMetadata: {
          youtubeId: videoId,
          duration: transcript.totalDuration,
          thumbnailUrl,
          wordCount: transcript.wordCount,
        },
      };

      onProgress(100);
      return result;
    } catch (err) {
      throw new Error(
        `YouTube ingestion failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };
}
