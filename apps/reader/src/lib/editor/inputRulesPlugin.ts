import type { Schema } from "prosemirror-model";
import { type EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

// Type for input rule handlers
type InputRuleHandler = (
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string,
  pos: number
) => boolean;

/** Run a series of input rule handlers, returning true on first match */
function runInputRules(
  handlers: InputRuleHandler[],
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  for (const handler of handlers) {
    if (handler(view, state, schema, textBefore, pos)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a plugin that handles Markdown shortcuts on 'Space' key press.
 * This replaces prosemirror-inputrules because handleTextInput was unreliable in this environment.
 */
export function createInputRulesPlugin(schema: Schema) {
  // Define all input rule handlers
  const handlers: InputRuleHandler[] = [
    handleHeading,
    (view, state, schema, textBefore, _pos) =>
      handleHorizontalRule(view, state, schema, textBefore),
    handleTaskList,
    handleList,
    handleOrderedList,
    handleBlockquote,
    handleCodeBlock,
  ];

  return new Plugin({
    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (event.key !== " ") {
          return false;
        }

        const { state } = view;
        const { selection } = state;
        const $from = selection.$from;

        // Only trigger at the end of a textblock
        if (!selection.empty || !$from.parent.isTextblock) {
          return false;
        }

        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 10), // Look back 10 chars is enough for our rules
          $from.parentOffset,
          undefined,
          "\ufffc"
        );

        return runInputRules(handlers, view, state, schema, textBefore, $from.pos);
      },
    },
  });
}

function handleHeading(
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // 1. Headings: # Space
  const headingMatch = textBefore.match(/^(#{1,6})$/);
  if (headingMatch && schema.nodes.heading) {
    const level = headingMatch[1].length;
    const start = pos - headingMatch[0].length;
    const tr = state.tr.delete(start, pos);
    tr.setBlockType(start, start, schema.nodes.heading, { level });
    view.dispatch(tr);
    return true;
  }
  return false;
}

function handleHorizontalRule(
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string
): boolean {
  const hrMatch = textBefore.match(/^---$/);
  if (!hrMatch) {
    return false;
  }

  const nodeType = schema.nodes.horizontalRule;
  if (!nodeType) {
    return false;
  }

  const { $from } = state.selection;
  const range = $from.blockRange();
  if (!range) {
    return false;
  }

  const hrNode = nodeType.create();
  let tr = state.tr.replaceRangeWith(range.start, range.end, hrNode);
  const paragraphType = schema.nodes.paragraph;
  if (paragraphType) {
    const insertPos = tr.mapping.map(range.start) + hrNode.nodeSize;
    tr = tr.insert(insertPos, paragraphType.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

function handleTaskList(
  view: EditorView,
  state: EditorState,
  _schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // Task lists: - [ ] Space (unchecked), - [x] Space (checked)
  // Match full pattern from start of line
  const taskMatch = textBefore.match(/^[-+*]\s*\[([ xX])\]$/);
  if (taskMatch) {
    const isChecked = taskMatch[1].toLowerCase() === "x";
    const start = pos - taskMatch[0].length;
    const { $from } = state.selection;

    // Get current block and update its attributes to become a task list
    const node = $from.parent;
    if (node.type.name === "paragraph") {
      const blockStart = $from.before($from.depth);
      const tr = state.tr.delete(start, pos);

      // Set task list attributes on the paragraph
      tr.setNodeMarkup(blockStart, null, {
        ...node.attrs,
        list_type: "task",
        indent_level: node.attrs.indent_level || 0,
        task_checked: isChecked,
      });

      view.dispatch(tr);
      return true;
    }
  }

  // Also handle converting existing bullet list to task list
  // When user types [ ] or [x] in an existing bullet list item
  const convertMatch = textBefore.match(/^\[([ xX])\]$/);
  if (convertMatch) {
    const { $from } = state.selection;
    const node = $from.parent;

    // Only convert if this is already a bullet list
    if (node.type.name === "paragraph" && node.attrs.list_type === "bullet") {
      const isChecked = convertMatch[1].toLowerCase() === "x";
      const start = pos - convertMatch[0].length;
      const blockStart = $from.before($from.depth);
      const tr = state.tr.delete(start, pos);

      // Convert to task list
      tr.setNodeMarkup(blockStart, null, {
        ...node.attrs,
        list_type: "task",
        task_checked: isChecked,
      });

      view.dispatch(tr);
      return true;
    }
  }

  return false;
}

function handleList(
  view: EditorView,
  state: EditorState,
  _schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // Bullet lists: - Space, * Space, + Space
  const listMatch = textBefore.match(/^([-+*])$/);
  if (listMatch) {
    const start = pos - listMatch[0].length;
    const { $from } = state.selection;

    // Get current block and update its attributes to become a bullet list
    const node = $from.parent;
    if (node.type.name === "paragraph") {
      const blockStart = $from.before($from.depth);
      const tr = state.tr.delete(start, pos);

      // Set list attributes on the paragraph
      tr.setNodeMarkup(blockStart, null, {
        ...node.attrs,
        list_type: "bullet",
        indent_level: node.attrs.indent_level || 0,
      });

      view.dispatch(tr);
      return true;
    }
  }
  return false;
}

function handleOrderedList(
  view: EditorView,
  state: EditorState,
  _schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // Ordered List: 1. Space
  const orderedMatch = textBefore.match(/^(\d+)\.$/);
  if (orderedMatch) {
    const start = pos - orderedMatch[0].length;
    const { $from } = state.selection;

    // Get current block and update its attributes to become an ordered list
    const node = $from.parent;
    if (node.type.name === "paragraph") {
      const blockStart = $from.before($from.depth);
      const tr = state.tr.delete(start, pos);

      // Set list attributes on the paragraph
      tr.setNodeMarkup(blockStart, null, {
        ...node.attrs,
        list_type: "ordered",
        indent_level: node.attrs.indent_level || 0,
      });

      view.dispatch(tr);
      return true;
    }
  }
  return false;
}

function handleBlockquote(
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // 4. Blockquote: > Space
  const quoteMatch = textBefore.match(/^>$/);
  if (quoteMatch) {
    const nodeType = schema.nodes.quote || schema.nodes.blockquote;
    if (nodeType) {
      const start = pos - quoteMatch[0].length;
      const tr = state.tr.delete(start, pos);
      const $start = tr.doc.resolve(start);
      const range = $start.blockRange();
      if (range) {
        try {
          tr.wrap(range, [{ type: nodeType }]);
          view.dispatch(tr);
          return true;
        } catch {
          // Ignore wrap failures
        }
      }
    }
  }
  return false;
}

function handleCodeBlock(
  view: EditorView,
  state: EditorState,
  schema: Schema,
  textBefore: string,
  pos: number
): boolean {
  // 5. Code Block: ``` Space
  const codeMatch = textBefore.match(/^```$/);
  if (codeMatch && schema.nodes.code_block) {
    const start = pos - codeMatch[0].length;
    const tr = state.tr.delete(start, pos);
    tr.setBlockType(start, start, schema.nodes.code_block);
    view.dispatch(tr);
    return true;
  }
  return false;
}
