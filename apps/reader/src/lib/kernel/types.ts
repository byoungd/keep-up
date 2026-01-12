import type { DisplayAnnoState, StoredAnnoState } from "@keepup/core";
import type { SpanChain, SpanList } from "@keepup/lfcc-bridge";
import type { Anchor } from "./anchors";

/** Annotation highlight color options */
export type AnnotationColor = "yellow" | "green" | "red" | "purple";

export interface Annotation {
  id: string;
  start: Anchor;
  end: Anchor;
  content: string;
  color?: AnnotationColor;
  storedState: StoredAnnoState;
  displayState: DisplayAnnoState;
  createdAtMs: number;
  spans?: SpanList;
  chain?: SpanChain;
  verified: boolean;
}

export interface AnnotationStore {
  annotations: Record<string, Annotation>;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, delta: Partial<Annotation>) => void;
}
