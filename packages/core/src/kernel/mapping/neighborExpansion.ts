/**
 * LFCC v0.9 RC - Dirty Region Neighbor Expansion
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 3.3
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/11_Dirty_Region_and_Neighbor_Expansion.md
 */

import type { DocumentBlockOrder, NeighborExpansionPolicy } from "./types";
import { DEFAULT_NEIGHBOR_EXPANSION_POLICY } from "./types";

function clampAdaptiveK(
  policy: NeighborExpansionPolicy,
  meta: { listDepth: number; tableDepth: number } | undefined
): number {
  const baseK = Math.max(0, policy.neighbor_expand_k);
  const maxK = Math.max(baseK, policy.max_adaptive_k ?? baseK);
  const listBonus = policy.list_depth_bonus ?? 0;
  const tableBonus = policy.table_depth_bonus ?? 0;
  const listDepth = meta?.listDepth ?? 0;
  const tableDepth = meta?.tableDepth ?? 0;
  const adaptive = baseK + listDepth * listBonus + tableDepth * tableBonus;
  return Math.min(maxK, adaptive);
}

/**
 * Expand touched blocks to include K neighbors on each side
 * This ensures we catch edge effects from joins, splits, and adjacency changes
 *
 * @param touchedBlocks - Block IDs that were directly modified
 * @param order - Document block ordering
 * @param policy - Expansion policy (default K=1)
 * @returns Expanded set of block IDs to reconcile
 */
export function expandTouchedBlocks(
  touchedBlocks: string[],
  order: DocumentBlockOrder,
  policy: NeighborExpansionPolicy = DEFAULT_NEIGHBOR_EXPANSION_POLICY
): string[] {
  const { contentBlockIds } = order;
  const metaById = order.blockMeta;

  if (contentBlockIds.length === 0 || touchedBlocks.length === 0) {
    return [];
  }

  // Build index map for O(1) lookups
  const indexMap = new Map<string, number>();
  for (let i = 0; i < contentBlockIds.length; i++) {
    indexMap.set(contentBlockIds[i], i);
  }

  // Collect all indices that need to be included
  const indicesToInclude = new Set<number>();

  for (const blockId of touchedBlocks) {
    const idx = indexMap.get(blockId);
    if (idx === undefined) {
      continue;
    }

    // Add the block itself
    indicesToInclude.add(idx);

    const adaptiveK = clampAdaptiveK(policy, metaById?.[blockId]);

    // Add K neighbors on each side
    for (let offset = 1; offset <= adaptiveK; offset++) {
      if (idx - offset >= 0) {
        indicesToInclude.add(idx - offset);
      }
      if (idx + offset < contentBlockIds.length) {
        indicesToInclude.add(idx + offset);
      }
    }
  }

  // Convert back to block IDs in document order
  const sortedIndices = Array.from(indicesToInclude).sort((a, b) => a - b);
  return sortedIndices.map((i) => contentBlockIds[i]);
}

/**
 * Check if a block is within the expanded dirty region
 */
export function isBlockInDirtyRegion(blockId: string, expandedBlocks: string[]): boolean {
  return expandedBlocks.includes(blockId);
}

/**
 * Get the dirty region bounds (first and last block indices)
 */
export function getDirtyRegionBounds(
  expandedBlocks: string[],
  order: DocumentBlockOrder
): { start: number; end: number } | null {
  if (expandedBlocks.length === 0) {
    return null;
  }

  const { contentBlockIds } = order;
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const blockId of expandedBlocks) {
    const idx = contentBlockIds.indexOf(blockId);
    if (idx !== -1) {
      start = Math.min(start, idx);
      end = Math.max(end, idx);
    }
  }

  if (start === Number.POSITIVE_INFINITY) {
    return null;
  }
  return { start, end };
}
