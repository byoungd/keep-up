"use client";

import { AnnotationPanel } from "@/components/annotations/AnnotationPanel";
import type { IssueActionHandlers } from "@/components/issues/IssueActionButtons";
import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { useToast } from "@/components/ui/Toast";
import { annotationController } from "@/lib/annotations/annotationController";
import { useCommentStore } from "@/lib/annotations/commentStore";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation } from "@/lib/kernel/types";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import { useDiagnosticsBundle } from "@/lib/lfcc/useDiagnosticsBundle";
import { useReproBundle } from "@/lib/lfcc/useReproBundle";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

// ============================================================================
// Helpers for position-based annotation detection
// ============================================================================

/**
 * Find all annotations that cover a given document position.
 * Returns annotations with their span size for specificity ordering.
 * Prefers the SMALLEST (most specific) annotation at a given position.
 */
function findAnnotationsAtPosition(
  view: EditorView,
  annotations: Annotation[],
  docPos: number
): Array<{ id: string; spanSize: number; createdAtMs: number }> {
  const result: Array<{ id: string; spanSize: number; createdAtMs: number }> = [];

  // Build a block position map for efficient lookup
  const blockPosMap = new Map<string, number>();
  view.state.doc.descendants((node, pos) => {
    const blockId = node.attrs?.block_id;
    if (typeof blockId === "string" && blockId.trim() !== "") {
      blockPosMap.set(blockId, pos);
    }
    return true;
  });

  for (const annotation of annotations) {
    if (annotation.displayState === "orphan" || !annotation.spans?.length) {
      continue;
    }

    // Check if any span covers this position
    for (const span of annotation.spans) {
      const blockPos = blockPosMap.get(span.blockId);
      if (blockPos === undefined) {
        continue;
      }

      const contentStart = blockPos + 1;
      const from = contentStart + span.start;
      const to = contentStart + span.end;

      if (docPos >= from && docPos <= to) {
        const spanSize = to - from;
        result.push({
          id: annotation.id,
          spanSize,
          createdAtMs: annotation.createdAtMs,
        });
        break; // This annotation covers the position, no need to check other spans
      }
    }
  }

  return result;
}

export interface AnnotationManagerProps {
  docId?: string;
  syncSummary?: DiagnosticsSyncSummary;
  onReload?: () => void;
  onReadOnly?: () => void;
  isReadOnly?: boolean;
  missingAnnotationId?: string | null;
}

