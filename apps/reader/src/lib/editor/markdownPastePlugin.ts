import { DOMParser as PMDOMParser } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { markdownToHtml } from "./markdownToHtml";

export const markdownPastePluginKey = new PluginKey("markdownPaste");

/**
 * Markdown Paste Plugin
 *
 * Detects markdown-formatted text in clipboard and converts it to
 * proper ProseMirror nodes via HTML transformation.
 */
export function createMarkdownPastePlugin() {
  return new Plugin({
    key: markdownPastePluginKey,
    props: {
      handlePaste(view: EditorView, event: ClipboardEvent): boolean {
        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        // Get plain text first
        const text = clipboardData.getData("text/plain");
        if (!text || text.trim().length === 0) {
          return false;
        }

        // Check if it looks like markdown
        const isMarkdown = looksLikeMarkdown(text);
        if (!isMarkdown) {
          return false;
        }

        // If we have HTML, check if it's "rich" HTML or just plain wrapper
        // Rich HTML from apps like Word/Notion will have meaningful tags
        const html = clipboardData.getData("text/html");
        const hasRichHtml = html && isRichHtml(html);

        if (process.env.NODE_ENV === "development") {
          // biome-ignore lint/suspicious/noConsoleLog: Debug logging for paste detection
          console.log("[markdownPastePlugin] Detected markdown:", {
            textLength: text.length,
            htmlLength: html?.length ?? 0,
            isMarkdown,
            hasRichHtml,
            htmlPreview: html?.slice(0, 200),
          });
        }

        if (hasRichHtml) {
          // Let the default handler process rich HTML
          return false;
        }

        // Convert markdown to HTML and insert
        return insertMarkdownAsHtml(view, text);
      },
    },
  });
}

/**
 * Check if HTML contains rich formatting from editors like Word, Notion, etc.
 * Returns true only for HTML that has actual semantic formatting.
 * Simple wrappers with just <p>, <div>, <span> are not considered rich.
 */
function isRichHtml(html: string): boolean {
  // Rich HTML indicators - actual formatting that we should preserve
  const richPatterns = [
    /<(strong|b|em|i|u|s|strike|del)[\s>]/i, // Inline formatting
    /<(h[1-6]|blockquote|pre|code|ul|ol|li|table)[\s>]/i, // Semantic block elements
    /<a\s+href/i, // Links with hrefs
    /<img\s+src/i, // Images with sources
    /mso-/i, // Microsoft Office markers
    /data-notion/i, // Notion markers
  ];

  for (const pattern of richPatterns) {
    if (pattern.test(html)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if text looks like markdown content.
 * We look for common markdown patterns.
 */
function looksLikeMarkdown(text: string): boolean {
  const lines = text.split("\n");

  // Patterns that indicate markdown
  const patterns = [
    /^#{1,6}\s+.+/, // Headings: # Title
    /^\s*[-*+]\s+.+/, // Unordered list: - item
    /^\s*\d+\.\s+.+/, // Ordered list: 1. item
    /^\s*>\s+.+/, // Blockquote: > text
    /^\s*```/, // Code block: ```
    /\*\*.+\*\*/, // Bold: **text**
    /\*.+\*/, // Italic: *text*
    /__.+__/, // Bold: __text__
    /_.+_/, // Italic: _text_
    /~~.+~~/, // Strikethrough: ~~text~~
    /`[^`]+`/, // Inline code: `code`
    /\[.+\]\(.+\)/, // Link: [text](url)
    /!\[.*\]\(.+\)/, // Image: ![alt](url)
  ];

  let matchCount = 0;

  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        matchCount++;
        if (matchCount >= 2) {
          return true;
        }
        break; // Only count one pattern per line
      }
    }
  }

  // If the text has multiple paragraphs and at least one pattern, consider it markdown
  if (matchCount >= 1 && lines.length > 3) {
    return true;
  }

  return false;
}

/**
 * Insert markdown content as HTML into the editor.
 */
function insertMarkdownAsHtml(view: EditorView, text: string): boolean {
  try {
    // Convert markdown to HTML
    const convertedHtml = markdownToHtml(text);

    // Create a temporary DOM element to parse the HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = convertedHtml;

    // Parse the HTML into a ProseMirror document
    const { schema } = view.state;
    const parser = PMDOMParser.fromSchema(schema);
    const doc = parser.parse(tempDiv);
    const slice = doc.slice(0, doc.content.size);

    // Insert the parsed content
    const tr = view.state.tr.replaceSelection(slice);
    view.dispatch(tr);

    return true;
  } catch (err) {
    console.warn("[markdownPastePlugin] Failed to parse markdown:", err);
    return false;
  }
}
