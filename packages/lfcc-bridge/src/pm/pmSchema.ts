import { type MarkSpec, type NodeSpec, Schema } from "prosemirror-model";

import { serializeAttrs } from "../crdt/crdtSchema";

const baseBlockAttrs = {
  block_id: { default: "" },
  attrs: { default: serializeAttrs({}) },
};

/** Extended attrs for paragraph blocks that support list behavior */
const listCapableBlockAttrs = {
  ...baseBlockAttrs,
  list_type: { default: null as "bullet" | "ordered" | "task" | null },
  indent_level: { default: 0 },
  task_checked: { default: false },
};

const blockAttrsFromDom = (dom: HTMLElement): { block_id?: string; attrs?: string } => {
  const blockId = dom.getAttribute("data-block-id") ?? "";
  const attrs = dom.getAttribute("data-attrs") ?? undefined;
  return { block_id: blockId, attrs };
};

/** Extract list attrs from DOM for parsing HTML lists */
const listAttrsFromDom = (
  dom: HTMLElement,
  listType: "bullet" | "ordered" | "task"
): Record<string, unknown> => {
  // Walk up to find the indent level by counting nested lists
  let indent = 0;
  let parent = dom.parentElement;
  while (parent) {
    if (parent.tagName === "UL" || parent.tagName === "OL") {
      indent++;
    }
    parent = parent.parentElement;
  }
  // First level is indent 0
  indent = Math.max(0, indent - 1);

  return {
    ...blockAttrsFromDom(dom),
    list_type: listType,
    indent_level: indent,
  };
};

const paragraph: NodeSpec = {
  group: "block",
  content: "inline*",
  attrs: listCapableBlockAttrs,
  parseDOM: [
    {
      tag: "p",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          ...blockAttrsFromDom(el),
          // Retain list attributes if self-pasting or explicit
          list_type: el.getAttribute("data-list-type") || null,
          indent_level: Number(el.getAttribute("data-indent-level")) || 0,
          task_checked: el.getAttribute("data-task-checked") === "true",
        };
      },
    },
    // Parse li as paragraph with list_type (flat block architecture)
    {
      tag: "li",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const parent = el.parentElement;

        let listType = "bullet";
        if (parent?.tagName === "OL") {
          listType = "ordered";
        }

        // If it specifically has checkbox data, it's a task
        if (el.hasAttribute("data-task-checked") || el.getAttribute("data-list-type") === "task") {
          listType = "task";
        }

        return {
          ...listAttrsFromDom(el, listType as "bullet" | "ordered" | "task"),
          task_checked: el.getAttribute("data-task-checked") === "true",
        };
      },
      // Higher priority than default
      priority: 60,
    },
  ],
  toDOM: (node) => {
    // When list_type is set, we still render as div (BlockNodeView handles visual)
    // This ensures flat structure in ProseMirror
    return [
      "div",
      {
        "data-block-id": node.attrs.block_id,
        "data-attrs": node.attrs.attrs,
        "data-list-type": node.attrs.list_type || undefined,
        "data-indent-level": node.attrs.indent_level || undefined,
        "data-task-checked": node.attrs.list_type === "task" ? node.attrs.task_checked : undefined,
      },
      0,
    ];
  },
};

const heading: NodeSpec = {
  group: "block",
  content: "inline*",
  attrs: {
    ...baseBlockAttrs,
    level: { default: 1 },
  },
  parseDOM: [
    {
      tag: "h1",
      getAttrs: (dom) => ({ ...blockAttrsFromDom(dom as HTMLElement), level: 1 }),
    },
    {
      tag: "h2",
      getAttrs: (dom) => ({ ...blockAttrsFromDom(dom as HTMLElement), level: 2 }),
    },
    {
      tag: "h3",
      getAttrs: (dom) => ({ ...blockAttrsFromDom(dom as HTMLElement), level: 3 }),
    },
  ],
  toDOM: (node) => [
    `h${node.attrs.level}`,
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
    },
    0,
  ],
};

const quote: NodeSpec = {
  group: "block",
  content: "block+",
  attrs: baseBlockAttrs,
  parseDOM: [
    {
      tag: "blockquote",
      getAttrs: (dom) => blockAttrsFromDom(dom as HTMLElement),
    },
  ],
  toDOM: (node) => [
    "blockquote",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
    },
    0,
  ],
};

