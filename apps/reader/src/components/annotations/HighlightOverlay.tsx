"use client";

/**
 * Highlight Overlay
 *
 * Renders annotation highlights in a separate overlay layer, bypassing
 * ProseMirror's decoration system for full visual control.
 *
 * Benefits:
 * - True z-index stacking for overlapping annotations
 * - No DOM conflicts with ProseMirror decorations
 * - Smooth animations and visual effects
 * - Multi-layer overlap visualization
 *
 * Performance optimizations:
 * - Stable annotation ID list selector to avoid unnecessary re-renders
 * - Debounced geometry updates with RAF batching
 * - Viewport culling for large documents
 * - Memoized color/opacity helpers
 */

import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import {
  buildBlockIndex,
  resolveAnnotationsForDecorations,
} from "@/lib/annotations/annotationResolution";
import {
  type AnnotationGeometry,
  computeAllAnnotationGeometries,
  cullToViewport,
} from "@/lib/annotations/highlightGeometry";
import { useAnnotationStore } from "@/lib/kernel/store";
import * as React from "react";
// Removed createPortal import as we now render inline

// ============================================================================
// Constants (PERF: Extract magic numbers for maintainability)
// ============================================================================

/** Debounce interval for geometry updates (~1 frame at 60fps) */
const GEOMETRY_DEBOUNCE_MS = 16;

// ============================================================================
// Types
// ============================================================================

interface HighlightOverlayProps {
  /** Enable multi-layer segment rendering for overlaps */
  enableSegmentMode?: boolean;
  /** Enable viewport culling for performance */
  enableViewportCulling?: boolean;
}

// ============================================================================
// Stable Selectors (PERF: avoid object reference changes)
// ============================================================================

/**
 * Stable selector for annotation key - changes when IDs or ranges change.
 * This ensures geometry updates when annotation ranges are modified (e.g., handle drag).
 */
const selectAnnotationKey = (s: ReturnType<typeof useAnnotationStore.getState>) => {
  const entries = Object.values(s.annotations);
  if (entries.length === 0) {
    return "";
  }
  // Include ID + start/end to detect range changes from handle dragging
  return entries
    .map((a) => `${a.id}:${a.start ?? ""}:${a.end ?? ""}`)
    .sort()
    .join(",");
};

/** Get annotations map directly for computation (not for React deps) */
const getAnnotationsMap = () => useAnnotationStore.getState().annotations;

// ============================================================================
// Main Component
// ============================================================================