export function AnnotationManager({
  docId,
  syncSummary,
  onReload,
  onReadOnly,
  isReadOnly = false,
  missingAnnotationId,
}: AnnotationManagerProps) {
  const lfcc = useLfccEditorContext();
  const annotationsMap = useAnnotationStore((s) => s.annotations);
  const comments = useCommentStore((s) => s.comments);
  const annotations = React.useMemo(() => Object.values(annotationsMap), [annotationsMap]);
  const handleDelete = React.useCallback((annotationId: string) => {
    annotationController.removeAnnotation(annotationId);
  }, []);
  const setFocusedAnnotationId = useAnnotationStore((s) => s.setFocusedAnnotationId);
  const [panelHoveredId, setPanelHoveredId] = React.useState<string | null>(null);
  const [editorHoveredId, setEditorHoveredId] = React.useState<string | null>(null);
  const hoveredAnnotationId = panelHoveredId ?? editorHoveredId;
  const isDev = process.env.NODE_ENV !== "production";
  const [includeContent, setIncludeContent] = React.useState(false);
  const { copy, isAvailable } = useDiagnosticsBundle({
    syncSummary,
    includeContent: isDev ? includeContent : false,
  });
  const { download, isAvailable: reproAvailable } = useReproBundle();
  // Orphan Logic
  const orphanAnnotations = React.useMemo(() => {
    const threadIds = Object.keys(comments);
    return threadIds
      .filter((id) => !annotationsMap[id])
      .map(
        (id) =>
          ({
            id,
            kind: "text",
            content: "Orphaned Thread",
            displayState: "orphan" as const,
            spans: [],
            verified: false,
            createdAt: 0,
            color: "yellow", // Default color for orphaned annotations
            chain: { policy: { kind: "orphan", maxInterveningBlocks: 0 } },
          }) as unknown as Annotation
      );
  }, [comments, annotationsMap]);

  const allAnnotations = React.useMemo(() => {
    return [...annotations, ...orphanAnnotations];
  }, [annotations, orphanAnnotations]);

  // Position-based hover detection: find all annotations at pointer position
  // and pick the SMALLEST (most specific) one for interaction
  React.useEffect(() => {
    if (!lfcc?.view?.dom) {
      return;
    }

    const view = lfcc.view;
    const root = view.dom;

    const handlePointerMove = (event: PointerEvent) => {
      // Convert pointer coordinates to document position
      const coords = { left: event.clientX, top: event.clientY };
      const posInfo = view.posAtCoords(coords);

      if (!posInfo) {
        setEditorHoveredId(null);
        return;
      }

      const docPos = posInfo.pos;

      // Find all annotations covering this position
      const coveringAnnotations = findAnnotationsAtPosition(view, annotations, docPos);

      if (coveringAnnotations.length === 0) {
        setEditorHoveredId(null);
        return;
      }

      // Pick the SMALLEST annotation (most specific) - if same size, prefer newest
      coveringAnnotations.sort((a, b) => {
        if (a.spanSize !== b.spanSize) {
          return a.spanSize - b.spanSize; // Smallest first
        }
        return b.createdAtMs - a.createdAtMs; // Newest first as tiebreaker
      });
      setEditorHoveredId(coveringAnnotations[0].id);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const related = event.relatedTarget as HTMLElement | null;
      if (related && root.contains(related)) {
        // Still inside editor, let pointerMove handle it
        return;
      }
      setEditorHoveredId(null);
    };

    root.addEventListener("pointermove", handlePointerMove);
    root.addEventListener("pointerout", handlePointerOut);

    return () => {
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerout", handlePointerOut);
    };
  }, [lfcc, annotations]);

  React.useEffect(() => {
    if (!lfcc?.view?.dom) {
      return;
    }

    const root = lfcc.view.dom;
    for (const el of root.querySelectorAll(".lfcc-annotation--panel-hover")) {
      el.classList.remove("lfcc-annotation--panel-hover");
    }

    if (!hoveredAnnotationId) {
      return;
    }

    const escapedId = hoveredAnnotationId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    for (const el of root.querySelectorAll(`[data-annotation-id="${escapedId}"]`)) {
      el.classList.add("lfcc-annotation--panel-hover");
    }
  }, [lfcc, hoveredAnnotationId]);

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      // Check if clicking inside an annotation
      const annotationEl = target.closest("[data-annotation-id]");
      if (annotationEl) {
        const annotationId = annotationEl.getAttribute("data-annotation-id");
        if (annotationId) {
          setFocusedAnnotationId(annotationId);
        }
        return;
      }

      // Check if clicking inside the annotation panel
      if (target.closest('[data-annotation-role="panel-item"]')) {
        return;
      }

      setFocusedAnnotationId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [setFocusedAnnotationId]);

  const { toast } = useToast();

  const handleScrollTo = React.useCallback(
    (annotationId: string) => {
      const result = annotationController.scrollToAnnotation(annotationId);
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
    },
    [toast]
  );

  const handleSelect = React.useCallback(
    (annotationId: string) => {
      handleScrollTo(annotationId);
    },
    [handleScrollTo]
  );

  const handleCopyDiagnostics = React.useCallback(async () => {
    if (!isAvailable) {
      return;
    }
    const ok = await copy();
    if (!ok) {
      toast("Diagnostics copy failed. Check clipboard permissions.", "error");
      return;
    }
    const count = allAnnotations.length;
    toast(`Diagnostics copied! (${count} annotation${count === 1 ? "" : "s"})`, "success");
  }, [copy, isAvailable, toast, allAnnotations.length]);

  const handleExportRepro = React.useCallback(() => {
    if (!reproAvailable) {
      return;
    }
    const ok = download();
    if (!ok) {
      toast("Repro export failed. Try again.", "error");
      return;
    }
    toast("Repro bundle downloaded.", "success");
  }, [download, reproAvailable, toast]);

  const issueActions = React.useMemo<IssueActionHandlers>(
    () => ({
      onCopyDiagnostics: isAvailable ? handleCopyDiagnostics : undefined,
      onExportRepro: reproAvailable ? handleExportRepro : undefined,
      onReload,
      onReadOnly: isReadOnly ? undefined : onReadOnly,
    }),
    [
      handleCopyDiagnostics,
      handleExportRepro,
      isAvailable,
      isReadOnly,
      onReadOnly,
      onReload,
      reproAvailable,
    ]
  );

  const handleShare = React.useCallback(async () => {
    // Logic extracted to helper to reduce complexity
    const activeAnno = useAnnotationStore.getState().focusedAnnotationId;
    const url = getShareUrl(
      window.location.href,
      docId,
      lfcc?.view ?? null, // Pass view or null
      activeAnno
    );

    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard", "success");
  }, [docId, toast, lfcc]);

  const handleCopyAnnotationLink = React.useCallback(
    async (annotationId: string) => {
      const url = getAnnotationShareUrl(window.location.href, docId, annotationId);
      try {
        await navigator.clipboard.writeText(url);
        toast("Annotation link copied.", "success");
      } catch {
        toast("Failed to copy annotation link.", "error");
      }
    },
    [docId, toast]
  );

  return (
    <AnnotationPanel
      annotations={allAnnotations}
      onSelect={handleSelect}
      onDelete={handleDelete}
      hoveredAnnotationId={hoveredAnnotationId}
      onHover={setPanelHoveredId}
      onCopyDiagnostics={handleCopyDiagnostics}
      copyDiagnosticsDisabled={!isAvailable}
      onShare={handleShare}
      onCopyLink={handleCopyAnnotationLink}
      onScrollTo={handleScrollTo}
      syncSummary={syncSummary}
      showDiagnosticsToggle={isDev}
      includeDiagnosticsContent={includeContent}
      onIncludeDiagnosticsContentChange={setIncludeContent}
      issueActions={issueActions}
      isReadOnly={isReadOnly}
      missingAnnotationId={missingAnnotationId}
    />
  );
}

