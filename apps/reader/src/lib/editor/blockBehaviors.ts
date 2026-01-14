import { LFCC_STRUCTURAL_META, type LoroRuntime, nextBlockId } from "@ku0/lfcc-bridge";
import { chainCommands, deleteSelection, exitCode, joinBackward } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import type { Command, Plugin, Transaction } from "prosemirror-state";
import { Selection, TextSelection } from "prosemirror-state";

type ListType = "bullet" | "ordered" | "task" | null;

/** Check if current block is a list block */
function isListBlock(attrs: Record<string, unknown>): boolean {
  return (
    attrs.list_type === "bullet" || attrs.list_type === "ordered" || attrs.list_type === "task"
  );
}

/** Max indent level allowed */
const MAX_INDENT = 6;

const markStructural = (tr: Transaction): Transaction => tr.setMeta(LFCC_STRUCTURAL_META, true);

/**
 * Clean list-related properties from the serialized attrs JSON string.
 * The `attrs` field is a JSON string that may contain stale list_type values
 * that must be removed when exiting a list.
 */
function cleanAttrsForListExit(attrsStr: unknown): string {
  if (typeof attrsStr !== "string") {
    return "{}";
  }
  try {
    const parsed = JSON.parse(attrsStr || "{}");
    // Use destructuring to avoid delete operator (lint error)
    const { list_type: _lt, indent_level: _il, task_checked: _tc, ...rest } = parsed;
    return JSON.stringify(rest);
  } catch {
    return "{}";
  }
}

/**
 * Handle Enter key in flat block architecture:
 * - In list: create new list block with same type/indent
 * - Empty list block: exit list (convert to paragraph)
 * - Regular block: split and create new block
 */
