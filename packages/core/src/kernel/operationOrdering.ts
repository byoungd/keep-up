/**
 * LFCC v0.9 RC - Operation Ordering (structural ops)
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/14_Concurrent_Operations_Handling.md
 */

/** Priority: lower number = higher priority */
export const OPERATION_PRIORITIES: Record<string, number> = {
  OP_BLOCK_SPLIT: 1,
  OP_BLOCK_JOIN: 2,
  OP_BLOCK_CONVERT: 3,
  OP_LIST_REPARENT: 4,
  OP_TABLE_STRUCT: 5,
  OP_REORDER: 6,
  OP_TEXT_EDIT: 7,
  OP_MARK_EDIT: 7,
  OP_PASTE: 8,
  OP_IMMUTABLE_REWRITE: 9,
};

export type StructuralOperation = {
  opCode: string;
  blockId: string;
  timestamp: number; // CRDT logical timestamp or monotonic counter
};

/**
 * Deterministically sort operations by (blockId lex, op priority, timestamp)
 */
export function sortOperations(ops: StructuralOperation[]): StructuralOperation[] {
  return [...ops].sort((a, b) => {
    if (a.blockId !== b.blockId) {
      return a.blockId.localeCompare(b.blockId);
    }
    const prioA = OPERATION_PRIORITIES[a.opCode] ?? 10;
    const prioB = OPERATION_PRIORITIES[b.opCode] ?? 10;
    if (prioA !== prioB) {
      return prioA - prioB;
    }
    return a.timestamp - b.timestamp;
  });
}

/**
 * Detect conflicts between two structural operations targeting the same block
 */
export function detectConflict(a: StructuralOperation, b: StructuralOperation): boolean {
  if (a.blockId !== b.blockId) {
    return false;
  }
  const structuralOps = new Set([
    "OP_BLOCK_SPLIT",
    "OP_BLOCK_JOIN",
    "OP_BLOCK_CONVERT",
    "OP_LIST_REPARENT",
    "OP_TABLE_STRUCT",
    "OP_REORDER",
  ]);
  return structuralOps.has(a.opCode) && structuralOps.has(b.opCode);
}
