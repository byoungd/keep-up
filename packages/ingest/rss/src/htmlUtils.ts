/**
 * HTML Utilities - Browser-Safe
 *
 * Simple HTML utility functions that don't require jsdom.
 * For full content extraction, use contentExtractor.ts (server-side only).
 */

/**
 * Check if a string contains HTML tags.
 */
export function containsHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Check if content appears to be a snippet (too short to be full article).
 */
export function isSnippet(content: string, threshold = 500): boolean {
  const cleanText = containsHtml(content) ? stripHtmlTags(content) : content;
  return cleanText.length < threshold;
}

/**
 * Simple HTML tag stripping.
 * For advanced HTML cleaning with DOM parsing, use contentExtractor.cleanHtmlContent.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean HTML content by stripping tags and normalizing whitespace.
 * This is a browser-safe version that doesn't require jsdom.
 */
export function cleanHtmlContentSimple(html: string): string {
  if (!html) {
    return "";
  }
  return stripHtmlTags(html);
}
