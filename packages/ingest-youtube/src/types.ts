/**
 * YouTube Ingest Package - Type Definitions
 *
 * Platform-agnostic types for YouTube transcript extraction and ingestion.
 */

/**
 * YouTube video URL source for ingestion
 */
export interface YouTubeSource {
  /** YouTube URL or video ID */
  url: string;
  /** Preferred subtitle language (default: "en") */
  preferredLanguage?: string;
}

/**
 * Video metadata from oEmbed API
 */
export interface YouTubeVideoMetadata {
  /** YouTube video ID (11 characters) */
  videoId: string;
  /** Video title */
  title: string;
  /** Channel/author name */
  author: string;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** Video duration in seconds (if available) */
  duration?: number;
}

/**
 * Raw transcript segment with timing information
 */
export interface TranscriptSegment {
  /** Segment text content */
  text: string;
  /** Start time in seconds */
  offset: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Grouped paragraph with time range
 */
export interface TranscriptParagraph {
  /** Paragraph text content */
  text: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
}

/**
 * Complete transcript extraction result
 */
export interface YouTubeTranscriptResult {
  /** Video metadata */
  metadata: YouTubeVideoMetadata;
  /** Full text content (paragraphs joined with newlines) */
  fullText: string;
  /** Grouped paragraphs with timing */
  paragraphs: TranscriptParagraph[];
  /** Original segments with precise timing */
  segments: TranscriptSegment[];
  /** Detected/used language */
  language: string;
  /** Total duration in seconds */
  totalDuration: number;
  /** Word count */
  wordCount: number;
}

/**
 * Options for transcript ingestion
 */
export interface YouTubeIngestOptions {
  /** Preferred subtitle language (default: "en") */
  language?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
}
