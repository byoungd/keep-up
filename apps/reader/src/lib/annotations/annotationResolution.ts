import type { Annotation } from "@/lib/kernel/types";
import { absoluteFromAnchor } from "@ku0/core";
import type { DisplayAnnoState } from "@ku0/core";
import type { LoroRuntime, ResolvedRange, SpanList, SpanRange } from "@ku0/lfcc-bridge";
import { decodeAnchor as decodeLegacyCursorAnchor, resolveAnchor } from "@ku0/lfcc-bridge";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { getCachedBlockIndex } from "./blockIndexCache";

type BlockEntry = { pos: number; node: PMNode };

export type BlockIndex = {
  blockMap: Map<string, BlockEntry>;
  blockOrder: string[];
  orderIndex: Map<string, number>;
};

/**
 * Build BlockIndex for the given EditorState.
 * PERF-002: Now uses global cache to avoid redundant traversals.
 */
export const buildBlockIndex = (state: EditorState): BlockIndex => {
  return getCachedBlockIndex(state);
};

const resolveAnchorOffset = (
  anchor: SpanRange["startAnchor"],
  runtime: LoroRuntime,
  blockId: string
): number | null => {
  if (!anchor) {
    return null;
  }

  const decoded = absoluteFromAnchor(anchor.anchor);
  if (decoded) {
    if (decoded.blockId !== blockId) {
      return null;
    }
    return decoded.offset;
  }

  const cursor = decodeLegacyCursorAnchor(anchor.anchor);
  if (!cursor) {
    return null;
  }
  const resolved = resolveAnchor(runtime.doc, cursor);
  return resolved?.offset ?? null;
};

const resolveSpanOffsets = (
  span: SpanRange,
  runtime: LoroRuntime,
  maxLength: number
): { start: number; end: number } | null => {
  const resolvedStart = resolveAnchorOffset(span.startAnchor, runtime, span.blockId);
  const resolvedEnd = resolveAnchorOffset(span.endAnchor, runtime, span.blockId);

  if (span.startAnchor && resolvedStart == null) {
    return null;
  }

  if (span.endAnchor && resolvedEnd == null) {
    return null;
  }

  const start = resolvedStart ?? span.start;
  const end = resolvedEnd ?? span.end;

  // DEBUG: Log offset mismatch between stored and resolved values
  if (process.env.NODE_ENV !== "production") {
    const startMismatch = resolvedStart !== null && resolvedStart !== span.start;
    const endMismatch = resolvedEnd !== null && resolvedEnd !== span.end;
    if (startMismatch || endMismatch) {
      console.warn("[annotationResolution] OFFSET MISMATCH DETECTED", {
        blockId: span.blockId.slice(0, 8),
        stored: { start: span.start, end: span.end },
        resolved: { start: resolvedStart, end: resolvedEnd },
        usingFallback: resolvedStart === null || resolvedEnd === null,
      });
    }
  }

  const safeStart = Math.max(0, Math.min(start, maxLength));
  const safeEnd = Math.max(0, Math.min(end, maxLength));

  if (safeEnd <= safeStart) {
    return null;
  }

  return { start: safeStart, end: safeEnd };
};

export type ResolvedAnnotation = {
  id: string;
  state: DisplayAnnoState;
  color?: Annotation["color"];
  ranges: ResolvedRange[];
  chainOrder: string[];
  missingBlockIds: string[];
};

// --- Helper Functions for Resolution ---

