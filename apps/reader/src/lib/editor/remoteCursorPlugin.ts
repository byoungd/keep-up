/**
 * Remote Cursor Plugin - ProseMirror plugin for displaying remote collaborators' cursors
 *
 * Renders cursor positions as colored vertical bars with name labels.
 */

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export interface RemoteCursor {
  clientId: string;
  displayName: string;
  color: string;
  /** Block ID where cursor is located */
  blockId: string;
  /** Character offset within the block */
  offset: number;
  /** Last update timestamp */
  lastSeen: number;
}

export interface RemoteCursorPluginState {
  cursors: Map<string, RemoteCursor>;
  decorations: DecorationSet;
}

const CURSOR_STALE_MS = 5000; // Fade after 5 seconds

export const remoteCursorPluginKey = new PluginKey<RemoteCursorPluginState>("remoteCursors");

/**
 * Creates the remote cursor plugin
 */
export function createRemoteCursorPlugin() {
  return new Plugin<RemoteCursorPluginState>({
    key: remoteCursorPluginKey,

    state: {
      init() {
        return {
          cursors: new Map<string, RemoteCursor>(),
          decorations: DecorationSet.empty,
        };
      },

      apply(tr, state, _oldState, newState) {
        // Check for cursor update metadata
        const cursorUpdate = tr.getMeta(remoteCursorPluginKey) as
          | { type: "update"; cursors: RemoteCursor[] }
          | { type: "remove"; clientId: string }
          | undefined;

        if (!cursorUpdate) {
          // Map decorations through document changes
          return {
            cursors: state.cursors,
            decorations: state.decorations.map(tr.mapping, tr.doc),
          };
        }

        const newCursors = new Map(state.cursors);

        if (cursorUpdate.type === "update") {
          // console.log(
          //   `[RemoteCursorPlugin] Received update for ${cursorUpdate.cursors.length} cursors`
          // );
          const now = Date.now();
          for (const cursor of cursorUpdate.cursors) {
            newCursors.set(cursor.clientId, { ...cursor, lastSeen: now });
          }
        } else if (cursorUpdate.type === "remove") {
          newCursors.delete(cursorUpdate.clientId);
        }

        // Build decorations
        const decorations = buildCursorDecorations(newCursors, newState.doc);

        return {
          cursors: newCursors,
          decorations,
        };
      },
    },

    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/**
 * Build decoration set from cursor positions
 */
function buildCursorDecorations(
  cursors: Map<string, RemoteCursor>,
  doc: import("prosemirror-model").Node
): DecorationSet {
  const now = Date.now();
  const decorations: Decoration[] = [];

  for (const [_clientId, cursor] of cursors) {
    // Find the block position by blockId
    const pos = findBlockPosition(doc, cursor.blockId, cursor.offset);
    if (pos === null) {
      // console.log(`[RemoteCursorPlugin] Could not find position for block ${cursor.blockId}`);
      continue;
    }
    // console.log(`[RemoteCursorPlugin] Found position ${pos} for block ${cursor.blockId}`);

    // Check if cursor is stale
    const isStale = now - cursor.lastSeen > CURSOR_STALE_MS;

    // Create cursor widget decoration
    const widget = Decoration.widget(pos, () => createCursorElement(cursor, isStale), {
      side: 1, // After the character
      key: `cursor-${cursor.clientId}`,
    });

    decorations.push(widget);
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * Find absolute position for a block+offset
 */
function findBlockPosition(
  doc: import("prosemirror-model").Node,
  blockId: string,
  offset: number
): number | null {
  let foundPos: number | null = null;

  doc.descendants((node, pos) => {
    if (foundPos !== null) {
      return false;
    }
    // Check if this node has the matching block ID
    if (
      node.attrs?.id === blockId ||
      node.attrs?.blockId === blockId ||
      node.attrs?.block_id === blockId
    ) {
      // Position is start of block + offset (clamped)
      const contentStart = pos + 1; // Inside the block
      const maxOffset = Math.max(0, node.content.size);
      foundPos = contentStart + Math.min(offset, maxOffset);
      return false;
    }
    return true;
  });

  return foundPos;
}

/**
 * Create DOM element for cursor decoration
 */
function createCursorElement(cursor: RemoteCursor, isStale: boolean): HTMLElement {
  const container = document.createElement("span");
  container.className = "remote-cursor";
  container.setAttribute("data-client-id", cursor.clientId);

  const isAI = cursor.displayName.toLowerCase().includes("ai") || cursor.displayName.includes("✨");
  const color = isAI ? "var(--color-accent-purple, #8b5cf6)" : cursor.color;

  // Cursor bar
  const bar = document.createElement("span");
  bar.className = "remote-cursor-bar";
  bar.style.cssText = `
    display: inline-block;
    width: 2px;
    height: 1.2em;
    background-color: ${color};
    margin-left: -1px;
    margin-right: -1px;
    position: relative;
    vertical-align: text-bottom;
    opacity: ${isStale ? "0.4" : "1"};
    transition: opacity 0.3s ease;
    animation: ${isStale ? "none" : isAI ? "cursor-blink-ai 1.5s infinite" : "cursor-blink 1s infinite"};
    box-shadow: ${isAI ? "0 0 8px rgba(139, 92, 246, 0.5)" : "none"};
  `;

  // Name label
  const label = document.createElement("span");
  label.className = "remote-cursor-label";
  label.textContent = cursor.displayName;
  label.style.cssText = `
    position: absolute;
    top: -1.5em;
    left: 0;
    background-color: ${color};
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    opacity: ${isStale ? "0.4" : "0.9"};
    transition: opacity 0.3s ease;
    box-shadow: var(--shadow-sm);
    ${isAI ? "background: linear-gradient(135deg, #8b5cf6, #d946ef);" : ""}
  `;

  bar.appendChild(label);
  container.appendChild(bar);

  return container;
}

/**
 * Injects CSS for cursor animations
 */
export function injectCursorStyles(): void {
  if (document.getElementById("remote-cursor-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "remote-cursor-styles";
  style.textContent = `
    @keyframes cursor-blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0.5; }
    }
    
    @keyframes cursor-blink-ai {
      0%, 100% { opacity: 1; transform: scaleY(1); }
      50% { opacity: 0.8; transform: scaleY(1.05); }
    }
    
    .remote-cursor {
      position: relative;
      display: inline;
    }
    
    .remote-cursor-label {
      z-index: 1000;
    }
  `;
  document.head.appendChild(style);
}
