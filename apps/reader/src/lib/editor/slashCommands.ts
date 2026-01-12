/**
 * Slash menu commands for block editor
 * Defines available commands and their metadata
 */

import { wrapInList as pmWrapInList } from "prosemirror-schema-list";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { aiMenuKey } from "./aiMenuPlugin";

export type SlashCommandCategory = "text" | "list" | "media" | "ai" | "advanced";

export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  category: SlashCommandCategory;
  keywords: string[];
  execute: (view: EditorView) => boolean;
};

/**
 * Set block type command factory
 */
function setBlockType(nodeTypeName: string, attrs: Record<string, unknown> = {}): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes[nodeTypeName];
    if (!nodeType) {
      return false;
    }

    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) {
      return false;
    }

    let finalAttrs = attrs;

    // Preserve block_id if operating on a single block
    // LFCC: Annotations are anchored to block_id, so we must preserve it to avoid orphaned annotations
    if (range.endIndex - range.startIndex === 1) {
      const existingNode = range.parent.child(range.startIndex);
      if (existingNode?.attrs.block_id) {
        finalAttrs = { ...finalAttrs, block_id: existingNode.attrs.block_id };
      }
    }

    if (dispatch) {
      dispatch(state.tr.setBlockType(range.start, range.end, nodeType, finalAttrs));
    }
    return true;
  };
}

/**
 * Wrap in list command factory
 * Uses official ProseMirror wrapInList from prosemirror-schema-list
 */
function wrapInList(nodeTypeName: string, attrs?: Record<string, unknown>): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes[nodeTypeName];
    if (!nodeType) {
      return false;
    }
    return pmWrapInList(nodeType, attrs)(state, dispatch);
  };
}

/**
 * Wrap in a block node that contains other blocks (quote, etc.)
 */
