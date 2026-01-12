import { useCallback, useMemo } from "react";

import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { useAnnotationStore } from "@/lib/kernel/store";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import {
  copyReproBundleToClipboard,
  createReproBundle,
  downloadReproBundle,
} from "@/lib/lfcc/reproBundle";

export function useReproBundle() {
  const lfcc = useLfccEditorContext();
  const annotationsById = useAnnotationStore((state) => state.annotations);
  const annotations = useMemo(() => Object.values(annotationsById), [annotationsById]);
  const dirtyInfo = useLfccDebugStore((state) => state.dirtyInfoHistory);
  const errors = useLfccDebugStore((state) => state.errors);

  const buildBundle = useCallback(() => {
    if (!lfcc) {
      return null;
    }

    return createReproBundle({
      runtime: lfcc.runtime,
      view: lfcc.view,
      annotations,
      dirtyInfo,
      errors,
    });
  }, [annotations, dirtyInfo, errors, lfcc]);

  const download = useCallback(() => {
    const bundle = buildBundle();
    if (!bundle) {
      return false;
    }
    downloadReproBundle(bundle);
    return true;
  }, [buildBundle]);

  const copy = useCallback(async () => {
    const bundle = buildBundle();
    if (!bundle) {
      return false;
    }
    return copyReproBundleToClipboard(bundle);
  }, [buildBundle]);

  return {
    download,
    copy,
    isAvailable: Boolean(lfcc),
  };
}
