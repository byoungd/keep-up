/**
 * UX-001: Unified Keyboard Shortcuts Registry
 *
 * Centralized registry for all editor keyboard shortcuts.
 * Makes shortcuts discoverable, configurable, and consistent.
 */

import {
  joinDown,
  joinUp,
  lift,
  selectParentNode,
  setBlockType,
  toggleMark,
} from "prosemirror-commands";
import { undoInputRule } from "prosemirror-inputrules";
import type { Schema } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * P0 FIX: Loro-based undo command.
 * Uses the global harness which is wired to the bridge's Loro runtime.
 */
const loroUndo: Command = (
  _state: EditorState,
  _dispatch?: (tr: import("prosemirror-state").Transaction) => void,
  view?: EditorView
): boolean => {
  if (!view) {
    return false;
  }
  const globalAny =
    typeof window !== "undefined" ? (window as unknown as { __lfccUndo?: () => void }) : null;
  if (globalAny?.__lfccUndo) {
    globalAny.__lfccUndo();
    return true;
  }
  return false;
};

/**
 * P0 FIX: Loro-based redo command.
 */
const loroRedo: Command = (
  _state: EditorState,
  _dispatch?: (tr: import("prosemirror-state").Transaction) => void,
  view?: EditorView
): boolean => {
  if (!view) {
    return false;
  }
  const globalAny =
    typeof window !== "undefined" ? (window as unknown as { __lfccRedo?: () => void }) : null;
  if (globalAny?.__lfccRedo) {
    globalAny.__lfccRedo();
    return true;
  }
  return false;
};

/**
 * Editor-scoped select-all command.
 * Ensures selection stays within the editor and prevents browser's native
 * Mod-A from selecting content outside the editor container.
 */
const selectAllInEditor: Command = (
  state: EditorState,
  dispatch?: (tr: import("prosemirror-state").Transaction) => void,
  _view?: EditorView
): boolean => {
  // Select from start to end of the document content
  const { doc } = state;
  const { TextSelection } = require("prosemirror-state") as typeof import("prosemirror-state");

  // Create a selection spanning the entire document content
  const selection = TextSelection.create(doc, 0, doc.content.size);

  if (dispatch) {
    dispatch(state.tr.setSelection(selection).scrollIntoView());
  }

  // Always return true to prevent browser's native select-all from firing
  return true;
};

export type ShortcutCategory = "history" | "formatting" | "structure" | "navigation" | "ai";

export interface ShortcutDefinition {
  /** Unique identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** ProseMirror key string (e.g., "Mod-b") */
  keys: string[];
  /** Shortcut category for grouping in UI */
  category: ShortcutCategory;
  /** Command factory (schema-dependent) */
  command?: (schema: Schema) => Command | null;
  /** Static command (schema-independent) */
  staticCommand?: Command;
  /** macOS display string */
  macDisplay?: string;
  /** Windows/Linux display string */
  winDisplay?: string;
}

/**
 * Complete registry of all editor shortcuts
 */
