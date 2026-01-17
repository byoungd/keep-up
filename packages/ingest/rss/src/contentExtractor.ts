/**
 * Content Extractor
 *
 * Uses Mozilla Readability to extract clean article content from HTML.
 * This is used as a fallback when RSS content is incomplete or contains
 * too much HTML noise.
 */

import { observability } from "@ku0/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  byline: string;
  siteName: string;
  length: number;
}

export interface ExtractOptions {
  /** Base URL for resolving relative links */
  baseUrl?: string;
  /** Minimum content length to consider extraction successful */
  minContentLength?: number;
}

const DEFAULT_MIN_CONTENT_LENGTH = 100;
const logger = observability.getLogger();

/**
 * Extract clean article content from HTML using Mozilla Readability.
 */
export function extractFromHtml(
  html: string,
  options: ExtractOptions = {}
): ExtractedContent | null {
  const { baseUrl, minContentLength = DEFAULT_MIN_CONTENT_LENGTH } = options;

  try {
    const dom = new JSDOM(html, { url: baseUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return null;
    }

    // Check if content meets minimum length
    const textContent = article.textContent?.trim() ?? "";
    if (textContent.length < minContentLength) {
      return null;
    }

    return {
      title: article.title ?? "",
      content: textContent,
      excerpt: article.excerpt ?? "",
      byline: article.byline ?? "",
      siteName: article.siteName ?? "",
      length: textContent.length,
    };
  } catch (error) {
    logger.warn("ingest", "Failed to extract content", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Clean HTML content by removing tags but preserving text structure.
 * Used for RSS content that contains HTML but doesn't need full Readability parsing.
 */
export function cleanHtmlContent(html: string): string {
  if (!html) {
    return "";
  }

  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove unwanted elements
    const unwantedSelectors = [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "aside",
      "iframe",
      "noscript",
      ".advertisement",
      ".ad",
      ".social-share",
      ".comments",
    ];

    for (const selector of unwantedSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        el.remove();
      }
    }

    // Get text content with paragraph breaks preserved
    const body = document.body;
    if (!body) {
      return html.trim();
    }

    // Convert block elements to newlines
    const blockElements = body.querySelectorAll("p, div, br, h1, h2, h3, h4, h5, h6, li");
    for (const el of blockElements) {
      if (el.tagName === "BR") {
        el.replaceWith("\n");
      } else {
        // Add newlines around block elements
        el.insertAdjacentText("beforebegin", "\n");
        el.insertAdjacentText("afterend", "\n");
      }
    }

    // Get text and normalize whitespace
    let text = body.textContent ?? "";

    // Normalize whitespace: collapse multiple spaces, preserve paragraph breaks
    text = text
      .replace(/[ \t]+/g, " ") // Collapse horizontal whitespace
      .replace(/\n[ \t]+/g, "\n") // Remove leading whitespace on lines
      .replace(/[ \t]+\n/g, "\n") // Remove trailing whitespace on lines
      .replace(/\n{3,}/g, "\n\n") // Collapse multiple newlines to max 2
      .trim();

    return text;
  } catch (error) {
    logger.warn("ingest", "Failed to clean HTML", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback: simple tag stripping
    return stripHtmlTags(html);
  }
}

/**
 * Simple HTML tag stripping fallback.
 */
function stripHtmlTags(html: string): string {
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
