/**
 * Global BlockIndex Cache
 *
 * PERF-002: Eliminates redundant document traversals by caching BlockIndex
 * per EditorState.doc. Uses WeakMap for automatic garbage collection.
 *
 * Problem: buildBlockIndex() was called multiple times per decoration cycle,
 * each traversing O(n) nodes. With 100 annotations updating 10x/sec,
 * this caused 1000+ traversals/sec.
 *
 * Solution: Cache BlockIndex keyed by doc reference. Since ProseMirror
 * creates new doc instances on changes, stale entries are auto-collected.
 */

import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import type { BlockIndex } from "./annotationResolution";

// WeakMap allows GC when doc is no longer referenced
const blockIndexCache = new WeakMap<PMNode, BlockIndex>();

// Performance counters (dev only)
let cacheHits = 0;
let cacheMisses = 0;
let lastReportTime = 0;

const CONTAINER_NODE_NAMES = new Set([
  "list",
  "list_item",
  "quote",
  "table",
  "table_row",
  "table_cell",
]);

const isLeafTextBlock = (node: PMNode): boolean => {
  if (!node.isTextblock) {
    return false;
  }
  return !CONTAINER_NODE_NAMES.has(node.type.name);
};

const hasBlockId = (node: PMNode): node is PMNode & { attrs: { block_id: string } } => {
  const blockId = node.attrs.block_id;
  return typeof blockId === "string" && blockId.trim() !== "";
};

/**
 * Build BlockIndex with full document traversal.
 * This is the expensive operation we want to cache.
 */
function buildBlockIndexInternal(doc: PMNode): BlockIndex {
  const blockMap = new Map<string, { pos: number; node: PMNode }>();
  const blockOrder: string[] = [];
  const orderIndex = new Map<string, number>();
  const duplicates: string[] = [];

  doc.descendants((node, pos) => {
    const group = node.type.spec.group ?? "";
    const isBlock = node.isBlock && group.split(" ").includes("block");
    if (!isBlock || !isLeafTextBlock(node) || !hasBlockId(node)) {
      return;
    }

    const blockId = node.attrs.block_id;

    // FIX: Detect duplicate block IDs and keep the FIRST occurrence
    // This prevents annotation highlights from jumping to wrong blocks
    if (blockMap.has(blockId)) {
      duplicates.push(blockId);
      return; // Skip duplicate - keep the first occurrence
    }

    blockMap.set(blockId, { pos, node });
    blockOrder.push(blockId);
    orderIndex.set(blockId, blockOrder.length - 1);
  });

  // Log duplicates in dev mode for debugging
  if (process.env.NODE_ENV !== "production" && duplicates.length > 0) {
    console.warn(
      `[BlockIndex] Found ${duplicates.length} duplicate block ID(s):`,
      duplicates.slice(0, 5).map((id) => id.slice(0, 8)),
      duplicates.length > 5 ? `... and ${duplicates.length - 5} more` : ""
    );
  }

  return { blockMap, blockOrder, orderIndex };
}

/**
 * Get cached BlockIndex for the given EditorState.
 * Builds and caches if not present.
 *
 * @param state - ProseMirror EditorState
 * @returns Cached or freshly built BlockIndex
 */
export function getCachedBlockIndex(state: EditorState): BlockIndex {
  const doc = state.doc;
  const cached = blockIndexCache.get(doc);

  if (cached) {
    cacheHits++;
    reportCacheStats();
    return cached;
  }

  cacheMisses++;
  reportCacheStats();

  const index = buildBlockIndexInternal(doc);
  blockIndexCache.set(doc, index);
  return index;
}

/**
 * Invalidate cache for a specific doc (rarely needed).
 */
export function invalidateBlockIndex(doc: PMNode): void {
  blockIndexCache.delete(doc);
}

/**
 * Get cache statistics (dev only).
 */
export function getBlockIndexCacheStats(): { hits: number; misses: number; hitRate: number } {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}

/**
 * Reset cache statistics (for testing).
 */
export function resetBlockIndexCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  lastReportTime = 0;
}

function reportCacheStats(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastReportTime < 5000) {
    return;
  }

  lastReportTime = now;
  const total = cacheHits + cacheMisses;
  if (total > 0) {
    const hitRate = ((cacheHits / total) * 100).toFixed(1);
    console.info(
      `[BlockIndex Cache] hits: ${cacheHits}, misses: ${cacheMisses}, hit rate: ${hitRate}%`
    );
  }
}
