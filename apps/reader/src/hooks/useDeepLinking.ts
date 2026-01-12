"use client";

import { annotationController } from "@/lib/annotations/annotationController";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

/**
 * Status of the deep linking attempt.
 */
export type DeepLinkStatus = "idle" | "searching" | "found" | "missing";

interface DeepLinkResult {
  status: DeepLinkStatus;
  missingAnnotationId: string | null;
}

interface DeepLinkDeps {
  view: EditorView | null;
  searchParams: ReadonlyURLSearchParams | null;
  annotationsById: Record<string, unknown>;
  toast: (message: string, type: "info" | "success" | "warning" | "error") => void;
}

type DeepLinkState = {
  annId: string | null;
  status: "none" | "missing" | "found";
};

type DeepLinkParams = {
  annId: string | null;
  blockId: string | null;
};

type AnnotationScrollResult = ReturnType<typeof annotationController.scrollToAnnotation>;

/**
 * Custom hook to handle deep linking to annotations and blocks.
 * Extracts complex logic from LfccDemo for better testability.
 */
export function useDeepLinking({
  view,
  searchParams,
  annotationsById,
  toast,
}: DeepLinkDeps): DeepLinkResult {
  const deepLinkRef = React.useRef<DeepLinkState>({
    annId: null,
    status: "none",
  });

  const handledBlockRef = React.useRef<string | null>(null);

  const [missingAnnotationId, setMissingAnnotationId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<DeepLinkStatus>("idle");

  React.useEffect(() => {
    const { annId, blockId } = getDeepLinkParams(searchParams);
    setScrollTargetAttribute(annId);

    if (!view) {
      return;
    }

    const deepLinkState = deepLinkRef.current;

    resetDeepLinkState(deepLinkState, annId, setStatus);

    const handled = handleAnnotationDeepLink({
      annId,
      annotationsById,
      deepLinkState,
      setMissingAnnotationId,
      setStatus,
      toast,
    });

    if (!handled) {
      handleBlockDeepLink({
        blockId,
        view,
        handledBlockRef,
        setStatus,
      });
    }
  }, [annotationsById, view, searchParams, toast]);

  return { status, missingAnnotationId };
}

function getDeepLinkParams(searchParams: ReadonlyURLSearchParams | null): DeepLinkParams {
  return {
    annId: searchParams?.get("ann") ?? null,
    blockId: searchParams?.get("block") ?? null,
  };
}

function setScrollTargetAttribute(annId: string | null) {
  if (!annId || typeof document === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }
  document.body?.setAttribute("data-lfcc-scroll-target", annId);
}

function resetDeepLinkState(
  deepLinkState: DeepLinkState,
  annId: string | null,
  setStatus: React.Dispatch<React.SetStateAction<DeepLinkStatus>>
) {
  if (deepLinkState.annId !== annId) {
    deepLinkState.annId = annId;
    deepLinkState.status = "none";
    setStatus("searching");
  }
}

function handleAnnotationDeepLink(input: {
  annId: string | null;
  annotationsById: Record<string, unknown>;
  deepLinkState: DeepLinkState;
  setMissingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<DeepLinkStatus>>;
  toast: (message: string, type: "info" | "success" | "warning" | "error") => void;
}): boolean {
  const { annId, annotationsById, deepLinkState, setMissingAnnotationId, setStatus, toast } = input;
  if (!annId) {
    return false;
  }

  if (annotationsById[annId]) {
    handleExistingAnnotation({
      annId,
      deepLinkState,
      setMissingAnnotationId,
      setStatus,
      toast,
    });
    return true;
  }

  handleMissingAnnotation({
    annId,
    deepLinkState,
    setMissingAnnotationId,
    setStatus,
  });

  return false;
}

function handleExistingAnnotation(input: {
  annId: string;
  deepLinkState: DeepLinkState;
  setMissingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<DeepLinkStatus>>;
  toast: (message: string, type: "info" | "success" | "warning" | "error") => void;
}): void {
  const { annId, deepLinkState, setMissingAnnotationId, setStatus, toast } = input;
  setMissingAnnotationId(null);
  if (deepLinkState.status === "found") {
    return;
  }

  const result = annotationController.scrollToAnnotation(annId);
  useAnnotationStore.getState().setFocusedAnnotationId(annId);
  notifyAnnotationScrollResult(result, toast);

  deepLinkState.status = "found";
  setStatus("found");
}

function notifyAnnotationScrollResult(
  result: AnnotationScrollResult,
  toast: (message: string, type: "info" | "success" | "warning" | "error") => void
): void {
  if (result.status === "orphan") {
    toast(
      result.scrolled
        ? "Anchor lost. Scrolled to the last known block."
        : "Anchor lost. Last known block was not found.",
      "warning"
    );
    return;
  }

  if (result.status === "scrolled" && result.displayState === "active_partial") {
    toast("Partial coverage: only part of the highlight could be resolved.", "warning");
  }
}

function handleMissingAnnotation(input: {
  annId: string;
  deepLinkState: DeepLinkState;
  setMissingAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<DeepLinkStatus>>;
}): void {
  const { annId, deepLinkState, setMissingAnnotationId, setStatus } = input;
  if (deepLinkState.status === "missing") {
    return;
  }
  setMissingAnnotationId(annId);
  deepLinkState.status = "missing";
  setStatus("missing");
}

function handleBlockDeepLink(input: {
  blockId: string | null;
  view: EditorView;
  handledBlockRef: React.MutableRefObject<string | null>;
  setStatus: React.Dispatch<React.SetStateAction<DeepLinkStatus>>;
}): void {
  const { blockId, view, handledBlockRef, setStatus } = input;
  if (!blockId || handledBlockRef.current === blockId) {
    return;
  }
  scrollToBlock(view, blockId);
  handledBlockRef.current = blockId;
  setStatus("found");
}

function scrollToBlock(view: EditorView, blockId: string) {
  let pos = -1;
  view.state.doc.descendants((node, p) => {
    if (node.attrs.block_id === blockId) {
      pos = p;
      return false;
    }
    return true;
  });

  if (pos >= 0) {
    const dom = view.nodeDOM(pos);
    if (dom && dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}
