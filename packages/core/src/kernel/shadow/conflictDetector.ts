/**
 * LFCC v0.9 RC - Structural Conflict Detector
 * @see docs/product/Local-First_Collaboration_Contract_v0.9_RC.md §4.1.1
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/14_Concurrent_Operations_Handling.md
 */

import type { TypedOp } from "./types.js";

/**
 * Operation priority for deterministic ordering
 * Lower number = higher priority
 */
const OPERATION_PRIORITIES: Record<string, number> = {
  OP_BLOCK_SPLIT: 1, // Highest priority
  OP_BLOCK_JOIN: 2,
  OP_BLOCK_CONVERT: 3,
  OP_LIST_REPARENT: 4,
  OP_TABLE_STRUCT: 5,
  OP_REORDER: 6,
  OP_TEXT_EDIT: 7, // Lowest priority (applied after structural)
  OP_MARK_EDIT: 7,
  OP_PASTE: 8,
  OP_IMMUTABLE_REWRITE: 9,
};

/**
 * Structural operations that affect block identity
 */
const STRUCTURAL_OP_CODES = new Set([
  "OP_BLOCK_SPLIT",
  "OP_BLOCK_JOIN",
  "OP_BLOCK_CONVERT",
  "OP_LIST_REPARENT",
  "OP_TABLE_STRUCT",
  "OP_REORDER",
]);

/**
 * Check if operation is structural
 */
function isStructuralOp(op: TypedOp): boolean {
  return STRUCTURAL_OP_CODES.has(op.code);
}

/**
 * Get block IDs targeted by an operation
 */
function getTargetBlockIds(op: TypedOp): string[] {
  switch (op.code) {
    case "OP_TEXT_EDIT":
    case "OP_MARK_EDIT":
    case "OP_BLOCK_SPLIT":
    case "OP_BLOCK_CONVERT":
      return [op.block_id];
    case "OP_BLOCK_JOIN":
      return [op.left_block_id, op.right_block_id];
    case "OP_LIST_REPARENT":
      return [op.item_id, op.new_parent_id];
    case "OP_TABLE_STRUCT":
      return [op.table_id];
    case "OP_REORDER":
      return op.block_ids ?? [];
    default:
      return [];
  }
}

/**
 * Check if split/join operations conflict
 */
function isSplitJoinConflict(op1: TypedOp, op2: TypedOp): boolean {
  return (
    (op1.code === "OP_BLOCK_SPLIT" && op2.code === "OP_BLOCK_JOIN") ||
    (op1.code === "OP_BLOCK_JOIN" && op2.code === "OP_BLOCK_SPLIT")
  );
}

/**
 * Check if convert conflicts with split/join
 */
function isConvertSplitJoinConflict(op1: TypedOp, op2: TypedOp): boolean {
  return (
    (op1.code === "OP_BLOCK_CONVERT" &&
      (op2.code === "OP_BLOCK_SPLIT" || op2.code === "OP_BLOCK_JOIN")) ||
    (op2.code === "OP_BLOCK_CONVERT" &&
      (op1.code === "OP_BLOCK_SPLIT" || op1.code === "OP_BLOCK_JOIN"))
  );
}

/**
 * Check if two operations are incompatible
 * Two operations are incompatible if they target the same block with conflicting changes
 */
function areIncompatible(op1: TypedOp, op2: TypedOp): boolean {
  const ids1 = getTargetBlockIds(op1);
  const ids2 = getTargetBlockIds(op2);

  // Check for overlapping block IDs
  const overlap = ids1.some((id) => ids2.includes(id));
  if (!overlap) {
    return false;
  }

  // Both are structural operations targeting same block
  if (isStructuralOp(op1) && isStructuralOp(op2)) {
    // Split and join on same block are incompatible
    if (isSplitJoinConflict(op1, op2)) {
      return true;
    }

    // Convert and split/join on same block are incompatible
    if (isConvertSplitJoinConflict(op1, op2)) {
      return true;
    }

    // Same structural operation on same block (unless explicitly allowed)
    if (op1.code === op2.code && op1.code !== "OP_REORDER") {
      return true;
    }
  }

  return false;
}

/**
 * Conflict type
 */
export type ConflictType = "direct" | "cascading" | "dependency";

/**
 * Detected conflict
 */
export type Conflict = {
  type: ConflictType;
  operations: [TypedOp, TypedOp];
  blockId: string;
  reason: string;
};

/**
 * Conflict detection result
 */
export type ConflictDetectionResult = {
  hasConflict: boolean;
  conflicts: Conflict[];
};

/**
 * Sort operations by deterministic ordering
 * Order: (block_id, operation_type_priority, timestamp)
 */
