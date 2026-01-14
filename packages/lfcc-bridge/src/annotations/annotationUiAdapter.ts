import type { DisplayAnnoState } from "@ku0/core";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

// ============================================================================
// Types
// ============================================================================

export type AnnotationSpan = {
  annoId: string;
  spanId: string;
  blockId: string;
  from: number;
  to: number;
  state: DisplayAnnoState;
  color?: string;
};

export type ResolvedRange = {
  annoId: string;
  spanId: string;
  blockId: string;
  from: number;
  to: number;
};

export type AnnotationWithRanges = {
  id: string;
  state: DisplayAnnoState;
  color?: string;
  ranges: ResolvedRange[];
};

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate deterministic decoration key
 * Format: anno:{annotation_id}:span:{span_id}:block:{block_id}
 */
export const decorationKeyForSpan = (span: AnnotationSpan): string =>
  `anno:${span.annoId}:span:${span.spanId}:block:${span.blockId}`;

/**
 * Generate key from resolved range
 */
export const decorationKeyForRange = (annoId: string, range: ResolvedRange): string =>
  `anno:${annoId}:span:${range.spanId}:block:${range.blockId}`;

// ============================================================================
// CSS Class Generation
// ============================================================================

/**
 * Get CSS classes for annotation state
 * - active: full highlight
 * - active_partial: partial highlight with indicator
 * - active_unverified: pending verification style
 * - broken_grace: grace period style
 * - orphan: no rendering (returns null)
 */
export function getStateClasses(state: DisplayAnnoState): string | null {
  switch (state) {
    case "active":
      return "lfcc-annotation lfcc-annotation--active";
    case "active_partial":
      return "lfcc-annotation lfcc-annotation--partial";
    case "active_unverified":
      return "lfcc-annotation lfcc-annotation--unverified";
    case "broken_grace":
      return "lfcc-annotation lfcc-annotation--grace";
    case "orphan":
      return null; // Orphan annotations don't render
  }
}

/**
 * Get CSS class for annotation color
 */
export function getColorClass(color?: string): string {
  if (!color) {
    return "";
  }
  return `lfcc-annotation--${color}`;
}

// ============================================================================
// Adapter Interface
// ============================================================================

export interface AnnotationUIAdapter {
  buildDecorations(spans: AnnotationSpan[], doc: PMNode): DecorationSet;
}

export class NoopAnnotationUIAdapter implements AnnotationUIAdapter {
  buildDecorations(_spans: AnnotationSpan[], _doc: PMNode): DecorationSet {
    return DecorationSet.empty;
  }
}

// ============================================================================
// Decoration Builders
// ============================================================================

/**
 * Get status string from display state
 */
function getStatusFromState(state: DisplayAnnoState): string {
  switch (state) {
    case "active_unverified":
    case "broken_grace":
      return "unverified";
    case "active_partial":
      return "partial";
    default:
      return state;
  }
}

/**
 * Create a single span decoration
 */
function createSpanDecoration(span: AnnotationSpan): Decoration | null {
  const stateClasses = getStateClasses(span.state);

  // Skip orphan annotations - they don't render
  if (stateClasses === null) {
    return null;
  }

  const colorClass = getColorClass(span.color);
  const className = colorClass ? `${stateClasses} ${colorClass}` : stateClasses;
  const key = decorationKeyForSpan(span);
  const status = getStatusFromState(span.state);

  return Decoration.inline(
    span.from,
    span.to,
    {
      class: className,
      "data-annotation-id": span.annoId,
      "data-span-id": span.spanId,
      "data-status": status,
      "data-annotation-span-id": span.spanId,
      "data-annotation-state": span.state,
      ...(span.color ? { "data-annotation-color": span.color } : {}),
    },
    { key }
  );
}

/**
 * Build decorations from annotation spans with deterministic keys
 * - Orphan state renders nothing
 * - Partial state renders only resolved pieces
 * - Active/unverified/grace render full spans
 */
