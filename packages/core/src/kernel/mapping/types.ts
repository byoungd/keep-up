/**
 * LFCC v0.9 RC - Block Mapping Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 3
 */

/** Result of mapping an old position to new */
export type MappedPosition = {
  newBlockId: string;
  newAbsInBlock: number;
} | null;

/**
 * BlockMapping interface for tracking position changes across edits
 * Must satisfy monotonicity: if posA < posB in old block, map(posA) <= map(posB) in new
 */
export interface BlockMapping {
  /**
   * Map a position from old block to new block
   * @returns New position or null if position no longer exists
   */
  mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition;

  /**
   * Get all blocks derived from an old block (e.g., after split)
   */
  derivedBlocksFrom(oldBlockId: string): string[];

  /**
   * Get blocks that were merged into a new block (optional)
   */
  mergedFrom?(newBlockId: string): string[];
}

/** Information about dirty regions from an edit */
export type DirtyInfo = {
  /** Operation codes describing what changed */
  opCodes: string[];
  /** Block IDs that were structurally or textually changed */
  touchedBlocks: string[];
  /** Optional: specific ranges within blocks */
  touchedRanges?: Array<{ blockId: string; start: number; end: number }>;
  /** Transaction index for deterministic sampling */
  txnIndex?: number;
  /** Expanded blocks after neighbor expansion (for UI/sync consumers) */
  expandedBlocks?: string[];
};

/** Policy for neighbor expansion */
export type NeighborExpansionPolicy = {
  /** Number of blocks to expand on each side */
  neighbor_expand_k: number;
  /** Cap for adaptive expansion */
  max_adaptive_k?: number;
  /** Extra expansion per list nesting level */
  list_depth_bonus?: number;
  /** Extra expansion per table nesting level */
  table_depth_bonus?: number;
};

/** Document block ordering for expansion */
export type DocumentBlockOrder = {
  /** Deterministic list of content blocks in document order */
  contentBlockIds: string[];
  /** Optional structure metadata for adaptive expansion */
  blockMeta?: Record<string, { listDepth: number; tableDepth: number }>;
};

/** Default neighbor expansion policy */
export const DEFAULT_NEIGHBOR_EXPANSION_POLICY: NeighborExpansionPolicy = {
  neighbor_expand_k: 1,
  max_adaptive_k: 3,
  list_depth_bonus: 1,
  table_depth_bonus: 1,
};