function wrapInBlockNode(nodeTypeName: string): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes[nodeTypeName];
    if (!nodeType) {
      return false;
    }

    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) {
      return false;
    }

    if (dispatch) {
      const { tr } = state;
      // Wrap the current block(s) in the wrapper node
      tr.wrap(range, [{ type: nodeType }]);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * Insert horizontal rule command
 */
function insertHorizontalRule(): Command {
  return (state, dispatch) => {
    const nodeType = state.schema.nodes.horizontalRule;
    if (!nodeType) {
      return false;
    }

    if (dispatch) {
      const node = nodeType.create();
      const tr = state.tr.replaceSelectionWith(node);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * Trigger AI Menu with pre-filled prompt
 */
function triggerAIMenu(prompt: string): Command {
  return (state, dispatch, view) => {
    if (dispatch && view) {
      const { selection } = state;
      // text variable removed as it was unused in this scope, logic uses selection for positioning

      // If no text selected, we might want to select the current block?
      // For now, let's assume this command is only useful if there is text or we want to generate new text.
      // If we want to generate, 'text' might be empty context, which is fine.

      const coords = view.coordsAtPos(selection.to);
      if (coords) {
        // We can't directly call the React callback from here easily without a bridge.
        // BUT, we can dispatch a transaction metadata that the AI plugin listens to?
        // OR, we can just use the aiMenuKey to set state directly if the plugin allows external control via meta.

        // Looking at aiMenuPlugin.ts, it listens to selection changes primarily.
        // But we can add a meta-handler to it if we modify it, or we can just rely on the AI Context Menu
        // being smart enough.

        // Actually, the AI Context Menu is a React component that listens to the plugin state.
        // We need a way to "Open AI Menu with Prompt".
        // Let's modify aiMenuPlugin.ts later to handle this, or utilize a custom event/meta?
        // For now, let's assume we can set a meta "aiMenuOpen" with prompt.

        // NOTE: The current aiMenuPlugin does NOT handle custom meta to open.
        // I will trust that the `implementation_plan` implies improving the infrastructure too if needed.
        // However, simply opening the menu logic in `aiMenuPlugin` is selection based.
        // Let's adopt a pattern where we set a special meta that `useLfccBridge` or the context menu component picks up.
        // Actually, the simplest way is to dispatch a meta that the plugin *could* read, OR
        // simply define a "Trigger AI" command that returns true, and we handle the UI side separately?
        // No, `execute` must do something.

        // Let's try to set a meta on the transaction that `AIContextMenu` (via `useLfccEditorContext` -> `view`) could intercept?
        // Wait, `AIContextMenu` renders based on `state`. `state` comes from plugin state.
        // So we MUST update the plugin state.

        // I'll update `aiMenuPlugin.ts` in the next step to handle an "open" meta.
        // Here I will dispatch that meta.
        dispatch(
          state.tr.setMeta(aiMenuKey, {
            type: "open",
            prompt,
            position: { x: coords.left, y: coords.bottom },
          })
        );
      }
    }
    return true;
  };
}

/**
 * Default slash commands
 */
export const defaultSlashCommands: SlashCommand[] = [
  // AI Commands
  {
    id: "ai_summarize",
    label: "Summarize",
    description: "Summarize the selected text or block",
    category: "ai",
    keywords: ["summarize", "tldr", "summary", "shorten"],
    execute: (view) => triggerAIMenu("Summarize this content")(view.state, view.dispatch, view),
  },
  {
    id: "ai_improve",
    label: "Improve Writing",
    description: "Enhance clarity and flow",
    category: "ai",
    keywords: ["improve", "rewrite", "better", "fix"],
    execute: (view) =>
      triggerAIMenu("Improve writing clarity and tone")(view.state, view.dispatch, view),
  },
  {
    id: "ai_fix",
    label: "Fix Formatting",
    description: "Fix grammar and formatting issues",
    category: "ai",
    keywords: ["fix", "grammar", "spelling", "format"],
    execute: (view) => triggerAIMenu("Fix grammar and formatting")(view.state, view.dispatch, view),
  },
  {
    id: "ai_continue",
    label: "Continue Writing",
    description: "Generate more content ",
    category: "ai",
    keywords: ["continue", "generate", "more", "next"],
    execute: (view) => triggerAIMenu("Continue writing from here")(view.state, view.dispatch, view),
  },

  // Text Commands
  {
    id: "text",
    label: "Text",
    description: "Plain text paragraph",
    category: "text",
    keywords: ["text", "paragraph", "p"],
    execute: (view) => {
      const cmd = setBlockType("paragraph");
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "heading1",
    label: "Heading 1",
    description: "Large section heading",
    category: "text",
    keywords: ["heading", "h1", "title"],
    execute: (view) => {
      const cmd = setBlockType("heading", { level: 1 });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "heading2",
    label: "Heading 2",
    description: "Medium section heading",
    category: "text",
    keywords: ["heading", "h2", "subtitle"],
    execute: (view) => {
      const cmd = setBlockType("heading", { level: 2 });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "heading3",
    label: "Heading 3",
    description: "Small section heading",
    category: "text",
    keywords: ["heading", "h3"],
    execute: (view) => {
      const cmd = setBlockType("heading", { level: 3 });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "bulletList",
    label: "Bullet List",
    description: "Create a bullet list",
    category: "list",
    keywords: ["bullet", "list", "ul"],
    execute: (view) => {
      const cmd = wrapInList("list", { listType: "bullet" });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "orderedList",
    label: "Numbered List",
    description: "Create a numbered list",
    category: "list",
    keywords: ["numbered", "ordered", "list", "ol"],
    execute: (view) => {
      const cmd = wrapInList("list", { listType: "ordered" });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "todoList",
    label: "Todo List",
    description: "Create a checkbox task list",
    category: "list",
    keywords: ["todo", "task", "checkbox", "checklist"],
    execute: (view) => {
      // Use flat-block architecture: paragraph with list_type="task"
      const cmd = setBlockType("paragraph", {
        list_type: "task",
        task_checked: false,
        indent_level: 0,
      });
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "quote",
    label: "Quote",
    description: "Create a quote block",
    category: "text",
    keywords: ["quote", "blockquote", "cite"],
    execute: (view) => {
      const cmd = wrapInBlockNode("quote");
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "divider",
    label: "Divider",
    description: "Horizontal divider line",
    category: "advanced",
    keywords: ["divider", "hr", "separator", "line"],
    execute: (view) => {
      const cmd = insertHorizontalRule();
      return cmd(view.state, view.dispatch);
    },
  },
  {
    id: "image",
    label: "Image",
    description: "Insert an image block",
    category: "media",
    keywords: ["image", "img", "picture", "photo"],
    execute: (view) => {
      const { schema, tr } = view.state;
      const imageType = schema.nodes.image;
      if (!imageType) {
        return false;
      }
      // Insert placeholder image node (user can edit src later)
      const node = imageType.create({
        src: "",
        alt: "Image placeholder",
        block_id: `img_${Date.now().toString(36)}`,
      });
      view.dispatch(tr.replaceSelectionWith(node).scrollIntoView());
      return true;
    },
  },
  {
    id: "video",
    label: "Video",
    description: "Insert a video block",
    category: "media",
    keywords: ["video", "movie", "clip"],
    execute: (view) => {
      const { schema, tr } = view.state;
      const videoType = schema.nodes.video;
      if (!videoType) {
        return false;
      }
      const node = videoType.create({
        src: "",
        title: "Video placeholder",
        block_id: `vid_${Date.now().toString(36)}`,
      });
      view.dispatch(tr.replaceSelectionWith(node).scrollIntoView());
      return true;
    },
  },
  {
    id: "embed",
    label: "Embed",
    description: "Embed external content",
    category: "media",
    keywords: ["embed", "iframe", "youtube"],
    execute: (view) => {
      const { schema, tr } = view.state;
      const embedType = schema.nodes.embed;
      if (!embedType) {
        return false;
      }
      const node = embedType.create({
        src: "",
        caption: "Embed placeholder",
        block_id: `embed_${Date.now().toString(36)}`,
      });
      view.dispatch(tr.replaceSelectionWith(node).scrollIntoView());
      return true;
    },
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a 3x3 table",
    category: "advanced",
    keywords: ["table", "grid", "spreadsheet"],
    execute: (view) => {
      const { schema, tr } = view.state;
      const tableType = schema.nodes.table;
      const rowType = schema.nodes.table_row;
      const cellType = schema.nodes.table_cell;
      const paraType = schema.nodes.paragraph;

      if (!tableType || !rowType || !cellType || !paraType) {
        return false;
      }

      // Create 3x3 table
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const cells = [];
        for (let c = 0; c < 3; c++) {
          cells.push(
            cellType.create(
              { block_id: `cell_${Date.now().toString(36)}_${r}_${c}` },
              paraType.create()
            )
          );
        }
        rows.push(rowType.create({ block_id: `row_${Date.now().toString(36)}_${r}` }, cells));
      }
      const table = tableType.create({ block_id: `table_${Date.now().toString(36)}` }, rows);

      view.dispatch(tr.replaceSelectionWith(table).scrollIntoView());
      return true;
    },
  },

  // Export command - triggers export dialog via custom event
  {
    id: "export",
    label: "Export Document",
    description: "Download as Markdown, HTML, or PDF",
    category: "advanced",
    keywords: ["export", "download", "save", "pdf", "markdown", "html"],
    execute: () => {
      // Dispatch custom event that can be listened to by the app
      window.dispatchEvent(new CustomEvent("lfcc:open-export-dialog"));
      return true;
    },
  },
];

/**
 * Filter commands by search query
 */
export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  if (!query.trim()) {
    return commands;
  }

  const lowerQuery = query.toLowerCase();
  return commands.filter((cmd) => {
    return (
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.keywords.some((kw) => kw.toLowerCase().includes(lowerQuery))
    );
  });
}
