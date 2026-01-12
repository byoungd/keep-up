/**
 * Highlight Geometry Engine
 *
 * Computes screen geometry for annotations to render in the overlay layer.
 * Extends rangeGeometry.ts with multi-annotation support and z-index ordering.
 *
 * Architecture:
 * - CRDT layer: stores annotation spans (unchanged)
 * - Geometry layer: computes screen positions for overlay rendering
 * - Overlay layer: renders highlights with true z-index stacking
 */

import type { EditorView } from "prosemirror-view";

import type { ResolvedAnnotation } from "./annotationResolution";
import { computeRangeGeometry } from "./rangeGeometry";

// ============================================================================
// Types
// ============================================================================

/**
 * Screen geometry for a single annotation, ready for overlay rendering.
 */
export interface AnnotationGeometry {
  /** Annotation ID */
  annotationId: string;
  /** Highlight color */
  color: string;
  /** z-index for stacking (based on creation time) */
  zIndex: number;
  /** Creation timestamp (for ordering) */
  createdAt: number;
  /** Display state */
  state: ResolvedAnnotation["state"];
  /** Screen rectangles (one per line for wrapped text) */
  rects: DOMRect[];
  /** Start handle position */
  startCoords: { left: number; top: number; bottom: number } | null;
  /** End handle position */
  endCoords: { left: number; top: number; bottom: number } | null;
}

/**
 * Segment representing a unique region with potentially multiple overlapping annotations.
 * Used for computing multi-layer visual effects.
 */
export interface HighlightSegment {
  /** Document position start */
  from: number;
  /** Document position end */
  to: number;
  /** Annotations covering this segment, ordered by creation time */
  annotations: Array<{
    id: string;
    color: string;
    createdAt: number;
  }>;
  /** Screen rectangles for this segment */
  rects: DOMRect[];
}

// ============================================================================
// Geometry Computation
// ============================================================================

/**
 * Compute screen geometry for a single resolved annotation.
 */
export function computeAnnotationGeometry(
  view: EditorView,
  annotation: ResolvedAnnotation,
  createdAt: number
): AnnotationGeometry | null {
  if (annotation.state === "orphan" || annotation.ranges.length === 0) {
    return null;
  }

  // Sort ranges by position for consistent start/end
  const sortedRanges = [...annotation.ranges].sort((a, b) => a.from - b.from);

  // STRATEGY 1: DOM Span Lookup (Preferred)
  // If the annotation is already rendered by ProseMirror as inline decorations,
  // simply use those DOM elements' rects. This guarantees perfect alignment
  // with the text and handles, regardless of cursor presence or complex layout.
  const domResult = computeGeometryViaSpanLookup(view, sortedRanges);

  if (domResult) {
    const { rects, startRect, endRect } = domResult;
    return {
      annotationId: annotation.id,
      color: annotation.color ?? "yellow",
      zIndex: createdAt,
      createdAt,
      state: annotation.state,
      rects,
      startCoords: startRect
        ? {
            left: startRect.left,
            top: startRect.top,
            bottom: startRect.bottom,
          }
        : null,
      endCoords: endRect
        ? {
            left: endRect.right, // End handle is at the right edge
            top: endRect.top,
            bottom: endRect.bottom,
          }
        : null,
    };
  }

  // STRATEGY 2: Mathematical Calculation (Fallback)
  // If spans aren't in the DOM (e.g., loading, ghost state, or during rapid updates),
  // calculate geometry from document positions.
  // STRATEGY 2: Mathematical Calculation (Fallback)
  // If spans aren't in the DOM (e.g., loading, ghost state, or during rapid updates),
  // calculate geometry from document positions.
  const rangeResult = computeGeometryViaRanges(view, sortedRanges);

  if (rangeResult) {
    return {
      annotationId: annotation.id,
      color: annotation.color ?? "yellow",
      zIndex: createdAt,
      createdAt,
      state: annotation.state,
      rects: rangeResult.rects,
      startCoords: rangeResult.startCoords,
      endCoords: rangeResult.endCoords,
    };
  }

  return null;
}

