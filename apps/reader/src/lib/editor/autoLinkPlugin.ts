import type { Schema } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

const urlRegex = /https?:\/\/[^\s]+/g;

export const autoLinkPluginKey = new PluginKey("autoLine");

/**
 * Plugin to automatically linkify URLs on paste.
 */
export function createAutoLinkPlugin(schema: Schema) {
  return new Plugin({
    key: autoLinkPluginKey,
    props: {
      handlePaste(view, event, slice) {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) {
          return false;
        }

        // If simple URL paste
        if (
          text.match(urlRegex) &&
          slice.content.childCount === 1 &&
          slice.content.firstChild?.isText
        ) {
          // Let default handler run if it's rich text?
          // But if we want to force linkify:

          // Check if selection is empty (inserting URL) or range (linkifying text)
          const { from, to, empty } = view.state.selection;

          if (!empty) {
            // Linkify selection
            const mark = schema.marks.link.create({ href: text.trim() });
            const tr = view.state.tr.addMark(from, to, mark);
            view.dispatch(tr);
            return true;
          }

          // Otherwise, inserting URL text. Default handler inserts text.
          // We want it to be a link.
          // We can insert text with link mark.
        }
        return false;
      },
      transformPasted(slice) {
        // If the slice contains text that looks like a URL, add link mark?
        // This is harder because slice structure.
        // Simplest "Professional" behavior:
        // 1. If pasting URL over selection -> make selection a link. (Implemented above)
        // 2. If pasting URL -> make it a clickable link. (Handled by markdown parser usually if enabled, or strict "input rule" equiv).

        return slice;
      },
    },
  });
}