export const HighlightOverlay = React.memo(function HighlightOverlay({
  enableViewportCulling = true,
}: HighlightOverlayProps) {
  const context = useLfccEditorContext();
  // PERF FIX: Extract stable references to avoid re-renders when syncSummary changes
  const view = context?.view;
  const runtime = context?.runtime;

  // PERF: Use stable key string that includes IDs and ranges
  // This triggers re-render when annotation IDs OR ranges change (e.g., handle drag)
  const annotationKey = useAnnotationStore(selectAnnotationKey);
  const focusedAnnotationId = useAnnotationStore((s) => s.focusedAnnotationId);

  const [geometries, setGeometries] = React.useState<AnnotationGeometry[]>([]);
  const [editorRect, setEditorRect] = React.useState<DOMRect | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const [mounted, setMounted] = React.useState(false);

  // Track last computed state to avoid redundant updates
  const lastComputeKeyRef = React.useRef<string>("");

  // Track mount state for portal
  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Compute geometries - stable callback that reads from store directly
  const updateGeometries = React.useCallback(() => {
    if (!view || !runtime || view.isDestroyed) {
      setGeometries([]);
      setEditorRect(null);
      return;
    }

    // Get editor bounding rect for coordinate conversion
    const rect = view.dom.getBoundingClientRect();
    setEditorRect(rect);

    // Read annotations directly from store (not from React state)
    const annotations = getAnnotationsMap();
    const annotationList = Object.values(annotations);
    if (annotationList.length === 0) {
      setGeometries([]);
      return;
    }

    // Build createdAt map inline (cheap operation)
    const createdAtMap = new Map<string, number>();
    for (const annotation of annotationList) {
      createdAtMap.set(annotation.id, annotation.createdAtMs);
    }

    const blockIndex = buildBlockIndex(view.state);
    const { resolved } = resolveAnnotationsForDecorations(
      annotationList,
      runtime,
      view.state,
      blockIndex
    );

    // Compute geometries
    let geos = computeAllAnnotationGeometries(view, resolved, createdAtMap);

    // Viewport culling
    if (enableViewportCulling && geos.length > 0) {
      geos = cullToViewport(geos, 0, window.innerHeight);
    }

    setGeometries(geos);
  }, [view, runtime, enableViewportCulling]);

  // Subscribe to scroll/resize/focus for geometry updates
  React.useEffect(() => {
    if (!view) {
      return;
    }

    // Debounce updates to prevent rapid-fire geometry calculations
    let updateTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleUpdate = () => {
      if (updateTimeout !== null) {
        return; // Already scheduled
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      updateTimeout = setTimeout(() => {
        updateTimeout = null;
        rafRef.current = requestAnimationFrame(() => {
          updateGeometries();
          rafRef.current = null;
        });
      }, GEOMETRY_DEBOUNCE_MS);
    };

    // Immediate update without debounce (for critical events like focus)
    // Uses double-RAF to allow DOM layout to stabilize after cursor insertion
    const forceUpdate = () => {
      if (updateTimeout !== null) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      // Double-RAF: First RAF for DOM changes to apply, second RAF for layout to stabilize
      rafRef.current = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateGeometries();
          rafRef.current = null;
        });
      });
    };

    // Initial update - wait for fonts and layout to be ready
    const performInitialUpdate = async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      // Double RAF for initial load to ensure layout is stable
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateGeometries();
        });
      });
    };
    performInitialUpdate();

    // Listen for scroll
    const handleScroll = () => scheduleUpdate();
    view.dom.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Listen for resize
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(view.dom);

    // Listen for DOM structure mutations (block reorder, additions, deletions)
    // PERF: Removed characterData - text changes are tracked via React's doc reference
    // This eliminates per-keystroke MutationObserver callbacks
    const mutationObserver = new MutationObserver(() => scheduleUpdate());
    mutationObserver.observe(view.dom, {
      childList: true,
      subtree: true,
      // characterData removed - redundant with useLayoutEffect doc tracking
    });

    // FIX: Listen for focus/blur - this causes layout shifts that invalidate coordinates
    const handleFocus = () => forceUpdate();
    const handleBlur = () => forceUpdate();
    view.dom.addEventListener("focus", handleFocus, { capture: true });
    view.dom.addEventListener("blur", handleBlur, { capture: true });

    // Listen for selection changes - cursor placement can affect layout
    // PERF: Use scheduleUpdate instead of forceUpdate to throttle rapid selections
    const handleSelectionChange = () => scheduleUpdate();
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (updateTimeout !== null) {
        clearTimeout(updateTimeout);
      }
      view.dom.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      view.dom.removeEventListener("focus", handleFocus, { capture: true });
      view.dom.removeEventListener("blur", handleBlur, { capture: true });
      document.removeEventListener("selectionchange", handleSelectionChange);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [view, updateGeometries]);

  // Track document and annotation changes
  const editorDoc = view?.state.doc;

  // Track last doc reference to detect document changes (including block reorder)
  const lastDocRef = React.useRef<typeof editorDoc | null>(null);

  // PERF: Combine doc + annotation changes into single effect with dedup for annotations only
  // FIX: Use useLayoutEffect + synchronous RAF to minimize visual lag
  React.useLayoutEffect(() => {
    if (!view || !editorDoc) {
      return;
    }

    // Check if doc reference changed (handles block reorder, edits, etc.)
    const docChanged = lastDocRef.current !== editorDoc;
    lastDocRef.current = editorDoc;

    // Only deduplicate on annotation key - doc changes always need geometry refresh
    if (!docChanged && annotationKey === lastComputeKeyRef.current) {
      return; // Skip redundant update (same annotations, same doc)
    }
    lastComputeKeyRef.current = annotationKey;

    // FIX: Schedule geometry update with single RAF for immediate sync
    // (Removed double-RAF which was causing 2-frame lag)
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      updateGeometries();
      rafRef.current = null;
    });
  }, [view, editorDoc, annotationKey, updateGeometries]);

  // Don't render if no geometries or not mounted
  if (!mounted || geometries.length === 0 || !editorRect) {
    return null;
  }

  // Render directly in DOM flow (no portal) to allow layering behind text
  // The parent container (LfccDragLayer) manages stacking context
  return (
    <div
      className="highlight-overlay"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0, // Base layer, effectively background
        // Removed isolation: isolate to allow blending with background if needed,
        // but since we want it BEHIND text, it will be the bottom of the stack.
      }}
      aria-hidden="true"
    >
      {geometries.map((geo, index) => (
        <HighlightLayer
          key={geo.annotationId}
          geometry={geo}
          isFocused={geo.annotationId === focusedAnnotationId}
          orderIndex={index}
        />
      ))}
    </div>
  );
});

