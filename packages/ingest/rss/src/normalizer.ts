import { cleanHtmlContentSimple as cleanHtmlContent, containsHtml, isSnippet } from "./htmlUtils";

/**
 * Sync hash for universal browser/Node.js compatibility.
 * Uses a fast, simple hash algorithm (FNV-1a variant).
 * Produces a 64-character hex string (similar length to SHA-256).
 */
export function hashSync(input: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    let hash = 2166136261 ^ i;
    for (let j = 0; j < input.length; j++) {
      hash ^= input.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
    parts.push((hash >>> 0).toString(16).padStart(8, "0"));
  }
  return parts.join("");
}

export const RSSNormalizer = {
  normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const protocol = parsed.protocol || "https:";
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.replace(/\/+$/, "");
      const search = parsed.search;
      return `${protocol}//${host}${pathname}${search}`;
    } catch {
      return url.trim().replace(/\/+$/, "");
    }
  },

  isUrlMatch(candidate: string, target: string): boolean {
    const normalizedCandidate = RSSNormalizer.normalizeUrl(candidate);
    const normalizedTarget = RSSNormalizer.normalizeUrl(target);

    // Allow scheme-insensitive comparison for http/https mirrors
    const withoutScheme = (value: string) => value.replace(/^https?:\/\//, "");

    if (normalizedCandidate === normalizedTarget) {
      return true;
    }
    if (withoutScheme(normalizedCandidate) === withoutScheme(normalizedTarget)) {
      return true;
    }
    return withoutScheme(normalizedTarget).startsWith(withoutScheme(normalizedCandidate));
  },

  /**
   * Clean content by removing HTML tags and normalizing whitespace.
   * Uses Readability-based cleaning for HTML content.
   */
  cleanContent(content: string): string {
    if (!content) {
      return "";
    }

    // If content contains HTML, use the advanced cleaner
    if (containsHtml(content)) {
      return cleanHtmlContent(content);
    }

    // Plain text: just normalize whitespace
    return content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n") // trim trailing spaces on lines
      .replace(/\n[ \t]+/g, "\n") // trim leading spaces on lines
      .replace(/[ \t]+/g, " ") // collapse intra-line spaces
      .replace(/\n{3,}/g, "\n\n") // cap consecutive newlines at 2
      .trim();
  },

  /**
   * Check if content appears to be a snippet (too short for full article).
   */
  isSnippet(content: string, threshold = 500): boolean {
    return isSnippet(content, threshold);
  },

  /**
   * Normalize a date string to ISO format.
   */
  normalizeDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) {
      return undefined;
    }

    try {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) {
        return undefined;
      }
      return date.toISOString();
    } catch {
      return undefined;
    }
  },

  /**
   * Extract domain from URL.
   */
  extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return "";
    }
  },

  /**
   * Generate a stable ID from URL and optional guid.
   */
  generateStableId(url: string, guid?: string): string {
    const normalizedUrl = url ? RSSNormalizer.normalizeUrl(url) : "";
    const hashSource = guid ? `${guid}::${normalizedUrl || url}` : normalizedUrl || url;
    const hash = hashSync(hashSource || "rss-unknown").slice(0, 16);
    return `rss-${hash}`;
  },
};