// Helper to generate deep link URL
function getShareUrl(
  currentHref: string,
  docId: string | undefined,
  view: EditorView | null | undefined,
  activeAnnoId: string | null
): string {
  const current = new URL(currentHref);

  // 1. Ensure doc ID
  if (docId) {
    if (!current.searchParams.has("doc") && docId !== "demo-doc") {
      current.searchParams.set("doc", docId);
    } else if (current.searchParams.get("doc") !== docId) {
      current.searchParams.set("doc", docId);
    }
  }

  // 2. Add block deep link if selection exists
  if (view) {
    const { selection, doc } = view.state;
    if (!selection.empty) {
      let blockId: string | null = null;
      // biome-ignore lint/suspicious/noExplicitAny: proseMirror type
      doc.nodesBetween(selection.from, selection.to, (node: any) => {
        if (blockId) {
          return false;
        }
        if (node.attrs.block_id) {
          blockId = node.attrs.block_id;
        }
        return true;
      });

      if (blockId) {
        current.searchParams.set("block", blockId);
      }
    }
  }

  // 3. Add annotation deep link
  if (activeAnnoId) {
    current.searchParams.set("ann", activeAnnoId);
  }

  return current.toString();
}

function getAnnotationShareUrl(
  currentHref: string,
  docId: string | undefined,
  annotationId: string
): string {
  const current = new URL(currentHref);

  if (docId) {
    if (!current.searchParams.has("doc") && docId !== "demo-doc") {
      current.searchParams.set("doc", docId);
    } else if (current.searchParams.get("doc") !== docId) {
      current.searchParams.set("doc", docId);
    }
  }

  current.searchParams.set("ann", annotationId);
  current.searchParams.delete("block");
  return current.toString();
}
