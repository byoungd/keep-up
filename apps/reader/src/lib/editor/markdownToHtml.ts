export function markdownToHtml(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  const state = {
    inCodeBlock: false,
    codeBlockContent: [] as string[],
    codeBlockLanguage: undefined as string | undefined, // Track language
    inList: false,
    listType: "ul" as "ul" | "ol",
    listItems: [] as string[],
  };

  for (const line of lines) {
    processLine(line, state, result);
  }

  // Flush remaining content
  flushCodeBlock(state, result);
  flushList(state, result);

  return result.join("\n");
}

function processLine(
  line: string,
  state: {
    inCodeBlock: boolean;
    codeBlockContent: string[];
    codeBlockLanguage?: string;
    inList: boolean;
    listType: "ul" | "ol";
    listItems: string[];
  },
  result: string[]
): void {
  // Code block toggle
  if (line.trim().startsWith("```")) {
    if (state.inCodeBlock) {
      flushCodeBlock(state, result);
    } else {
      flushList(state, result);
      state.inCodeBlock = true;
      // Extract language if present
      const match = line.trim().match(/^```(\w+)/);
      state.codeBlockLanguage = match ? match[1] : undefined;
    }
    return;
  }

  if (state.inCodeBlock) {
    state.codeBlockContent.push(line);
    return;
  }

  // Try each block type
  if (tryHeading(line, state, result)) {
    return;
  }
  if (tryBlockquote(line, state, result)) {
    return;
  }
  if (tryUnorderedList(line, state)) {
    return;
  }
  if (tryOrderedList(line, state)) {
    return;
  }

  // Check for list continuation (indented line following a list item)
  if (tryListContinuation(line, state)) {
    return;
  }

  // Empty line
  if (line.trim() === "") {
    flushList(state, result);
    return;
  }

  // Regular paragraph
  flushList(state, result);
  result.push(`<p>${processInline(line)}</p>`);
}

function flushCodeBlock(
  state: { inCodeBlock: boolean; codeBlockContent: string[]; codeBlockLanguage?: string },
  result: string[]
): void {
  if (state.inCodeBlock && state.codeBlockContent.length > 0) {
    const langObj = state.codeBlockLanguage ? ` class="language-${state.codeBlockLanguage}"` : "";
    // Output code with language class for schema parser
    result.push(
      `<pre><code${langObj}>${escapeHtml(state.codeBlockContent.join("\n"))}</code></pre>`
    );
  }
  state.codeBlockContent = [];
  state.codeBlockLanguage = undefined;
  state.inCodeBlock = false;
}

function flushList(
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] },
  result: string[]
): void {
  if (state.inList && state.listItems.length > 0) {
    result.push(`<${state.listType}>`);
    for (const item of state.listItems) {
      // Check for task marker
      let content = item;
      let taskAttrs = "";

      if (item.startsWith("__TASK:")) {
        const endMarker = item.indexOf("__", 7);
        if (endMarker !== -1) {
          const checked = item.substring(7, endMarker) === "true";
          content = item.substring(endMarker + 2);
          taskAttrs = ` data-list-type="task" data-task-checked="${checked}"`;
        }
      }

      // No <p> wrapper - the flat-list schema parses <li> directly as paragraph
      // We add task attributes to the li, which our enhanced schema parser will read
      result.push(`<li${taskAttrs}>${processInline(content)}</li>`);
    }
    result.push(`</${state.listType}>`);
  }
  state.listItems = [];
  state.inList = false;
}

function tryHeading(
  line: string,
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] },
  result: string[]
): boolean {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  if (match) {
    flushList(state, result);
    result.push(`<h${match[1].length}>${processInline(match[2])}</h${match[1].length}>`);
    return true;
  }
  return false;
}

function tryBlockquote(
  line: string,
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] },
  result: string[]
): boolean {
  const match = line.match(/^\s*>\s*(.*)$/);
  if (match) {
    flushList(state, result);
    result.push(`<blockquote><p>${processInline(match[1])}</p></blockquote>`);
    return true;
  }
  return false;
}

function tryUnorderedList(
  line: string,
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] }
): boolean {
  const match = line.match(/^\s*([-*+])\s+(.+)$/);
  if (match) {
    let content = match[2];

    // Check for task list: - [ ] or - [x]
    const taskMatch = content.match(/^\[([ xX])\]\s+(.+)$/);
    let isTask = false;
    let isChecked = false;

    if (taskMatch) {
      isTask = true;
      isChecked = taskMatch[1].toLowerCase() === "x";
      content = taskMatch[2]; // Strip the [ ] part
    }

    if (!state.inList || state.listType !== "ul") {
      state.inList = true;
      state.listType = "ul";
    }

    // Store as object if it's a task, or string if simple (need to update state type)
    // Actually, let's keep it simple string but embed the metadata in a way processInline can handle?
    // OR we change how we store listItems.
    // Hack: Prepend a marker that flushList can detect?
    // Better: change flushList to handle this.
    // But modifying state type requires modifying the whole file.
    // Let's use a special prefix string that flushList detects.
    if (isTask) {
      state.listItems.push(`__TASK:${isChecked}__${content}`);
    } else {
      state.listItems.push(content);
    }
    return true;
  }
  return false;
}

function tryOrderedList(
  line: string,
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] }
): boolean {
  const match = line.match(/^\s*\d+\.\s+(.+)$/);
  if (match) {
    if (!state.inList || state.listType !== "ol") {
      state.inList = true;
      state.listType = "ol";
    }
    state.listItems.push(match[1]);
    return true;
  }
  return false;
}

/**
 * Handle continuation lines for multi-line list items.
 * A continuation line is an indented line that follows a list item.
 * Example:
 *   1. First line of list item
 *      continuation of the same item
 */
function tryListContinuation(
  line: string,
  state: { inList: boolean; listType: "ul" | "ol"; listItems: string[] }
): boolean {
  // Only applies when we're already in a list
  if (!state.inList || state.listItems.length === 0) {
    return false;
  }

  // Check if line is indented (starts with whitespace but has content)
  // Continuation lines typically have 2+ spaces or a tab at the start
  const match = line.match(/^(\s{2,}|\t)(.+)$/);
  if (match) {
    const content = match[2].trim();
    if (content) {
      // Append to the last list item with a space separator
      const lastIndex = state.listItems.length - 1;
      state.listItems[lastIndex] = `${state.listItems[lastIndex]} ${content}`;
      return true;
    }
  }

  return false;
}

function processInline(text: string): string {
  let result = escapeHtml(text);

  // Images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_ (but not inside words for underscore)
  result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  result = result.replace(/(?<![a-zA-Z])_([^_]+)_(?![a-zA-Z])/g, "<em>$1</em>");

  // Strikethrough: ~~text~~
  result = result.replace(/~~([^~]+)~~/g, "<s>$1</s>");

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
