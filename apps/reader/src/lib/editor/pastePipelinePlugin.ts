import DOMPurify from "dompurify";
import { Plugin, PluginKey } from "prosemirror-state";

export const pastePipelinePluginKey = new PluginKey("pastePipeline");

/**
 * D4: Paste Pipeline Plugin
 * Ensures deterministic normalization of pasted content.
 */
export function createPastePipelinePlugin() {
  return new Plugin({
    key: pastePipelinePluginKey,
    props: {
      transformPastedHTML(html: string) {
        // 1. Normalize whitespace
        let normalized = html.replace(/\u00A0/g, " ");

        // 2. Pre-process specific artifacts (optional)
        // normalized = normalized.replace(/data-pm-slice\s*=\s*["'][^"']*["']/g, "");

        // 3. Sanitization using DOMPurify
        // We configure it to strip unsafe tags/attributes but keep what PM supports.
        normalized = DOMPurify.sanitize(normalized, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ["script", "style", "iframe", "form", "input"],
          FORBID_ATTR: ["style", "data-unsafe", "onmouseover", "onclick"], // Explicitly forbid data-unsafe for testing
          ADD_ATTR: ["data-pm-slice"], // Allow PM slice info if we want to preserve internal copy-paste, but usually better to strip for external
        });

        return normalized;
      },
      transformPastedText(text: string) {
        // Normalize newlines to prevent Windows/Unix diffs
        return text.replace(/\r\n/g, "\n");
      },
    },
  });
}