function sortOperations(operations: TypedOp[]): TypedOp[] {
  return [...operations].sort((a, b) => {
    const idsA = getTargetBlockIds(a);
    const idsB = getTargetBlockIds(b);

    // Compare by first block ID (lexicographic)
    const blockIdA = idsA[0] ?? "";
    const blockIdB = idsB[0] ?? "";
    const blockIdCmp = blockIdA.localeCompare(blockIdB);
    if (blockIdCmp !== 0) {
      return blockIdCmp;
    }

    // Compare by operation priority
    const priorityA = OPERATION_PRIORITIES[a.code] ?? 999;
    const priorityB = OPERATION_PRIORITIES[b.code] ?? 999;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Tie-break by code (deterministic)
    return a.code.localeCompare(b.code);
  });
}

/**
 * Track block state changes during conflict detection
 */
type BlockState = {
  lastOp: TypedOp;
  exists: boolean;
  splitInto?: string[];
  joinedWith?: string;
};

/**
 * Check for direct conflicts with existing block states
 */
function checkDirectConflicts(
  op: TypedOp,
  targetIds: string[],
  blockStates: Map<string, BlockState>,
  conflicts: Conflict[]
): void {
  for (const blockId of targetIds) {
    const state = blockStates.get(blockId);
    if (state && areIncompatible(state.lastOp, op)) {
      conflicts.push({
        type: "direct",
        operations: [state.lastOp, op],
        blockId,
        reason: `Incompatible operations on block ${blockId}: ${state.lastOp.code} and ${op.code}`,
      });
    }
  }
}

/**
 * Check for cascading conflicts (operation targets modified block)
 */
function checkCascadingConflicts(
  op: TypedOp,
  targetIds: string[],
  blockStates: Map<string, BlockState>,
  conflicts: Conflict[]
): void {
  for (const blockId of targetIds) {
    const state = blockStates.get(blockId);
    if (state && !state.exists) {
      // Block was deleted/split/joined, but operation still targets it
      conflicts.push({
        type: "cascading",
        operations: [state.lastOp, op],
        blockId,
        reason: `Operation ${op.code} targets block ${blockId} which was modified by ${state.lastOp.code}`,
      });
    }
  }
}

/**
 * Update block state after applying operation
 */
function updateBlockState(
  op: TypedOp,
  targetIds: string[],
  blockStates: Map<string, BlockState>
): void {
  for (const blockId of targetIds) {
    if (op.code === "OP_BLOCK_SPLIT") {
      // Block split into two new blocks
      blockStates.set(blockId, {
        lastOp: op,
        exists: false,
        splitInto: [],
      });
    } else if (op.code === "OP_BLOCK_JOIN") {
      // Blocks joined into one
      blockStates.set(op.left_block_id, {
        lastOp: op,
        exists: false,
        joinedWith: op.right_block_id,
      });
      blockStates.set(op.right_block_id, {
        lastOp: op,
        exists: false,
        joinedWith: op.left_block_id,
      });
    } else if (op.code === "OP_BLOCK_CONVERT") {
      // Block converted (may keep or replace ID)
      blockStates.set(blockId, {
        lastOp: op,
        exists: true, // Still exists, just type changed
      });
    } else {
      // Other operations: block still exists
      blockStates.set(blockId, {
        lastOp: op,
        exists: true,
      });
    }
  }
}

/**
 * Detect conflicts in a batch of concurrent operations
 *
 * DEFECT-005: Implements conflict detection for concurrent structural operations
 *
 * @param operations - Operations to check for conflicts
 * @returns Conflict detection result
 */
export function detectConflicts(operations: TypedOp[]): ConflictDetectionResult {
  const conflicts: Conflict[] = [];
  const sortedOps = sortOperations(operations);

  // Track block state changes
  const blockStates = new Map<string, BlockState>();

  for (const op of sortedOps) {
    const targetIds = getTargetBlockIds(op);

    // Check direct conflicts
    checkDirectConflicts(op, targetIds, blockStates, conflicts);

    // Check cascading conflicts
    checkCascadingConflicts(op, targetIds, blockStates, conflicts);

    // Update block state
    updateBlockState(op, targetIds, blockStates);
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

/**
 * Resolve conflict using fail-closed strategy
 * Rejects the later operation if it conflicts with an earlier one
 *
 * @param conflict - The detected conflict
 * @returns Resolution result
 */
export function resolveConflictFailClosed(conflict: Conflict): {
  accepted: TypedOp;
  rejected: TypedOp;
  reason: string;
} {
  // Operation that appears first in sorted order wins
  const [op1, op2] = conflict.operations;
  const sorted = sortOperations([op1, op2]);

  return {
    accepted: sorted[0],
    rejected: sorted[1],
    reason: `Fail-closed: Operation ${sorted[1].code} rejected due to conflict with ${sorted[0].code} on block ${conflict.blockId}`,
  };
}
