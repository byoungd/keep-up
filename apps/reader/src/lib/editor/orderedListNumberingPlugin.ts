import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";

export type OrderedListNumberingState = {
  byBlockId: Map<string, number>;
};

export const orderedListNumberingKey = new PluginKey<OrderedListNumberingState>(
  "orderedListNumbering"
);

export function buildOrderedListNumbering(doc: PMNode): Map<string, number> {
  const counters = new Map<number, number>();
  const byBlockId = new Map<string, number>();

  doc.descendants((node) => {
    if (node.attrs?.list_type !== "ordered") {
      return true;
    }

    const indent = typeof node.attrs?.indent_level === "number" ? node.attrs.indent_level : 0;
    const next = (counters.get(indent) ?? 0) + 1;
    counters.set(indent, next);

    const blockId = node.attrs?.block_id;
    if (typeof blockId === "string" && blockId.length > 0) {
      byBlockId.set(blockId, next);
    }

    return true;
  });

  return byBlockId;
}

export function createOrderedListNumberingPlugin(): Plugin<OrderedListNumberingState> {
  return new Plugin<OrderedListNumberingState>({
    key: orderedListNumberingKey,
    state: {
      init: (_config, state) => ({
        byBlockId: buildOrderedListNumbering(state.doc),
      }),
      apply: (tr, value, _oldState, newState) => {
        if (!tr.docChanged) {
          return value;
        }
        return {
          byBlockId: buildOrderedListNumbering(newState.doc),
        };
      },
    },
  });
}
