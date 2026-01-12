import type { Node as PMNode, Schema } from "prosemirror-model";
import { EditorState, type Plugin } from "prosemirror-state";
import type { Transaction } from "prosemirror-state"; // Added import for Transaction
import { EditorView } from "prosemirror-view";

import { pmSchema } from "../pm/pmSchema";

// Removed EditorAdapterPMOptions as it's replaced by inline type in constructor

export type EditorViewOptions = {
  state: EditorState;
  dispatchTransaction?: (tr: Transaction) => void;
  attributes?: Record<string, string>;
  nodeViews?: Record<
    string,
    (
      node: PMNode,
      view: EditorView,
      getPos: () => number | undefined,
      decorations: readonly import("prosemirror-view").Decoration[],
      innerDecorations: import("prosemirror-view").DecorationSource
    ) => import("prosemirror-view").NodeView
  >;
};

export class EditorAdapterPM {
  public schema: Schema; // Changed to public
  private plugins: Plugin[]; // Removed readonly

  constructor(options: { schema?: Schema; plugins?: Plugin[] } = {}) {
    // Changed type to inline object
    this.schema = options.schema ?? pmSchema;
    this.plugins = options.plugins ?? [];
  }

  createState(doc: PMNode): EditorState {
    // Changed doc type to PMNode and made it required
    return EditorState.create({
      doc, // Reordered doc and schema
      schema: this.schema,
      plugins: this.plugins,
    });
  }

  createView(mount: HTMLElement, options: EditorViewOptions): EditorView {
    // Changed props to options: EditorViewOptions
    return new EditorView(mount, {
      state: options.state,
      dispatchTransaction: options.dispatchTransaction,
      attributes: options.attributes,
      nodeViews: options.nodeViews, // Added nodeViews
    });
  }
}