/**
 * Compute geometries for all annotations, ordered by z-index.
 */
export function computeAllAnnotationGeometries(
  view: EditorView,
  annotations: ResolvedAnnotation[],
  createdAtMap: Map<string, number>
): AnnotationGeometry[] {
  const geometries: AnnotationGeometry[] = [];

  for (const annotation of annotations) {
    const createdAt = createdAtMap.get(annotation.id) ?? Date.now();
    const geometry = computeAnnotationGeometry(view, annotation, createdAt);
    if (geometry) {
      geometries.push(geometry);
    } else if (process.env.NODE_ENV !== "production") {
      // DEBUG: Log why geometry computation failed
      console.warn("[highlightGeometry] Failed to compute geometry", {
        id: annotation.id.slice(0, 8),
        state: annotation.state,
        rangesCount: annotation.ranges.length,
        ranges: annotation.ranges.map((r) => ({
          blockId: r.blockId?.slice(0, 8),
          from: r.from,
          to: r.to,
        })),
      });
    }
  }

  // Sort by z-index (creation time) for proper stacking
  return geometries.sort((a, b) => a.zIndex - b.zIndex);
}

// ============================================================================
// Segment Map (for multi-layer overlaps)
// ============================================================================

type AnnotationRangeInfo = {
  from: number;
  to: number;
  color: string;
  createdAt: number;
};

/**
 * Collect boundary points and range info from annotations.
 */
function collectBoundaryData(
  annotations: ResolvedAnnotation[],
  createdAtMap: Map<string, number>
): {
  points: Set<number>;
  rangesByAnnotation: Map<string, AnnotationRangeInfo[]>;
} {
  const points = new Set<number>();
  const rangesByAnnotation = new Map<string, AnnotationRangeInfo[]>();

  for (const annotation of annotations) {
    if (annotation.state === "orphan" || annotation.ranges.length === 0) {
      continue;
    }

    const ranges: AnnotationRangeInfo[] = [];
    const createdAt = createdAtMap.get(annotation.id) ?? Date.now();

    for (const range of annotation.ranges) {
      points.add(range.from);
      points.add(range.to);
      ranges.push({
        from: range.from,
        to: range.to,
        color: annotation.color ?? "yellow",
        createdAt,
      });
    }

    rangesByAnnotation.set(annotation.id, ranges);
  }

  return { points, rangesByAnnotation };
}

/**
 * Find annotations covering a specific segment.
 */
function findCoveringAnnotations(
  from: number,
  to: number,
  annotations: ResolvedAnnotation[],
  rangesByAnnotation: Map<string, AnnotationRangeInfo[]>
): Array<{ id: string; color: string; createdAt: number }> {
  const covering: Array<{ id: string; color: string; createdAt: number }> = [];

  for (const annotation of annotations) {
    const ranges = rangesByAnnotation.get(annotation.id);
    if (!ranges) {
      continue;
    }

    const coversSegment = ranges.some((r) => r.from <= from && r.to >= to);
    if (coversSegment) {
      covering.push({
        id: annotation.id,
        color: ranges[0].color,
        createdAt: ranges[0].createdAt,
      });
    }
  }

  // Sort by creation time
  covering.sort((a, b) => a.createdAt - b.createdAt);
  return covering;
}

/**
 * Build a segment map showing which annotations cover each unique region.
 * Used to render multi-layer visual effects at overlap points.
 */
