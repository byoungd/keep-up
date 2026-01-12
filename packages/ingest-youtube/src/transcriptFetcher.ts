/**
 * YouTube Transcript Fetcher
 *
 * Extracts subtitles/captions from YouTube videos using youtube-caption-extractor.
 */

import { getSubtitles } from "youtube-caption-extractor";
import type { TranscriptSegment } from "./types";

/**
 * Fetches transcript segments from a YouTube video
 *
 * Attempts to fetch subtitles in the preferred language.
 * Falls back to English if preferred language is unavailable.
 *
 * @param videoId - YouTube video ID
 * @param preferredLang - Preferred language code (default: "en")
 * @returns Array of transcript segments with timing
 * @throws Error if no subtitles are available
 */
export async function fetchTranscript(
  videoId: string,
  preferredLang = "en"
): Promise<TranscriptSegment[]> {
  // Try preferred language first
  try {
    const subtitles = await getSubtitles({
      videoID: videoId,
      lang: preferredLang,
    });

    if (subtitles && subtitles.length > 0) {
      return normalizeSubtitles(subtitles);
    }
  } catch {
    // Continue to fallback
  }

  // Fallback to English if different from preferred
  if (preferredLang !== "en") {
    try {
      const subtitles = await getSubtitles({
        videoID: videoId,
        lang: "en",
      });

      if (subtitles && subtitles.length > 0) {
        return normalizeSubtitles(subtitles);
      }
    } catch {
      // Continue to error
    }
  }

  throw new Error(
    `Cannot fetch transcript for video ${videoId}. The video may not have subtitles or subtitles may be disabled.`
  );
}

/**
 * Normalizes raw subtitle data to TranscriptSegment format
 *
 * youtube-caption-extractor returns start/dur as strings.
 */
function normalizeSubtitles(
  subtitles: Array<{ text: string; start: string; dur: string }>
): TranscriptSegment[] {
  return subtitles.map((item) => ({
    text: cleanSubtitleText(item.text),
    offset: Number.parseFloat(item.start) || 0,
    duration: Number.parseFloat(item.dur) || 0,
  }));
}

/**
 * Cleans subtitle text
 *
 * - Removes HTML entities
 * - Normalizes whitespace
 */
function cleanSubtitleText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