const codeBlock: NodeSpec = {
  group: "block",
  content: "text*",
  marks: "",
  attrs: {
    ...baseBlockAttrs,
    language: { default: null as string | null },
  },
  parseDOM: [
    {
      tag: "pre",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        const base = blockAttrsFromDom(el);

        // Extract language from data attribute or code > class="language-xyz"
        let language = el.getAttribute("data-language");
        if (!language) {
          const code = el.querySelector("code");
          if (code) {
            const cls = code.className || "";
            // Match standard Prism/HighlightJS patterns
            const match = cls.match(/language-(\w+)/) || cls.match(/lang-(\w+)/);
            if (match) {
              language = match[1];
            }
          }
        }

        return {
          ...base,
          language: language || null,
        };
      },
    },
  ],
  toDOM: (node) => [
    "pre",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      "data-language": node.attrs.language,
    },
    ["code", 0],
  ],
};

const horizontalRule: NodeSpec = {
  group: "block",
  attrs: baseBlockAttrs,
  parseDOM: [
    {
      tag: "hr",
      getAttrs: (dom) => blockAttrsFromDom(dom as HTMLElement),
    },
  ],
  toDOM: (node) => [
    "hr",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
    },
  ],
};

const table: NodeSpec = {
  group: "block",
  content: "table_row+",
  tableRole: "table",
  attrs: baseBlockAttrs,
  parseDOM: [
    {
      tag: "table",
      getAttrs: (dom) => blockAttrsFromDom(dom as HTMLElement),
    },
  ],
  toDOM: (node) => [
    "table",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
    },
    ["tbody", 0],
  ],
};

const tableRow: NodeSpec = {
  group: "block",
  content: "table_cell+",
  tableRole: "row",
  attrs: baseBlockAttrs,
  parseDOM: [
    {
      tag: "tr",
      getAttrs: (dom) => blockAttrsFromDom(dom as HTMLElement),
    },
  ],
  toDOM: (node) => [
    "tr",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
    },
    0,
  ],
};

const tableCell: NodeSpec = {
  group: "block",
  content: "block+",
  tableRole: "cell",
  attrs: {
    ...baseBlockAttrs,
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
    background: { default: null },
  },
  parseDOM: [
    {
      tag: "td",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          ...blockAttrsFromDom(el),
          colspan: Number(el.getAttribute("colspan") || 1),
          rowspan: Number(el.getAttribute("rowspan") || 1),
          colwidth: el.getAttribute("data-colwidth")
            ? el.getAttribute("data-colwidth")?.split(",").map(Number)
            : null,
          background: el.style.backgroundColor || null,
        };
      },
    },
  ],
  toDOM: (node) => [
    "td",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      colspan: node.attrs.colspan !== 1 ? node.attrs.colspan : undefined,
      rowspan: node.attrs.rowspan !== 1 ? node.attrs.rowspan : undefined,
      "data-colwidth": node.attrs.colwidth ? node.attrs.colwidth.join(",") : undefined,
      style: node.attrs.background ? `background-color: ${node.attrs.background}` : undefined,
    },
    0,
  ],
};

const image: NodeSpec = {
  group: "block",
  attrs: {
    ...baseBlockAttrs,
    src: { default: "" },
    alt: { default: "" },
    title: { default: "" },
  },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => ({
        ...blockAttrsFromDom(dom as HTMLElement),
        src: (dom as HTMLElement).getAttribute("src") ?? "",
        alt: (dom as HTMLElement).getAttribute("alt") ?? "",
        title: (dom as HTMLElement).getAttribute("title") ?? "",
      }),
    },
  ],
  toDOM: (node) => [
    "img",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      src: node.attrs.src,
      alt: node.attrs.alt,
      title: node.attrs.title,
      style: "max-width: 100%; height: auto;",
    },
  ],
};

