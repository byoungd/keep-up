/**
 * Incremental Decoration Cache
 *
 * PERF-004: Avoids full decoration rebuilds by caching and incrementally
 * updating decorations. Only annotations that changed get their decorations
 * rebuilt.
 *
 * Key optimization: Track per-annotation decoration sets and merge them.
 * When an annotation changes, only rebuild that annotation's decorations.
 *
 * OVERLAY MODE: When useOverlayRendering is true, decorations are interaction-only
 * (transparent background) and visual rendering is handled by HighlightOverlay.
 * This enables true z-index stacking for overlapping annotations.
 */

// Feature flag for overlay rendering mode
// Set to true to enable the new overlay-based highlight rendering
export let useOverlayRendering = true;

/**
 * Enable or disable overlay rendering mode.
 * When enabled, decorations are transparent and visuals are rendered via HighlightOverlay.
 */
export function setOverlayRenderingMode(enabled: boolean): void {
  useOverlayRendering = enabled;
}

import type { DisplayAnnoState } from "@ku0/core";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

import type { ResolvedAnnotation } from "./annotationResolution";

/**
 * Cache entry for a single annotation's decorations.
 */
interface AnnotationDecorationEntry {
  /** Hash of the annotation's range state */
  hash: string;
  /** Inline decorations for this annotation */
  decorations: Decoration[];
}

/**
 * Cache for annotation decorations.
 * Keyed by doc reference (WeakMap) then annotation ID.
 */
const decorationCache = new WeakMap<PMNode, Map<string, AnnotationDecorationEntry>>();

// Performance counters
let cacheHits = 0;
let cacheMisses = 0;
let lastReportTime = 0;

/**
 * Compute a hash for an annotation's decoration-relevant state.
 */
function computeAnnotationHash(resolved: ResolvedAnnotation): string {
  const rangeParts = resolved.ranges.map((r) => `${r.blockId}:${r.from}:${r.to}`);
  return `${resolved.state}|${resolved.color ?? ""}|${rangeParts.join(",")}`;
}

/**
 * Get or build decorations for a single annotation.
 */
function getAnnotationDecorations(
  resolved: ResolvedAnnotation,
  _doc: PMNode,
  cache: Map<string, AnnotationDecorationEntry>
): Decoration[] {
  // Skip orphan annotations
  if (resolved.state === "orphan" || resolved.ranges.length === 0) {
    // Clear from cache if exists
    cache.delete(resolved.id);
    return [];
  }

  const hash = computeAnnotationHash(resolved);
  const cached = cache.get(resolved.id);

  if (cached && cached.hash === hash) {
    cacheHits++;
    return cached.decorations;
  }

  cacheMisses++;

  // Build decorations for this annotation
  const decorations: Decoration[] = [];
  const stateClass = getStateClass(resolved.state);
  const colorClass = resolved.color ? `lfcc-annotation--${resolved.color}` : "";
  const baseClassName = [stateClass, colorClass].filter(Boolean).join(" ");

  for (const range of resolved.ranges) {
    // Add unique span ID class for reliable DOM lookup (survives PM attribute merging)
    const spanIdClass = `lfcc-span-${range.spanId}`;
    const className = `${baseClassName} ${spanIdClass}`;

    decorations.push(
      Decoration.inline(
        range.from,
        range.to,
        {
          class: className,
          // We still keep data attributes for debug/inspection, but logic should rely on class
          "data-annotation-id": resolved.id,
          "data-span-id": range.spanId,
          "data-annotation-state": resolved.state,
          ...(resolved.color ? { "data-annotation-color": resolved.color } : {}),
        },
        { key: `anno:${resolved.id}:span:${range.spanId}` }
      )
    );
  }

  // Update cache
  cache.set(resolved.id, { hash, decorations });

  return decorations;
}

function getStateClass(state: DisplayAnnoState): string {
  // In overlay mode, we only add interaction classes (no visual styles)
  // Visual rendering is handled by HighlightOverlay component
  // Always include lfcc-annotation as base class for E2E test compatibility
  if (useOverlayRendering) {
    switch (state) {
      case "active":
        return "lfcc-annotation lfcc-annotation-target lfcc-annotation-target--active";
      case "active_partial":
        return "lfcc-annotation lfcc-annotation-target lfcc-annotation-target--partial";
      case "active_unverified":
        return "lfcc-annotation lfcc-annotation-target lfcc-annotation-target--unverified";
      case "broken_grace":
        return "lfcc-annotation lfcc-annotation-target lfcc-annotation-target--grace";
      case "orphan":
        return "";
    }
  }

  // Legacy mode: full visual styling via decorations
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
      return "";
  }
}

/**
 * Build decorations incrementally, reusing cached entries where possible.
 *
 * @param resolved - Resolved annotations
 * @param doc - Current document
 * @returns DecorationSet with all annotation decorations
 */
export function buildDecorationsIncremental(
  resolved: ResolvedAnnotation[],
  doc: PMNode
): DecorationSet {
  if (resolved.length === 0) {
    return DecorationSet.empty;
  }

  // Get or create cache for this doc
  let cache = decorationCache.get(doc);
  if (!cache) {
    cache = new Map();
    decorationCache.set(doc, cache);
  }

  // Track which annotations are still present
  const presentIds = new Set<string>();

  // Collect all decorations
  const allDecorations: Decoration[] = [];

  for (const anno of resolved) {
    presentIds.add(anno.id);
    const decorations = getAnnotationDecorations(anno, doc, cache);
    allDecorations.push(...decorations);
  }

  // Clean up stale cache entries
  for (const id of cache.keys()) {
    if (!presentIds.has(id)) {
      cache.delete(id);
    }
  }

  reportStats();

  if (allDecorations.length === 0) {
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, allDecorations);
}

/**
 * Invalidate cache for specific annotations.
 */
export function invalidateAnnotationDecorations(doc: PMNode, annotationIds: string[]): void {
  const cache = decorationCache.get(doc);
  if (!cache) {
    return;
  }

  for (const id of annotationIds) {
    cache.delete(id);
  }
}

/**
 * Clear all decoration caches.
 */
export function clearDecorationCache(): void {
  // WeakMap doesn't have clear(), but entries will be GC'd
  // when their doc keys are no longer referenced
}

/**
 * Get cache statistics.
 */
export function getDecorationCacheStats(): { hits: number; misses: number; hitRate: number } {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}

function reportStats(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastReportTime < 5000) {
    return;
  }

  lastReportTime = now;
  const total = cacheHits + cacheMisses;
  if (total > 100) {
    const hitRate = ((cacheHits / total) * 100).toFixed(1);
    console.info(
      `[Decoration Cache] hits: ${cacheHits}, misses: ${cacheMisses}, hit rate: ${hitRate}%`
    );
    cacheHits = 0;
    cacheMisses = 0;
  }
}
