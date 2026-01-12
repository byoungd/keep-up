/**
 * Slash Menu ProseMirror Plugin
 * Triggers on "/" and shows command palette
 */

import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type SlashCommand, defaultSlashCommands, filterCommands } from "./slashCommands";

export type { SlashCommand } from "./slashCommands";

export const slashMenuKey = new PluginKey("slashMenu");

export type SlashMenuState = {
  active: boolean;
  query: string;
  commands: SlashCommand[];
  selectedIndex: number;
  position: { top: number; left: number } | null;
};

export type SlashMenuPluginOptions = {
  commands?: SlashCommand[];
  onStateChange?: (state: SlashMenuState) => void;
};

/**
 * Calculate absolute position of cursor for menu positioning
 */
function getCursorCoords(view: EditorView): { top: number; left: number } | null {
  const { from } = view.state.selection;
  const coords = view.coordsAtPos(from);
  if (!coords) {
    return null;
  }

  return {
    top: coords.bottom,
    left: coords.left,
  };
}

/**
 * Create slash menu plugin
 */
export function createSlashMenuPlugin(options: SlashMenuPluginOptions = {}): Plugin {
  const commands = options.commands || defaultSlashCommands;

  return new Plugin({
    key: slashMenuKey,
    state: {
      init(): SlashMenuState {
        return {
          active: false,
          query: "",
          commands: [],
          selectedIndex: 0,
          position: null,
        };
      },
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Plugin state management requires conditional logic
      apply(tr, value, oldState, newState): SlashMenuState {
        const meta = tr.getMeta(slashMenuKey);

        // Handle explicit close
        if (meta?.type === "close") {
          return {
            active: false,
            query: "",
            commands: [],
            selectedIndex: 0,
            position: null,
          };
        }

        // Handle explicit open
        if (meta?.type === "open") {
          return {
            active: true,
            query: "",
            commands,
            selectedIndex: 0,
            position: meta.position || value.position,
          };
        }

        // Handle query update
        if (meta?.type === "updateQuery") {
          const filtered = filterCommands(commands, meta.query);
          return {
            ...value,
            query: meta.query,
            commands: filtered,
            selectedIndex: Math.min(value.selectedIndex, filtered.length - 1),
          };
        }

        // Handle selection change
        if (meta?.type === "setSelectedIndex") {
          return {
            ...value,
            selectedIndex: Math.max(0, Math.min(meta.index, value.commands.length - 1)),
          };
        }

        // Auto-close if selection changes and menu is active
        if (value.active && !tr.getMeta("slashMenuKeepOpen")) {
          const selectionChanged =
            oldState.selection.from !== newState.selection.from ||
            oldState.selection.to !== newState.selection.to;

          if (selectionChanged && !tr.docChanged && !tr.getMeta(slashMenuKey)) {
            return {
              active: false,
              query: "",
              commands: [],
              selectedIndex: 0,
              position: null,
            };
          }
        }

        return value;
      },
    },
    props: {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard handling requires many conditionals
      handleKeyDown(view, event) {
        const state = slashMenuKey.getState(view.state);
        if (!state?.active) {
          // Check for "/" trigger
          if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
            const { $from } = view.state.selection;
            const isAtBlockStart = $from.parentOffset === 0;
            // Also allow "/" after whitespace (common pattern: "text /command")
            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 1),
              $from.parentOffset,
              ""
            );
            const afterWhitespace = textBefore === "" || /\s/.test(textBefore);

            if (isAtBlockStart || afterWhitespace) {
              event.preventDefault();
              const position = getCursorCoords(view);
              view.dispatch(
                view.state.tr
                  .setMeta(slashMenuKey, { type: "open", position })
                  .setMeta("slashMenuKeepOpen", true)
              );
              return true;
            }
          }
          return false;
        }

        // Menu is active - handle navigation
        if (event.key === "Escape") {
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(slashMenuKey, { type: "close" }));
          return true;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          const nextIndex = (state.selectedIndex + 1) % state.commands.length;
          view.dispatch(
            view.state.tr.setMeta(slashMenuKey, { type: "setSelectedIndex", index: nextIndex })
          );
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          const prevIndex =
            (state.selectedIndex - 1 + state.commands.length) % state.commands.length;
          view.dispatch(
            view.state.tr.setMeta(slashMenuKey, { type: "setSelectedIndex", index: prevIndex })
          );
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          const selectedCommand = state.commands[state.selectedIndex];
          if (selectedCommand) {
            // Execute command
            selectedCommand.execute(view);
            // Close menu
            view.dispatch(view.state.tr.setMeta(slashMenuKey, { type: "close" }));
          }
          return true;
        }

        // Update query on text input
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          const newQuery = state.query + event.key;
          view.dispatch(
            view.state.tr
              .setMeta(slashMenuKey, { type: "updateQuery", query: newQuery })
              .setMeta("slashMenuKeepOpen", true)
          );
          return false; // Let character be inserted
        }

        if (event.key === "Backspace") {
          if (state.query.length > 0) {
            const newQuery = state.query.slice(0, -1);
            view.dispatch(
              view.state.tr
                .setMeta(slashMenuKey, { type: "updateQuery", query: newQuery })
                .setMeta("slashMenuKeepOpen", true)
            );
          } else {
            // Close menu if query is empty and backspace is pressed
            view.dispatch(view.state.tr.setMeta(slashMenuKey, { type: "close" }));
          }
          return false; // Let backspace work normally
        }

        return false;
      },
    },
    view() {
      return {
        update(view) {
          const state = slashMenuKey.getState(view.state);
          if (state && options.onStateChange) {
            options.onStateChange(state);
          }
        },
      };
    },
  });
}