export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  // History - P0 FIX: Using Loro undoManager instead of PM history
  {
    id: "undo",
    label: "Undo",
    keys: ["Mod-z"],
    category: "history",
    staticCommand: loroUndo,
    macDisplay: "⌘Z",
    winDisplay: "Ctrl+Z",
  },
  {
    id: "redo",
    label: "Redo",
    keys: ["Shift-Mod-z", "Mod-y"],
    category: "history",
    staticCommand: loroRedo,
    macDisplay: "⇧⌘Z",
    winDisplay: "Ctrl+Y",
  },
  {
    id: "undo-input-rule",
    label: "Undo Input Rule",
    keys: ["Backspace"],
    category: "history",
    staticCommand: undoInputRule,
  },

  // Formatting
  {
    id: "bold",
    label: "Bold",
    keys: ["Mod-b", "Mod-B"],
    category: "formatting",
    command: (schema) => (schema.marks.bold ? toggleMark(schema.marks.bold) : null),
    macDisplay: "⌘B",
    winDisplay: "Ctrl+B",
  },
  {
    id: "italic",
    label: "Italic",
    keys: ["Mod-i", "Mod-I"],
    category: "formatting",
    command: (schema) => (schema.marks.italic ? toggleMark(schema.marks.italic) : null),
    macDisplay: "⌘I",
    winDisplay: "Ctrl+I",
  },
  {
    id: "underline",
    label: "Underline",
    keys: ["Mod-u", "Mod-U"],
    category: "formatting",
    command: (schema) => (schema.marks.underline ? toggleMark(schema.marks.underline) : null),
    macDisplay: "⌘U",
    winDisplay: "Ctrl+U",
  },
  {
    id: "strikethrough",
    label: "Strikethrough",
    keys: ["Mod-Shift-s", "Mod-d"],
    category: "formatting",
    command: (schema) => (schema.marks.strike ? toggleMark(schema.marks.strike) : null),
    macDisplay: "⇧⌘S",
    winDisplay: "Ctrl+Shift+S",
  },
  {
    id: "code",
    label: "Inline Code",
    keys: ["Mod-e", "Mod-`"],
    category: "formatting",
    command: (schema) => (schema.marks.code ? toggleMark(schema.marks.code) : null),
    macDisplay: "⌘E",
    winDisplay: "Ctrl+E",
  },

  // Structure
  {
    id: "heading-1",
    label: "Heading 1",
    keys: ["Shift-Mod-1"],
    category: "structure",
    command: (schema) =>
      schema.nodes.heading ? setBlockType(schema.nodes.heading, { level: 1 }) : null,
    macDisplay: "⇧⌘1",
    winDisplay: "Ctrl+Shift+1",
  },
  {
    id: "heading-2",
    label: "Heading 2",
    keys: ["Shift-Mod-2"],
    category: "structure",
    command: (schema) =>
      schema.nodes.heading ? setBlockType(schema.nodes.heading, { level: 2 }) : null,
    macDisplay: "⇧⌘2",
    winDisplay: "Ctrl+Shift+2",
  },
  {
    id: "heading-3",
    label: "Heading 3",
    keys: ["Shift-Mod-3"],
    category: "structure",
    command: (schema) =>
      schema.nodes.heading ? setBlockType(schema.nodes.heading, { level: 3 }) : null,
    macDisplay: "⇧⌘3",
    winDisplay: "Ctrl+Shift+3",
  },
  // Note: Tab, Shift-Tab, Enter for lists are now handled by blockBehaviors.ts
  // using flat block architecture (list_type, indent_level attributes)
  {
    id: "lift",
    label: "Lift Out of Block",
    keys: ["Mod-BracketLeft"],
    category: "structure",
    staticCommand: lift,
    macDisplay: "⌘[",
    winDisplay: "Ctrl+[",
  },

  // Navigation
  {
    id: "join-up",
    label: "Join with Block Above",
    keys: ["Alt-ArrowUp"],
    category: "navigation",
    staticCommand: joinUp,
    macDisplay: "⌥↑",
    winDisplay: "Alt+↑",
  },
  {
    id: "join-down",
    label: "Join with Block Below",
    keys: ["Alt-ArrowDown"],
    category: "navigation",
    staticCommand: joinDown,
    macDisplay: "⌥↓",
    winDisplay: "Alt+↓",
  },
  {
    id: "select-all",
    label: "Select All",
    keys: ["Mod-a", "Mod-A"],
    category: "navigation",
    staticCommand: selectAllInEditor,
    macDisplay: "⌘A",
    winDisplay: "Ctrl+A",
  },
  {
    id: "select-parent",
    label: "Select Parent Node",
    keys: ["Escape"],
    category: "navigation",
    staticCommand: selectParentNode,
  },

  // Block movement (handled by blockBehaviors.ts, registered here for UI display)
  {
    id: "move-block-up",
    label: "Move Block Up",
    keys: ["Shift-Mod-ArrowUp"],
    category: "structure",
    // Command handled by blockBehaviors plugin
    macDisplay: "⇧⌘↑",
    winDisplay: "Ctrl+Shift+↑",
  },
  {
    id: "move-block-down",
    label: "Move Block Down",
    keys: ["Shift-Mod-ArrowDown"],
    category: "structure",
    // Command handled by blockBehaviors plugin
    macDisplay: "⇧⌘↓",
    winDisplay: "Ctrl+Shift+↓",
  },
];

/**
 * Build a ProseMirror keymap from the registry
 */
export function buildKeymapFromRegistry(schema: Schema): Record<string, Command> {
  const keymap: Record<string, Command> = {};

  for (const shortcut of SHORTCUT_REGISTRY) {
    let cmd: Command | null = null;

    if (shortcut.staticCommand) {
      cmd = shortcut.staticCommand;
    } else if (shortcut.command) {
      cmd = shortcut.command(schema);
    }

    if (cmd) {
      for (const key of shortcut.keys) {
        keymap[key] = cmd;
      }
    }
  }

  return keymap;
}

/**
 * Get shortcuts by category for UI display
 */
export function getShortcutsByCategory(category: ShortcutCategory): ShortcutDefinition[] {
  return SHORTCUT_REGISTRY.filter((s) => s.category === category);
}

/**
 * Get display string for a shortcut (platform-aware)
 */
export function getShortcutDisplay(
  shortcut: ShortcutDefinition,
  platform: "mac" | "win" = typeof navigator !== "undefined" &&
  navigator.platform?.toLowerCase().includes("mac")
    ? "mac"
    : "win"
): string {
  return platform === "mac"
    ? (shortcut.macDisplay ?? shortcut.keys[0])
    : (shortcut.winDisplay ?? shortcut.keys[0]);
}

/**
 * Find shortcut by ID
 */
export function findShortcut(id: string): ShortcutDefinition | undefined {
  return SHORTCUT_REGISTRY.find((s) => s.id === id);
}
