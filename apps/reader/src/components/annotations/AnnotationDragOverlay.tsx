"use client";

import { type DragPreviewState, subscribeToDragPreview } from "@/lib/annotations/annotationPlugin";
import { type RangeGeometry, computeRangeGeometry } from "@/lib/annotations/rangeGeometry";
import type { EditorView } from "prosemirror-view";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AnnotationDragOverlayProps {
  /** Reference to the ProseMirror EditorView */
  editorView: EditorView | null;
}

/**
 * External overlay for drag preview rendering.
 * Renders outside ProseMirror DOM to avoid decoration rebuilds and text jank.
 */
export function AnnotationDragOverlay({ editorView }: AnnotationDragOverlayProps) {
  const [preview, setPreview] = useState<DragPreviewState | null>(null);
  const [geometry, setGeometry] = useState<RangeGeometry | null>(null);
  const rafRef = useRef<number | null>(null);

  // Subscribe to drag preview state changes
  useEffect(() => {
    return subscribeToDragPreview((state) => {
      if (process.env.NODE_ENV !== "production" && state) {
        console.info("[AnnotationDragOverlay] Received preview state", {
          annotationId: state.annotationId.slice(0, 8),
          from: state.from,
          to: state.to,
          color: state.color,
          mouseX: state.mouseX,
          mouseY: state.mouseY,
          hasEditorView: !!editorView,
        });
      }
      setPreview(state);
    });
  }, [editorView]);

  // Compute geometry when preview changes
  const updateGeometry = useCallback(() => {
    if (!preview || !editorView) {
      if (process.env.NODE_ENV !== "production" && preview && !editorView) {
        console.warn("[AnnotationDragOverlay] Cannot compute geometry - no editorView");
      }
      setGeometry(null);
      return;
    }

    const geo = computeRangeGeometry(editorView, preview.from, preview.to);
    if (process.env.NODE_ENV !== "production") {
      console.info("[AnnotationDragOverlay] Computed geometry", {
        from: preview.from,
        to: preview.to,
        hasGeo: !!geo,
        rectsCount: geo?.rects.length ?? 0,
      });
    }
    setGeometry(geo);
  }, [preview, editorView]);

  // Use rAF for smooth geometry updates
  useEffect(() => {
    if (!preview) {
      setGeometry(null);
      return;
    }

    // Schedule geometry update on next frame
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      updateGeometry();
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [preview, updateGeometry]);

  // Don't render if no preview or geometry
  if (!preview || !geometry || geometry.rects.length === 0) {
    return null;
  }

  const { handleType, mouseX } = preview;
  const colorClass = preview.color || "yellow";

  return createPortal(
    <div
      className="annotation-drag-overlay"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 600, // Above highlights (z-10) and toolbar (z-50)
      }}
    >
      {/* Highlight rectangles - preview of the new range */}
      {geometry.rects.map((rect, index) => (
        <div
          key={`rect-${index}-${rect.left}-${rect.top}`}
          className={`annotation-preview annotation-preview--${colorClass}`}
          style={{
            position: "absolute",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}

      {/* Static handle - the anchor end that doesn't move */}
      <div
        className={`annotation-preview-handle annotation-preview-handle--${handleType === "start" ? "end" : "start"} annotation-preview-handle--${colorClass}`}
        style={{
          position: "absolute",
          left: handleType === "start" ? geometry.endCoords.left : geometry.startCoords.left - 6,
          top: handleType === "start" ? geometry.endCoords.top : geometry.startCoords.top,
          width: 6,
          height:
            handleType === "start"
              ? geometry.endCoords.bottom - geometry.endCoords.top
              : geometry.startCoords.bottom - geometry.startCoords.top,
        }}
      />

      {/* Dragging handle - follows the mouse cursor, styled like hover handle */}
      <div
        className={`annotation-preview-handle annotation-preview-handle--${handleType} annotation-preview-handle--${colorClass}`}
        style={{
          position: "absolute",
          // Position centered on mouse X, aligned with highlight height
          left: mouseX - 3,
          top: handleType === "start" ? geometry.startCoords.top : geometry.endCoords.top,
          width: 6,
          height:
            handleType === "start"
              ? geometry.startCoords.bottom - geometry.startCoords.top
              : geometry.endCoords.bottom - geometry.endCoords.top,
          // Subtle scale up for active state
          transform: "scaleX(1.2)",
          opacity: 0.9,
        }}
      />
    </div>,
    document.body
  );
}
