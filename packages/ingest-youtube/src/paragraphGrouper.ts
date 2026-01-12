/**
 * Paragraph Grouper
 *
 * Groups transcript segments into readable paragraphs based on timing and length.
 */

import type { TranscriptParagraph, TranscriptSegment } from "./types";

/** Seconds of silence that triggers a new paragraph */
const PAUSE_THRESHOLD = 2;

/** Maximum paragraph length in characters before forced split */
const MAX_PARAGRAPH_LENGTH = 500;

/** Minimum paragraph length before considering time-based split */
const MIN_PARAGRAPH_LENGTH = 50;

/**
 * Groups transcript segments into readable paragraphs
 *
 * Paragraph boundaries are determined by:
 * 1. Time gaps > 2 seconds (if paragraph has minimum content)
 * 2. Length > 500 characters
 *
 * @param segments - Raw transcript segments
 * @returns Grouped paragraphs with timing
 */
export function groupIntoParagraphs(segments: TranscriptSegment[]): TranscriptParagraph[] {
  if (segments.length === 0) {
    return [];
  }

  const paragraphs: TranscriptParagraph[] = [];
  let currentParagraph: TranscriptParagraph = {
    text: "",
    startTime: segments[0].offset,
    endTime: segments[0].offset + segments[0].duration,
  };

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const prevEndTime = i > 0 ? segments[i - 1].offset + segments[i - 1].duration : 0;
    const gap = segment.offset - prevEndTime;

    // Check if we should start a new paragraph
    const shouldStartNew =
      (gap > PAUSE_THRESHOLD && currentParagraph.text.length > MIN_PARAGRAPH_LENGTH) ||
      currentParagraph.text.length > MAX_PARAGRAPH_LENGTH;

    if (shouldStartNew && currentParagraph.text.trim()) {
      paragraphs.push({
        ...currentParagraph,
        text: currentParagraph.text.trim(),
      });
      currentParagraph = {
        text: "",
        startTime: segment.offset,
        endTime: segment.offset + segment.duration,
      };
    }

    // Add segment text
    currentParagraph.text += (currentParagraph.text ? " " : "") + segment.text;
    currentParagraph.endTime = segment.offset + segment.duration;
  }

  // Add final paragraph
  if (currentParagraph.text.trim()) {
    paragraphs.push({
      ...currentParagraph,
      text: currentParagraph.text.trim(),
    });
  }

  return paragraphs;
}

/**
 * Formats seconds to human-readable timestamp
 *
 * @param seconds - Time in seconds
 * @returns Formatted string (M:SS or H:MM:SS)
 */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Calculates word count from paragraphs
 */
export function countWords(paragraphs: TranscriptParagraph[]): number {
  return paragraphs.reduce((count, p) => {
    return count + p.text.split(/\s+/).filter((w) => w.length > 0).length;
  }, 0);
}
