import type { FailClosedPayload } from "@/components/lfcc/DevFailClosedBanner";
import type { LfccEditorContextValue } from "@/components/lfcc/LfccEditorContext";
import { annotationController } from "@/lib/annotations/annotationController";
import type { SelectionResult } from "@/lib/dom/selection";
import { absoluteFromAnchor } from "@/lib/kernel/anchors";
import type { SpanChainPolicy } from "@ku0/lfcc-bridge";
import { useCallback } from "react";

export type AnnotationCreationOptions = {
  lfcc: LfccEditorContextValue | null;
  chainPolicy: SpanChainPolicy;
  strict: boolean;
  onFailClosed: (info: FailClosedPayload) => void;
};

export function useAnnotationCreation({
  lfcc,
  chainPolicy,
  strict,
  onFailClosed,
}: AnnotationCreationOptions) {
  return useCallback(
    (color: "yellow" | "green" | "red" | "purple", selection: SelectionResult | null): boolean => {
      if (lfcc?.view && lfcc.runtime) {
        const result = annotationController.createFromSelection({
          view: lfcc.view,
          runtime: lfcc.runtime,
          color,
          chainPolicy,
          strict,
        });

        if (!result.ok) {
          onFailClosed({ message: result.error, payload: result.debugPayload });
          return false;
        }

        return true;
      }

      if (!selection) {
        return false;
      }

      const start = absoluteFromAnchor(selection.start);
      const end = absoluteFromAnchor(selection.end);
      if (!start || !end) {
        onFailClosed({
          message: "Unable to decode selection anchors.",
          payload: { start: selection.start, end: selection.end },
        });
        return false;
      }

      annotationController.createAnnotation({
        spanList: [
          {
            blockId: start.blockId,
            start: start.offset,
            end: end.offset,
          },
        ],
        content: selection.text,
        color,
      });

      return true;
    },
    [chainPolicy, lfcc, onFailClosed, strict]
  );
}
