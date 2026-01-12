// apps/reader/src/lib/editor/aiMenuPlugin.ts

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const aiMenuKey = new PluginKey("aiMenu");

export type AIMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  selectionText: string;
  prompt?: string;
};

export type AIMenuPluginOptions = {
  onStateChange?: (state: AIMenuState | null) => void;
};

export function createAIMenuPlugin(options: AIMenuPluginOptions = {}): Plugin {
  return new Plugin({
    key: aiMenuKey,
    view(_view: EditorView) {
      let updateTimeout: NodeJS.Timeout | null = null;

      return {
        update(view, prevState) {
          // Check for explicit open command from transactions (e.g. from Slash Menu)
          const meta = view.state.tr.getMeta(aiMenuKey);
          if (meta?.type === "open") {
            options.onStateChange?.({
              isOpen: true,
              x: meta.position.x,
              y: meta.position.y,
              selectionText: view.state.doc.textBetween(
                view.state.selection.from,
                view.state.selection.to
              ),
              prompt: meta.prompt, // Pass the prompt through
            });
            return;
          }

          // If doc/selection didn't change, and no meta, ignore
          if (
            !meta &&
            prevState?.doc.eq(view.state.doc) &&
            prevState.selection.eq(view.state.selection)
          ) {
            return;
          }

          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }

          updateTimeout = setTimeout(() => {
            const { selection } = view.state;

            if (selection.empty) {
              options.onStateChange?.(null);
              return;
            }

            // Don't show if selection is just whitespace
            const text = view.state.doc.textBetween(selection.from, selection.to);
            if (!text.trim()) {
              options.onStateChange?.(null);
              return;
            }

            // Calculate coords
            // Use 'end' of selection? Or center?
            // Usually center of selection is nice, but harder to calc.
            // Let's use the 'to' (end) position
            const coords = view.coordsAtPos(selection.to);
            if (!coords) {
              return;
            }

            options.onStateChange?.({
              isOpen: true,
              x: coords.left,
              y: coords.bottom + 5, // Below line
              selectionText: text,
            });
          }, 100); // 100ms debounce
        },
        destroy() {
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }
        },
      };
    },
  });
}
