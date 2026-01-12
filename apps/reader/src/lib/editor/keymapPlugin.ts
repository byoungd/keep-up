/**
 * ProseMirror keymap plugin using unified shortcuts registry
 * @see keyboardShortcuts.ts for the complete registry
 */

import { keymap } from "prosemirror-keymap";
import type { Schema } from "prosemirror-model";
import { buildKeymapFromRegistry } from "./keyboardShortcuts";

/**
 * Creates keymap plugin from the unified shortcuts registry.
 * UX-001: All shortcuts are now centralized in keyboardShortcuts.ts
 */
export function createKeymapPlugin(schema: Schema) {
  const keys = buildKeymapFromRegistry(schema);
  return keymap(keys);
}