export function buildSegmentMap(
  view: EditorView,
  annotations: ResolvedAnnotation[],
  createdAtMap: Map<string, number>
): HighlightSegment[] {
  const { points, rangesByAnnotation } = collectBoundaryData(annotations, createdAtMap);

  // Sort boundary points
  const sortedPoints = [...points].sort((a, b) => a - b);

  if (sortedPoints.length < 2) {
    return [];
  }

  // Generate segments
  const segments: HighlightSegment[] = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const from = sortedPoints[i];
    const to = sortedPoints[i + 1];

    const covering = findCoveringAnnotations(from, to, annotations, rangesByAnnotation);
    if (covering.length === 0) {
      continue;
    }

    // Compute geometry for this segment
    const geometry = computeRangeGeometry(view, from, to);
    const rects = geometry?.rects ?? [];

    segments.push({
      from,
      to,
      annotations: covering,
      rects,
    });
  }

  return segments;
}

// ============================================================================
// Viewport Culling (Performance)
// ============================================================================

/**
 * Filter geometries to only those visible in the viewport.
 */
export function cullToViewport(
  geometries: AnnotationGeometry[],
  viewportTop: number,
  viewportBottom: number
): AnnotationGeometry[] {
  return geometries.filter((geo) =>
    geo.rects.some((rect) => rect.bottom > viewportTop && rect.top < viewportBottom)
  );
}

/**
 * Filter segments to only those visible in the viewport.
 */
export function cullSegmentsToViewport(
  segments: HighlightSegment[],
  viewportTop: number,
  viewportBottom: number
): HighlightSegment[] {
  return segments.filter((seg) =>
    seg.rects.some((rect) => rect.bottom > viewportTop && rect.top < viewportBottom)
  );
}

/**
 * Helper to compute geometry by looking up existing DOM spans.
 */
function computeGeometryViaSpanLookup(
  view: EditorView,
  ranges: ResolvedAnnotation["ranges"]
): { rects: DOMRect[]; startRect: DOMRect | null; endRect: DOMRect | null } | null {
  const domRects: DOMRect[] = [];
  let startRect: DOMRect | null = null;
  let endRect: DOMRect | null = null;

  for (const range of ranges) {
    if (!range.spanId) {
      return null;
    }

    // Look for ALL specific spans in the editor DOM (ProseMirror may split them)
    // Using querySelectorAll ensures we get all parts of a split highlight
    // We use class selector because PM attribute merging can overwrite data keys on overlaps, but classes merge.
    const selector = `.lfcc-span-${CSS.escape(range.spanId)}`;
    const spans = view.dom.querySelectorAll(selector);
    if (spans.length === 0) {
      return null;
    }

    for (const span of Array.from(spans)) {
      const rects = Array.from(span.getClientRects());
      if (rects.length === 0) {
        continue;
      }

      domRects.push(...rects);

      // We process spans in document order (guaranteed by querySelectorAll)
      // So startRect is set once from the first valid rect of the first valid span
      if (!startRect) {
        startRect = rects[0];
      }
      // endRect acts as a running update, so it will end up being the last rect of the last span
      endRect = rects[rects.length - 1];
    }
  }

  if (domRects.length === 0) {
    return null;
  }

  return { rects: domRects, startRect, endRect };
}

/**
 * Helper to compute geometry from document positions (fallback).
 */
function computeGeometryViaRanges(
  view: EditorView,
  ranges: ResolvedAnnotation["ranges"]
): {
  rects: DOMRect[];
  startCoords: AnnotationGeometry["startCoords"];
  endCoords: AnnotationGeometry["endCoords"];
} | null {
  const allRects: DOMRect[] = [];
  let startCoords: AnnotationGeometry["startCoords"] = null;
  let endCoords: AnnotationGeometry["endCoords"] = null;

  for (const range of ranges) {
    const geometry = computeRangeGeometry(view, range.from, range.to);
    if (!geometry) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[highlightGeometry] computeRangeGeometry returned null", {
          range: { from: range.from, to: range.to },
        });
      }
      continue;
    }

    allRects.push(...geometry.rects);

    if (!startCoords) {
      startCoords = geometry.startCoords;
    }
    endCoords = geometry.endCoords;
  }

  if (allRects.length === 0) {
    return null;
  }

  return { rects: allRects, startCoords, endCoords };
}
