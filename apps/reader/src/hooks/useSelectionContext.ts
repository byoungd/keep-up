"use client";

import type { LoroRuntime, SpanList } from "@keepup/lfcc-bridge";
import { pmSelectionToSpanList } from "@keepup/lfcc-bridge";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

export function useSelectionContext(view: EditorView | null, runtime?: LoroRuntime | null) {
  const [selectedText, setSelectedText] = React.useState<string | undefined>();
  const [pageContext, setPageContext] = React.useState<string | undefined>();
  const [selectionSpans, setSelectionSpans] = React.useState<SpanList>([]);

  // Track last doc to enable determining when to re-calculate textContent
  // (optimization for large docs)
  const lastDocRef = React.useRef<unknown>(null);

  const update = React.useCallback(() => {
    if (!view || view.isDestroyed) {
      setSelectedText(undefined);
      setPageContext(undefined);
      return;
    }

    const { selection, doc } = view.state;
    const { from, to, empty } = selection;

    // 1. Selection Text
    if (empty) {
      setSelectedText(undefined);
      setSelectionSpans([]);
    } else {
      // Use textBetween to get the selected text with newlines
      const text = doc.textBetween(from, to, "\n");
      setSelectedText(text);
      if (runtime) {
        try {
          const mapped = pmSelectionToSpanList(selection, view.state, runtime, { strict: false });
          setSelectionSpans(mapped.spanList);
        } catch {
          setSelectionSpans([]);
        }
      } else {
        setSelectionSpans([]);
      }
    }

    // 2. Page Context (Entire Document for MVP)
    // Only update if the document reference has changed (meaning content changed)
    if (doc !== lastDocRef.current) {
      lastDocRef.current = doc;
      setPageContext(doc.textContent);
    }
  }, [runtime, view]);

  React.useEffect(() => {
    if (!view) {
      return;
    }

    // Initial update
    update();

    // Listen to DOM events that might change selection or content
    // Note: 'input' event captures typing, 'selectionchange' captures cursor/selection
    const handleUpdate = () => {
      // We could debounce here if needed, but for text extraction it's usually fast enough
      // unless the doc is massive.
      window.requestAnimationFrame(update);
    };

    document.addEventListener("selectionchange", handleUpdate);
    document.addEventListener("keyup", handleUpdate);
    document.addEventListener("mouseup", handleUpdate);
    // 'input' might be redundant with keyup but safe to add for some IMEs?
    // Actually Prosemirror handles IO, so 'keyup' covers most.
    // 'selectionchange' covers almost all selection moves.

    return () => {
      document.removeEventListener("selectionchange", handleUpdate);
      document.removeEventListener("keyup", handleUpdate);
      document.removeEventListener("mouseup", handleUpdate);
    };
  }, [view, update]);

  return { selectedText, pageContext, selectionSpans };
}