const video: NodeSpec = {
  group: "block",
  attrs: {
    ...baseBlockAttrs,
    src: { default: "" },
    controls: { default: true },
    title: { default: "" },
  },
  parseDOM: [
    {
      tag: "video[src]",
      getAttrs: (dom) => ({
        ...blockAttrsFromDom(dom as HTMLElement),
        src: (dom as HTMLElement).getAttribute("src") ?? "",
        controls: (dom as HTMLElement).hasAttribute("controls"),
        title: (dom as HTMLElement).getAttribute("title") ?? "",
      }),
    },
  ],
  toDOM: (node) => [
    "video",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      src: node.attrs.src,
      controls: node.attrs.controls ? "" : undefined,
      title: node.attrs.title,
      style: "max-width: 100%; height: auto;",
    },
  ],
};

const embed: NodeSpec = {
  group: "block",
  attrs: {
    ...baseBlockAttrs,
    src: { default: "" },
    caption: { default: "" },
  },
  parseDOM: [
    {
      tag: "div[data-type=embed]",
      getAttrs: (dom) => ({
        ...blockAttrsFromDom(dom as HTMLElement),
        src: (dom as HTMLElement).getAttribute("data-src") ?? "",
        caption: (dom as HTMLElement).getAttribute("data-caption") ?? "",
      }),
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      "data-type": "embed",
      "data-src": node.attrs.src,
      "data-caption": node.attrs.caption,
    },
    ["iframe", { src: node.attrs.src, style: "width: 100%; height: 300px; border: none;" }],
  ],
};

/**
 * Message block for chat-as-document support.
 * Wraps content blocks with chat message semantics (role, timestamp, streaming).
 */
const message: NodeSpec = {
  group: "block",
  content: "block+",
  attrs: {
    ...baseBlockAttrs,
    /** Message role: user, assistant, or system */
    role: { default: "assistant" as "user" | "assistant" | "system" },
    /** Unique message identifier */
    message_id: { default: "" },
    /** Timestamp when message was created */
    timestamp: { default: 0 },
    /** Whether the message is currently streaming */
    streaming: { default: false },
    /** Model that generated this message (for assistant messages) */
    model: { default: null as string | null },
  },
  parseDOM: [
    {
      tag: "div[data-type=message]",
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          ...blockAttrsFromDom(el),
          role: el.getAttribute("data-role") ?? "assistant",
          message_id: el.getAttribute("data-message-id") ?? "",
          timestamp: Number(el.getAttribute("data-timestamp")) || 0,
          streaming: el.getAttribute("data-streaming") === "true",
          model: el.getAttribute("data-model") ?? null,
        };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-block-id": node.attrs.block_id,
      "data-attrs": node.attrs.attrs,
      "data-type": "message",
      "data-role": node.attrs.role,
      "data-message-id": node.attrs.message_id,
      "data-timestamp": String(node.attrs.timestamp),
      "data-streaming": node.attrs.streaming ? "true" : undefined,
      "data-model": node.attrs.model ?? undefined,
    },
    0,
  ],
};

const nodes = {
  doc: {
    content: "block+",
  },
  text: {
    group: "inline",
  },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"] as const,
  },
  paragraph,
  heading,
  // list and list_item removed - flat block architecture
  // Lists are now paragraphs with list_type attribute
  quote,
  code_block: codeBlock,
  horizontalRule,
  table,
  table_row: tableRow,
  table_cell: tableCell,
  image,
  video,
  embed,
  message,
};

const bold: MarkSpec = {
  parseDOM: [{ tag: "strong" }, { tag: "b", getAttrs: () => null }],
  toDOM: () => ["strong", 0],
};

const italic: MarkSpec = {
  parseDOM: [{ tag: "em" }, { tag: "i", getAttrs: () => null }],
  toDOM: () => ["em", 0],
};

const underline: MarkSpec = {
  parseDOM: [{ tag: "u" }],
  toDOM: () => ["u", 0],
};

const strike: MarkSpec = {
  parseDOM: [{ tag: "s" }, { tag: "del" }],
  toDOM: () => ["s", 0],
};

const code: MarkSpec = {
  parseDOM: [{ tag: "code" }],
  toDOM: () => ["code", 0],
};

const link: MarkSpec = {
  attrs: {
    href: { default: "" },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs: (dom) => ({
        href: (dom as HTMLElement).getAttribute("href") ?? "",
      }),
    },
  ],
  toDOM: (node) => ["a", { href: node.attrs.href }, 0],
};

const marks = {
  bold,
  italic,
  underline,
  strike,
  code,
  link,
};

export const pmSchema = new Schema({ nodes, marks });
