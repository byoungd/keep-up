import DOMPurify from "dompurify";
import { Plugin, PluginKey } from "prosemirror-state";

export const pastePipelinePluginKey = new PluginKey("pastePipeline");

const TASK_LIST_ITEM_CLASS = "task-list-item";
const TASK_LIST_ITEM_SELECTOR = "li";
const TASK_CHECKBOX_SELECTOR = 'input[type="checkbox"]';

type TaskAttrs = {
  isTask: boolean;
  isChecked: boolean;
};

function getTaskAttrs(item: HTMLElement, checkbox: HTMLInputElement | null): TaskAttrs {
  if (checkbox) {
    return {
      isTask: true,
      isChecked: checkbox.checked || checkbox.hasAttribute("checked"),
    };
  }

  const checkedAttr =
    item.getAttribute("data-task-checked") ??
    item.getAttribute("data-checked") ??
    item.getAttribute("aria-checked");

  const listType = item.getAttribute("data-list-type");
  const isTask =
    item.classList.contains(TASK_LIST_ITEM_CLASS) || checkedAttr !== null || listType === "task";

  return {
    isTask,
    isChecked: checkedAttr === "true" || checkedAttr === "checked" || checkedAttr === "1",
  };
}

export function normalizeTaskListHtml(html: string): string {
  if (!html || !html.includes("<li") || typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const listItems = Array.from(doc.querySelectorAll(TASK_LIST_ITEM_SELECTOR));

  for (const item of listItems) {
    const checkbox = item.querySelector(TASK_CHECKBOX_SELECTOR) as HTMLInputElement | null;
    const { isTask, isChecked } = getTaskAttrs(item, checkbox);
    if (!isTask) {
      continue;
    }

    item.setAttribute("data-list-type", "task");
    item.setAttribute("data-task-checked", isChecked ? "true" : "false");
    checkbox?.remove();
  }

  return doc.body.innerHTML;
}

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
        normalized = normalizeTaskListHtml(normalized);

        // 2. Pre-process specific artifacts (optional)
        // normalized = normalized.replace(/data-pm-slice\s*=\s*["'][^"']*["']/g, "");

        // 3. Sanitization using DOMPurify
        // We configure it to strip unsafe tags/attributes but keep what PM supports.
        normalized = DOMPurify.sanitize(normalized, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ["script", "style", "iframe", "form", "input"],
          FORBID_ATTR: ["style", "data-unsafe", "onmouseover", "onclick"], // Explicitly forbid data-unsafe for testing
          ADD_ATTR: ["data-pm-slice", "data-list-type", "data-task-checked", "data-indent-level"], // Preserve list/task attrs after normalization
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