export const handleEnter =
  (runtime: LoroRuntime): Command =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: enter handling merges multiple block behaviors and selection cases
  (state, dispatch) => {
    const { selection, schema } = state;
    const { $from } = selection;

    if (!$from.parent.isBlock) {
      return false;
    }

    const parent = $from.parent;
    const parentAttrs = parent.attrs;
    const listType = parentAttrs.list_type as ListType;
    const indentLevel = (parentAttrs.indent_level as number) || 0;

    // Check if we're in a list block
    if (isListBlock(parentAttrs)) {
      // Empty list block + Enter = exit list
      // Note: check textContent too in case of zero-width chars or schema artifacts
      if (parent.content.size === 0 || parent.textContent.trim() === "") {
        if (dispatch) {
          const blockStart = $from.before();
          let tr = state.tr.setNodeMarkup(blockStart, schema.nodes.paragraph, {
            block_id: parentAttrs.block_id,
            attrs: cleanAttrsForListExit(parentAttrs.attrs),
            list_type: null,
            indent_level: 0,
            task_checked: false,
          });
          // Use Selection.near() to find valid cursor position in the modified document
          const $pos = tr.doc.resolve(blockStart + 1);
          tr = tr.setSelection(Selection.near($pos));
          markStructural(tr);
          dispatch(tr.scrollIntoView());
        }
        return true;
      }

      // Non-empty list block: create new list block with same type/indent
      if (dispatch) {
        let tr = state.tr;
        if (!selection.empty) {
          tr = tr.deleteSelection();
        }

        const newAttrs = {
          block_id: nextBlockId(runtime.doc),
          attrs: "{}",
          list_type: listType,
          indent_level: indentLevel,
          task_checked: false, // New task items start unchecked
        };

        const splitPos = tr.selection.$from.pos;
        tr = tr.split(splitPos, 1, [{ type: schema.nodes.paragraph, attrs: newAttrs }]);

        // CRITICAL FIX: Explicitly set cursor to start of new block
        // After split, position splitPos+1 is at the start of the new block node.
        // Selection.near with bias=1 moves forward into the text content.
        const $newBlockStart = tr.doc.resolve(splitPos + 1);
        tr = tr.setSelection(TextSelection.near($newBlockStart, 1));

        markStructural(tr);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    // Regular block: standard split behavior
    if (dispatch) {
      let tr = state.tr;
      if (!selection.empty) {
        tr = tr.deleteSelection();
      }

      let newType = parent.type;
      let newAttrs = { ...parentAttrs };

      // Heading splits into paragraph
      if (parent.type.name === "heading") {
        newType = schema.nodes.paragraph;
        const { level, ...rest } = newAttrs;
        newAttrs = rest;
      }

      newAttrs.block_id = nextBlockId(runtime.doc);

      const splitPos = tr.selection.$from.pos;
      tr = tr.split(splitPos, 1, [{ type: newType, attrs: newAttrs }]);

      // CRITICAL FIX: Explicitly set cursor to start of new block
      // After split, position splitPos+1 is at the start of the new block node.
      // Selection.near with bias=1 moves forward into the text content.
      const $newBlockStart = tr.doc.resolve(splitPos + 1);
      tr = tr.setSelection(TextSelection.near($newBlockStart, 1));

      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * Handle Tab key: Increase indent level for list blocks
 */
export const handleTab =
  (_runtime: LoroRuntime): Command =>
  (state, dispatch) => {
    const { selection, schema } = state;
    const { $from } = selection;
    const parent = $from.parent;

    if (!isListBlock(parent.attrs)) {
      return false; // Let default tab behavior happen (or nothing)
    }

    const currentIndent = (parent.attrs.indent_level as number) || 0;
    if (currentIndent >= MAX_INDENT) {
      return false; // Already at max indent
    }

    if (dispatch) {
      const tr = state.tr.setNodeMarkup($from.before(), schema.nodes.paragraph, {
        ...parent.attrs,
        attrs: cleanAttrsForListExit(parent.attrs.attrs),
        indent_level: currentIndent + 1,
      });
      markStructural(tr);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * Handle Shift+Tab: Decrease indent level for list blocks
 * If already at indent 0, exit list
 */
export const handleShiftTab =
  (_runtime: LoroRuntime): Command =>
  (state, dispatch) => {
    const { selection, schema } = state;
    const { $from } = selection;
    const parent = $from.parent;

    if (!isListBlock(parent.attrs)) {
      return false;
    }

    const currentIndent = (parent.attrs.indent_level as number) || 0;

    if (dispatch) {
      if (currentIndent > 0) {
        // Decrease indent
        const tr = state.tr.setNodeMarkup($from.before(), schema.nodes.paragraph, {
          ...parent.attrs,
          attrs: cleanAttrsForListExit(parent.attrs.attrs),
          indent_level: currentIndent - 1,
        });
        markStructural(tr);
        dispatch(tr.scrollIntoView());
      } else {
        // Already at indent 0, exit list
        const tr = state.tr.setNodeMarkup($from.before(), schema.nodes.paragraph, {
          block_id: parent.attrs.block_id,
          attrs: cleanAttrsForListExit(parent.attrs.attrs),
          list_type: null,
          indent_level: 0,
          task_checked: false,
        });
        markStructural(tr);
        dispatch(tr.scrollIntoView());
      }
    }
    return true;
  };

/**
 * Handle Backspace at start of list block:
 * - If indent > 0: decrease indent
 * - If indent = 0: exit list (convert to paragraph)
 * - Otherwise: default backspace behavior
 */
export const handleBackspaceInList =
  (_runtime: LoroRuntime): Command =>
  (state, dispatch) => {
    const { selection, schema } = state;
    const { $from } = selection;

    // Only handle at start of block
    if (!selection.empty || $from.parentOffset !== 0) {
      return false;
    }

    const parent = $from.parent;
    if (!isListBlock(parent.attrs)) {
      return false;
    }

    const currentIndent = (parent.attrs.indent_level as number) || 0;

    if (dispatch) {
      if (currentIndent > 0) {
        // Decrease indent
        const tr = state.tr.setNodeMarkup($from.before(), schema.nodes.paragraph, {
          ...parent.attrs,
          attrs: cleanAttrsForListExit(parent.attrs.attrs),
          indent_level: currentIndent - 1,
        });
        markStructural(tr);
        dispatch(tr.scrollIntoView());
      } else {
        // Exit list
        const tr = state.tr.setNodeMarkup($from.before(), schema.nodes.paragraph, {
          block_id: parent.attrs.block_id,
          attrs: cleanAttrsForListExit(parent.attrs.attrs),
          list_type: null,
          indent_level: 0,
          task_checked: false,
        });
        markStructural(tr);
        dispatch(tr.scrollIntoView());
      }
    }
    return true;
  };

/**
 * Handle Shift-Enter: Insert hard break
 */
export const handleSoftBreak: Command = chainCommands(exitCode, (state, dispatch) => {
  if (dispatch) {
    const br = state.schema.nodes.hard_break.create();
    dispatch(state.tr.replaceSelectionWith(br).scrollIntoView());
  }
  return true;
});

/**
 * Move block up: Swap current block with previous sibling
 * Keyboard shortcut: Cmd+Shift+ArrowUp (Mac) / Ctrl+Shift+ArrowUp (Win)
 */
export const moveBlockUp: Command = (state, dispatch) => {
  const { selection } = state;
  const { $from } = selection;

  // Get the current block position
  const depth = $from.depth;
  if (depth < 1) {
    return false;
  }

  const blockStart = $from.before(depth);
  const blockEnd = $from.after(depth);
  const blockNode = state.doc.nodeAt(blockStart);

  if (!blockNode) {
    return false;
  }

  // Find parent and current index
  const parentStart = $from.start(depth - 1);
  const parent = state.doc.resolve(blockStart).parent;
  let currentIndex = -1;

  // Find our block's index in parent
  let pos = parentStart;
  for (let i = 0; i < parent.childCount; i++) {
    if (pos === blockStart) {
      currentIndex = i;
      break;
    }
    pos += parent.child(i).nodeSize;
  }

  // Can't move up if we're the first child
  if (currentIndex <= 0) {
    return false;
  }

  if (dispatch) {
    // Get the previous sibling
    const prevNode = parent.child(currentIndex - 1);
    const prevStart = blockStart - prevNode.nodeSize;

    // Create transaction: delete current block, insert before previous
    const tr = state.tr;
    const slice = state.doc.slice(blockStart, blockEnd);

    // Delete current block
    tr.delete(blockStart, blockEnd);

    // Insert before the previous block (which is now at prevStart)
    tr.insert(prevStart, slice.content);

    // Set selection to the moved block
    const newBlockStart = prevStart;
    tr.setSelection(TextSelection.near(tr.doc.resolve(newBlockStart + 1)));

    // Mark this block as just moved for animation feedback
    tr.setMeta("movedBlockId", blockNode.attrs.block_id);

    dispatch(tr.scrollIntoView());
  }

  return true;
};

/**
 * Move block down: Swap current block with next sibling
 * Keyboard shortcut: Cmd+Shift+ArrowDown (Mac) / Ctrl+Shift+ArrowDown (Win)
 */
export const moveBlockDown: Command = (state, dispatch) => {
  const { selection } = state;
  const { $from } = selection;

  // Get the current block position
  const depth = $from.depth;
  if (depth < 1) {
    return false;
  }

  const blockStart = $from.before(depth);
  const blockEnd = $from.after(depth);
  const blockNode = state.doc.nodeAt(blockStart);

  if (!blockNode) {
    return false;
  }

  // Find parent and current index
  const parentStart = $from.start(depth - 1);
  const parent = state.doc.resolve(blockStart).parent;
  let currentIndex = -1;

  // Find our block's index in parent
  let pos = parentStart;
  for (let i = 0; i < parent.childCount; i++) {
    if (pos === blockStart) {
      currentIndex = i;
      break;
    }
    pos += parent.child(i).nodeSize;
  }

  // Can't move down if we're the last child
  if (currentIndex < 0 || currentIndex >= parent.childCount - 1) {
    return false;
  }

  if (dispatch) {
    // Get the next sibling
    const nextNode = parent.child(currentIndex + 1);
    const _nextEnd = blockEnd + nextNode.nodeSize;

    // Create transaction: delete current block, insert after next
    const tr = state.tr;
    const slice = state.doc.slice(blockStart, blockEnd);

    // Delete current block first
    tr.delete(blockStart, blockEnd);

    // The next block has shifted up, so insert after it
    // After deletion, next block starts at blockStart
    const insertPos = blockStart + nextNode.nodeSize;
    tr.insert(insertPos, slice.content);

    // Set selection to the moved block
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));

    // Mark this block as just moved for animation feedback
    tr.setMeta("movedBlockId", blockNode.attrs.block_id);

    dispatch(tr.scrollIntoView());
  }

  return true;
};

/**
 * Create Block Behaviors Plugin for flat block architecture
 */
export function createBlockBehaviorsPlugin({ runtime }: { runtime: LoroRuntime }): Plugin {
  return keymap({
    Enter: handleEnter(runtime),
    "Shift-Enter": handleSoftBreak,
    Tab: handleTab(runtime),
    "Shift-Tab": handleShiftTab(runtime),
    Backspace: chainCommands(deleteSelection, handleBackspaceInList(runtime), joinBackward),
    // Block movement shortcuts (Notion-style)
    "Shift-Mod-ArrowUp": moveBlockUp,
    "Shift-Mod-ArrowDown": moveBlockDown,
  });
}
