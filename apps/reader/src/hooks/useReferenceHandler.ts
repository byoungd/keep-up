import { type ReferenceAnchor, resolveReferenceInState } from "@/lib/ai/referenceAnchors";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

export function useReferenceHandler(editorView?: EditorView | null) {
  const resolveReference = React.useCallback(
    (anchor: ReferenceAnchor) => {
      if (!editorView) {
        return { status: "unresolved" as const, reason: "no_editor" };
      }
      return resolveReferenceInState(anchor, editorView.state);
    },
    [editorView]
  );

  const handleReferenceSelect = React.useCallback(
    (anchor: ReferenceAnchor) => {
      if (!editorView) {
        return;
      }
      const resolved = resolveReferenceInState(anchor, editorView.state);
      if (resolved.status === "resolved" || resolved.status === "remapped") {
        if (resolved.from !== undefined && resolved.to !== undefined) {
          const selection = TextSelection.create(editorView.state.doc, resolved.from, resolved.to);
          editorView.dispatch(editorView.state.tr.setSelection(selection).scrollIntoView());
          editorView.focus();
          return;
        }
      }
      if (typeof document !== "undefined") {
        const escapedId = anchor.blockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const target = document.querySelector<HTMLElement>(`[data-block-id="${escapedId}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [editorView]
  );

  return {
    resolveReference,
    handleReferenceSelect,
  };
}
