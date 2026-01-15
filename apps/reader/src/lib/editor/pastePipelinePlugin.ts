import DOMPurify from "dompurify";
import { Plugin, PluginKey } from "prosemirror-state";

export const pastePipelinePluginKey = new PluginKey("pastePipeline");

const TASK_LIST_ITEM_CLASS = "task-list-item";
const TASK_LIST_ITEM_SELECTOR = "li";
const TASK_CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const TASK_ARIA_CHECKBOX_SELECTOR = '[role="checkbox"]';
const TASK_MARKER_PATTERN = /^\s*([\u2610\u2611\u2713])\s+/;
const TASK_MARKER_CHARS = new Set(["\u2610", "\u2611", "\u2713"]);
const LIST_CONTAINER_TAGS = new Set(["UL", "OL"]);

type TaskAttrs = {
  isTask: boolean;
  isChecked: boolean;
  hasMarker: boolean;
};

function findCheckboxElement(item: HTMLElement): HTMLInputElement | null {
  for (const child of Array.from(item.children)) {
    if (LIST_CONTAINER_TAGS.has(child.tagName)) {
      continue;
    }
    if (child.tagName === "INPUT" && (child as HTMLInputElement).type === "checkbox") {
      return child as HTMLInputElement;
    }
    const nested = child.querySelector(TASK_CHECKBOX_SELECTOR);
    if (nested instanceof HTMLInputElement) {
      return nested;
    }
  }
  return null;
}

function findAriaCheckboxElement(item: HTMLElement): HTMLElement | null {
  for (const child of Array.from(item.children)) {
    if (LIST_CONTAINER_TAGS.has(child.tagName)) {
      continue;
    }
    if (child instanceof HTMLElement && child.getAttribute("role") === "checkbox") {
      return child;
    }
    const nested = child.querySelector(TASK_ARIA_CHECKBOX_SELECTOR);
    if (nested instanceof HTMLElement) {
      return nested;
    }
  }
  return null;
}

function readTaskMarker(item: HTMLElement): { hasMarker: boolean; isChecked: boolean } {
  const textNode = findDirectTextNode(item);
  const text = textNode?.data ?? "";
  const match = text.match(TASK_MARKER_PATTERN);
  if (!match) {
    return { hasMarker: false, isChecked: false };
  }
  const marker = match[1];
  return { hasMarker: true, isChecked: marker !== "\u2610" };
}

function stripTaskMarker(item: HTMLElement): void {
  const textNode = findDirectTextNode(item);
  if (!textNode) {
    return;
  }
  const match = textNode.data.match(TASK_MARKER_PATTERN);
  if (!match) {
    return;
  }
  textNode.data = textNode.data.replace(TASK_MARKER_PATTERN, "");
}

function shouldRemoveCheckboxElement(element: HTMLElement): boolean {
  const text = element.textContent?.trim() ?? "";
  return text.length === 0 || TASK_MARKER_CHARS.has(text);
}

function findDirectTextNode(item: HTMLElement): Text | null {
  const doc = item.ownerDocument;
  if (!doc) {
    return null;
  }
  const walker = doc.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode() as Text | null;

  while (current) {
    if (current.data.trim().length > 0 && !isInsideList(current, item)) {
      return current;
    }
    current = walker.nextNode() as Text | null;
  }

  return null;
}

function isInsideList(node: Text, root: HTMLElement): boolean {
  let parent = node.parentElement;
  while (parent && parent !== root) {
    if (LIST_CONTAINER_TAGS.has(parent.tagName)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function getTaskAttrs(item: HTMLElement): TaskAttrs {
  const checkbox = findCheckboxElement(item);
  if (checkbox) {
    return {
      isTask: true,
      isChecked: checkbox.checked || checkbox.hasAttribute("checked"),
      hasMarker: false,
    };
  }

  const ariaCheckbox = findAriaCheckboxElement(item);
  const ariaChecked = ariaCheckbox?.getAttribute("aria-checked");
  if (ariaChecked !== null && ariaChecked !== undefined) {
    return {
      isTask: true,
      isChecked: ariaChecked === "true" || ariaChecked === "mixed",
      hasMarker: false,
    };
  }

  const checkedAttr =
    item.getAttribute("data-task-checked") ??
    item.getAttribute("data-checked") ??
    item.getAttribute("aria-checked");

  const listType = item.getAttribute("data-list-type");
  const marker = readTaskMarker(item);
  const isTask =
    item.classList.contains(TASK_LIST_ITEM_CLASS) ||
    checkedAttr !== null ||
    listType === "task" ||
    marker.hasMarker;

  return {
    isTask,
    isChecked:
      checkedAttr === "true" ||
      checkedAttr === "checked" ||
      checkedAttr === "1" ||
      marker.isChecked,
    hasMarker: marker.hasMarker,
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
    const { isTask, isChecked, hasMarker } = getTaskAttrs(item);
    if (!isTask) {
      continue;
    }

    item.setAttribute("data-list-type", "task");
    item.setAttribute("data-task-checked", isChecked ? "true" : "false");
    const checkbox = findCheckboxElement(item);
    checkbox?.remove();
    const ariaCheckbox = findAriaCheckboxElement(item);
    if (ariaCheckbox && shouldRemoveCheckboxElement(ariaCheckbox)) {
      ariaCheckbox.remove();
    }
    if (hasMarker) {
      stripTaskMarker(item);
    }
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
