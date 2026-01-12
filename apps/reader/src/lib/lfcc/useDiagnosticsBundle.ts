import { useCallback, useMemo } from "react";

import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { useAnnotationStore } from "@/lib/kernel/store";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import {
  copyDiagnosticsBundleToClipboard,
  createDiagnosticsBundle,
} from "@/lib/lfcc/diagnosticsBundle";

export type DiagnosticsBundleOptions = {
  syncSummary?: DiagnosticsSyncSummary;
  includeContent?: boolean;
};

export function useDiagnosticsBundle({ syncSummary, includeContent }: DiagnosticsBundleOptions) {
  const lfcc = useLfccEditorContext();
  const annotationsById = useAnnotationStore((state) => state.annotations);
  const annotations = useMemo(() => Object.values(annotationsById), [annotationsById]);
  const dirtyInfo = useLfccDebugStore((state) => state.dirtyInfoHistory);
  const errors = useLfccDebugStore((state) => state.errors);
  const divergence = useLfccDebugStore((state) => state.lastDivergence);

  const buildBundle = useCallback(() => {
    if (!lfcc) {
      return null;
    }

    return createDiagnosticsBundle({
      runtime: lfcc.runtime,
      view: lfcc.view,
      annotations,
      dirtyInfo,
      errors,
      syncSummary,
      divergence,
      includeContent,
    });
  }, [annotations, dirtyInfo, errors, includeContent, lfcc, syncSummary, divergence]);

  const copy = useCallback(async () => {
    const bundle = buildBundle();
    if (!bundle) {
      return false;
    }
    return copyDiagnosticsBundleToClipboard(bundle);
  }, [buildBundle]);

  return {
    copy,
    buildBundle,
    isAvailable: Boolean(lfcc),
  };
}