export function buildDeterministicDecorations(spans: AnnotationSpan[], doc: PMNode): DecorationSet {
  if (spans.length === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];

  for (const span of spans) {
    const decoration = createSpanDecoration(span);
    if (decoration) {
      decorations.push(decoration);
    }
  }

  if (decorations.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * Build decorations from annotations with resolved ranges
 * This is the preferred API for rendering annotations
 */
export function buildDecorations(annotations: AnnotationWithRanges[], doc: PMNode): DecorationSet {
  const spans: AnnotationSpan[] = [];

  for (const anno of annotations) {
    // Skip orphan annotations entirely
    if (anno.state === "orphan") {
      continue;
    }

    for (const range of anno.ranges) {
      spans.push({
        annoId: anno.id,
        spanId: range.spanId,
        blockId: range.blockId,
        from: range.from,
        to: range.to,
        state: anno.state,
        color: anno.color,
      });
    }
  }

  return buildDeterministicDecorations(spans, doc);
}

/**
 * Create a decoration set adapter that handles state-based rendering
 */
export class StatefulAnnotationUIAdapter implements AnnotationUIAdapter {
  buildDecorations(spans: AnnotationSpan[], doc: PMNode): DecorationSet {
    return buildDeterministicDecorations(spans, doc);
  }
}

// ============================================================================
// Gap Visualization (C2)
// ============================================================================

/**
 * Gap marker for multi-block partial annotations
 * Shows where spans are missing in the chain
 */
export type GapMarker = {
  annoId: string;
  afterBlockId: string;
  beforeBlockId: string;
  position: number; // Document position for the gap marker
};

/**
 * Gap visualization style
 */
export type GapStyle = "subtle" | "prominent" | "hidden";

/**
 * Build gap markers for partial annotations
 * Returns markers showing where spans are missing in the chain
 */
export function buildGapMarkers(
  annotation: AnnotationWithRanges,
  chainOrder: string[]
): GapMarker[] {
  if (annotation.state !== "active_partial") {
    return [];
  }

  const resolvedBlockIds = new Set(annotation.ranges.map((r) => r.blockId));
  const markers: GapMarker[] = [];

  for (let i = 0; i < chainOrder.length - 1; i++) {
    const currentBlock = chainOrder[i];
    const nextBlock = chainOrder[i + 1];

    const currentResolved = resolvedBlockIds.has(currentBlock);
    const nextResolved = resolvedBlockIds.has(nextBlock);

    // Gap exists when we have a resolved block followed by missing block(s)
    if (currentResolved && !nextResolved) {
      // Find the last resolved range in current block
      const lastRange = annotation.ranges
        .filter((r) => r.blockId === currentBlock)
        .sort((a, b) => b.to - a.to)[0];

      if (lastRange) {
        markers.push({
          annoId: annotation.id,
          afterBlockId: currentBlock,
          beforeBlockId: nextBlock,
          position: lastRange.to,
        });
      }
    }
  }

  return markers;
}

/**
 * Get CSS class for gap marker based on chain policy
 */
export function getGapClass(
  policyKind: "strict_adjacency" | "required_order" | "bounded_gap",
  style: GapStyle = "subtle"
): string {
  if (style === "hidden") {
    return "";
  }

  const base = "lfcc-gap";
  const policyClass = `lfcc-gap--${policyKind.replace("_", "-")}`;
  const styleClass = style === "prominent" ? "lfcc-gap--prominent" : "";

  return [base, policyClass, styleClass].filter(Boolean).join(" ");
}

/**
 * Build gap decorations for partial annotations
 */
export function buildGapDecorations(
  annotations: AnnotationWithRanges[],
  chainOrders: Map<string, string[]>,
  doc: PMNode,
  style: GapStyle = "subtle"
): DecorationSet {
  if (style === "hidden") {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];

  for (const anno of annotations) {
    if (anno.state !== "active_partial") {
      continue;
    }

    const chainOrder = chainOrders.get(anno.id);
    if (!chainOrder) {
      continue;
    }

    const gaps = buildGapMarkers(anno, chainOrder);

    for (const gap of gaps) {
      const key = `gap:${gap.annoId}:${gap.afterBlockId}:${gap.beforeBlockId}`;
      const className = getGapClass("required_order", style);

      decorations.push(
        Decoration.widget(
          gap.position,
          () => {
            const el = document.createElement("span");
            el.className = className;
            el.setAttribute("data-gap-anno", gap.annoId);
            el.setAttribute("aria-label", "Gap in annotation");
            el.textContent = "⋯";
            return el;
          },
          { key, side: 1 }
        )
      );
    }
  }

  if (decorations.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, decorations);
}
