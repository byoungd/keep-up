/**
 * YouTube URL Parser
 *
 * Extracts video IDs from various YouTube URL formats.
 */

/**
 * Supported YouTube URL patterns
 * Each pattern captures exactly 11 characters for the video ID
 */
const YOUTUBE_URL_PATTERNS = [
  // Standard: https://www.youtube.com/watch?v=VIDEO_ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:&|$)/,
  // Short: https://youtu.be/VIDEO_ID (must end after 11 chars)
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
  // Embed: https://www.youtube.com/embed/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
  // Shorts: https://www.youtube.com/shorts/VIDEO_ID
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\?|$)/,
  // Plain video ID
  /^([a-zA-Z0-9_-]{11})$/,
];

/**
 * Validates if a string is a valid YouTube video ID format
 *
 * YouTube video IDs are exactly 11 characters, consisting of:
 * - Alphanumeric characters (a-z, A-Z, 0-9)
 * - Underscore (_) and hyphen (-)
 */
export function isValidVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Extracts video ID from a YouTube URL or validates a plain ID
 *
 * Supports:
 * - Standard watch URLs: https://www.youtube.com/watch?v=VIDEO_ID
 * - Short URLs: https://youtu.be/VIDEO_ID
 * - Embed URLs: https://www.youtube.com/embed/VIDEO_ID
 * - Shorts URLs: https://www.youtube.com/shorts/VIDEO_ID
 * - Plain video IDs: VIDEO_ID
 *
 * @param urlOrId - YouTube URL or video ID
 * @returns Video ID if valid, null otherwise
 */
export function extractVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();

  for (const pattern of YOUTUBE_URL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Builds a standard YouTube watch URL from a video ID
 */
export function buildWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Builds a YouTube watch URL with timestamp
 *
 * @param videoId - YouTube video ID
 * @param seconds - Start time in seconds
 */
export function buildTimestampedUrl(videoId: string, seconds: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(seconds)}s`;
}
