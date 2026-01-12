import { createStore } from "../store";
import type { Annotation } from "./types";

interface AnnotationState {
  annotations: Record<string, Annotation>;
  focusedAnnotationId: string | null;
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, delta: Partial<Annotation>) => void;
  setAnnotations: (annotations: Record<string, Annotation>) => void;
  setFocusedAnnotationId: (id: string | null) => void;
}

export const useAnnotationStore = createStore<AnnotationState>("annotation-store", (set) => ({
  annotations: {},
  focusedAnnotationId: null,
  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: { ...state.annotations, [annotation.id]: annotation },
    })),
  removeAnnotation: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.annotations;
      const focusedAnnotationId =
        state.focusedAnnotationId === id ? null : state.focusedAnnotationId;
      return { annotations: rest, focusedAnnotationId };
    }),
  updateAnnotation: (id, delta) =>
    set((state) => ({
      annotations: {
        ...state.annotations,
        [id]: { ...state.annotations[id], ...delta },
      },
    })),
  setAnnotations: (annotations) =>
    set((state) => {
      const focusedId = state.focusedAnnotationId;
      const nextFocused = focusedId && annotations[focusedId] ? focusedId : null;
      return { annotations, focusedAnnotationId: nextFocused };
    }),
  setFocusedAnnotationId: (id) =>
    set(() => ({
      focusedAnnotationId: id,
    })),
}));