// ============================================================================
// Individual Highlight Layer
// ============================================================================

interface HighlightLayerProps {
  geometry: AnnotationGeometry;
  isFocused: boolean;
  /** Order index for z-index calculation (based on creation time sort order) */
  orderIndex: number;
}

const HighlightLayer = React.memo(function HighlightLayer({
  geometry,
  isFocused,
  orderIndex,
}: HighlightLayerProps) {
  const { annotationId, color, state, rects } = geometry;

  // Skip orphan annotations
  if (state === "orphan") {
    return null;
  }

  // Compute opacity based on state
  const opacity = getOpacityForState(state);

  // Get color value
  const colorValue = getHighlightColor(color);

  return (
    <>
      {rects.map((rect, index) => (
        <div
          key={`${annotationId}-${index}-${rect.left}-${rect.top}`}
          className={`highlight-rect highlight-rect--${color} ${isFocused ? "highlight-rect--focused" : ""}`}
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: colorValue,
            opacity: isFocused ? opacity + 0.1 : opacity, // Slight boost on focus
            mixBlendMode: "multiply",
            zIndex: orderIndex + 1,
            borderRadius: 0, // No rounded corners for marker feel and seamless overlaps
            transition: "opacity 150ms ease-out",
          }}
          data-annotation-id={annotationId}
        />
      ))}
    </>
  );
});

// ============================================================================
// Helpers (memoized at module level)
// ============================================================================

function getOpacityForState(state: AnnotationGeometry["state"]): number {
  switch (state) {
    case "active":
      return 0.5; // Increased for lighter colors + multiply
    case "active_partial":
      return 0.4;
    case "active_unverified":
      return 0.3;
    case "broken_grace":
      return 0.2;
    case "orphan":
      return 0;
    default:
      return 0.3;
  }
}

// Pre-computed color map for O(1) lookup
const HIGHLIGHT_COLORS: Record<string, string> = {
  // Lighter "300" shades for multiply blend mode
  yellow: "rgb(253, 224, 71)", // Yellow-300
  green: "rgb(134, 239, 172)", // Green-300
  red: "rgb(252, 165, 165)", // Red-300
  purple: "rgb(216, 180, 254)", // Purple-300
  blue: "rgb(147, 197, 253)", // Blue-300
};

function getHighlightColor(color: string): string {
  return HIGHLIGHT_COLORS[color] ?? HIGHLIGHT_COLORS.yellow;
}