function resolveSpansToRanges(
  annotation: Annotation,
  spans: SpanList,
  blockMap: Map<string, BlockEntry>,
  runtime: LoroRuntime
): { ranges: ResolvedRange[]; missingBlockIds: string[] } {
  const ranges: ResolvedRange[] = [];
  const missingBlockIds: string[] = [];

  for (const [index, span] of spans.entries()) {
    const entry = blockMap.get(span.blockId);
    if (!entry) {
      missingBlockIds.push(span.blockId);
      continue;
    }

    const maxLength = entry.node.content.size;
    const offsets = resolveSpanOffsets(span, runtime, maxLength);
    if (!offsets) {
      missingBlockIds.push(span.blockId);
      continue;
    }

    // REVERT: Use simple calculation to test if textOffsetToDocPos is causing issues
    const contentStart = entry.pos + 1;
    const from = contentStart + offsets.start;
    const to = contentStart + offsets.end;

    ranges.push({
      blockId: span.blockId,
      spanId: `s${index}-${span.blockId}-${span.start}-${span.end}`,
      annoId: annotation.id,
      from,
      to,
    });
  }

  return { ranges, missingBlockIds };
}

function determineAnnotationState(
  annotation: Annotation,
  spans: SpanList,
  ranges: ResolvedRange[],
  missingBlockIds: string[],
  chainOrder: string[],
  orderIndex: Map<string, number>
): DisplayAnnoState {
  if (annotation.displayState === "orphan" || spans.length === 0 || ranges.length === 0) {
    return "orphan";
  }

  if (missingBlockIds.length > 0) {
    return "active_partial";
  }

  const policy = annotation.chain?.policy?.kind ?? "required_order";
  const maxGap = annotation.chain?.policy?.maxInterveningBlocks ?? 0;
  const indices = chainOrder
    .map((blockId) => orderIndex.get(blockId))
    .filter((idx): idx is number => idx !== undefined);

  if (indices.length !== chainOrder.length) {
    return "active_partial";
  }

  if (policy === "required_order") {
    const ordered = indices.every((value, idx, arr) => {
      if (idx === 0) {
        return true;
      }
      const validOrder = value > arr[idx - 1];
      // Also enforce max gap if order is valid
      const withinGap = value - arr[idx - 1] - 1 <= maxGap;
      return validOrder && withinGap;
    });
    if (!ordered) {
      return "active_partial";
    }
  } else if (policy === "strict_adjacency") {
    const adjacent = indices.every((value, idx, arr) => idx === 0 || value - arr[idx - 1] === 1);
    if (!adjacent) {
      return "active_partial";
    }
  } else if (policy === "bounded_gap") {
    const withinGap = indices.every((value, idx, arr) => {
      if (idx === 0) {
        return true;
      }
      return value - arr[idx - 1] - 1 <= maxGap;
    });
    if (!withinGap) {
      return "active_partial";
    }
  }

  return annotation.displayState;
}

// --- Main Resolution Function ---

export function resolveAnnotationRanges(
  annotation: Annotation,
  runtime: LoroRuntime,
  state: EditorState,
  blockIndex?: BlockIndex
): ResolvedAnnotation {
  const spans: SpanList = annotation.spans ?? [];
  const resolvedIndex = blockIndex ?? buildBlockIndex(state);
  const { blockMap, orderIndex } = resolvedIndex;
  const chainOrder = annotation.chain?.order ?? spans.map((span) => span.blockId);

  const { ranges, missingBlockIds } = resolveSpansToRanges(annotation, spans, blockMap, runtime);

  const resolvedState = determineAnnotationState(
    annotation,
    spans,
    ranges,
    missingBlockIds,
    chainOrder,
    orderIndex
  );

  return {
    id: annotation.id,
    state: resolvedState,
    color: annotation.color,
    ranges,
    chainOrder,
    missingBlockIds,
  };
}

export function resolveAnnotationsForDecorations(
  annotations: Annotation[],
  runtime: LoroRuntime,
  state: EditorState,
  blockIndex?: BlockIndex
): {
  resolved: ResolvedAnnotation[];
  chainOrders: Map<string, string[]>;
} {
  const resolvedIndex = blockIndex ?? buildBlockIndex(state);
  const resolved = annotations.map((annotation) =>
    resolveAnnotationRanges(annotation, runtime, state, resolvedIndex)
  );

  const chainOrders = new Map<string, string[]>();
  for (const entry of resolved) {
    chainOrders.set(entry.id, entry.chainOrder);
  }

  return { resolved, chainOrders };
}
