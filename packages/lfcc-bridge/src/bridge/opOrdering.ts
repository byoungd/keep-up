import type { DirtyInfo, StructuralOperation as KernelStructuralOperation } from "@ku0/core";
import { detectConflict, sortOperations } from "@ku0/core";

export type StructuralOp = KernelStructuralOperation & {
  source: "local" | "remote" | "replay";
  payload?: unknown;
};

export type OrderingResult = {
  ordered: StructuralOp[];
  conflicts: Array<{ a: StructuralOp; b: StructuralOp }>;
  dropped: StructuralOp[];
};

const STRUCTURAL_OP_CODES = new Set<string>([
  "OP_BLOCK_SPLIT",
  "OP_BLOCK_JOIN",
  "OP_BLOCK_CONVERT",
  "OP_LIST_REPARENT",
  "OP_TABLE_STRUCT",
  "OP_REORDER",
]);

const DEFAULT_BLOCK_ID = "unknown";

/**
 * Convert DirtyInfo into structural operation records for ordering.
 */
export function buildStructuralOpsFromDirtyInfo(
  dirtyInfo: DirtyInfo,
  source: StructuralOp["source"],
  nextTimestamp: () => number
): StructuralOp[] {
  const structuralCodes = (dirtyInfo.opCodes ?? []).filter((code) => STRUCTURAL_OP_CODES.has(code));

  if (structuralCodes.length === 0) {
    return [];
  }

  const blocks = dirtyInfo.touchedBlocks?.length ? dirtyInfo.touchedBlocks : [DEFAULT_BLOCK_ID];

  const ops: StructuralOp[] = [];
  for (const blockId of blocks) {
    for (const opCode of structuralCodes) {
      ops.push({
        opCode,
        blockId,
        timestamp: nextTimestamp(),
        source,
      });
    }
  }

  return ops;
}

/**
 * Order structural operations deterministically and record conflicts.
 */
export function orderStructuralOps(ops: StructuralOp[]): OrderingResult {
  const ordered = sortOperations(ops) as StructuralOp[];
  const conflicts: OrderingResult["conflicts"] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i];
    const next = ordered[i + 1];
    if (detectConflict(current, next)) {
      conflicts.push({ a: current, b: next });
    }
  }

  // Fail-closed: drop later conflicting ops on the same block
  const seen = new Map<string, StructuralOp>();
  const kept: StructuralOp[] = [];
  const dropped: StructuralOp[] = [];

  for (const op of ordered) {
    const previous = seen.get(op.blockId);
    if (previous && detectConflict(previous, op)) {
      dropped.push(op);
      continue;
    }
    seen.set(op.blockId, op);
    kept.push(op);
  }

  return { ordered: kept, conflicts, dropped };
}

/**
 * Merge local + remote structural ops and enforce deterministic ordering.
 */
export function mergeAndOrderStructuralOps(
  localOps: StructuralOp[],
  remoteOps: StructuralOp[],
  log?: (event: string, data: Record<string, unknown>) => void
): OrderingResult {
  const merged = [...localOps, ...remoteOps];
  const result = orderStructuralOps(merged);

  if (result.conflicts.length > 0) {
    log?.("op_ordering_conflict", {
      conflicts: result.conflicts.map(({ a, b }) => ({
        a: summarizeOp(a),
        b: summarizeOp(b),
      })),
    });
  }

  if (result.dropped.length > 0) {
    log?.("op_ordering_dropped", {
      dropped: result.dropped.map(summarizeOp),
    });
  }

  return result;
}

function summarizeOp(op: StructuralOp): Record<string, unknown> {
  return {
    opCode: op.opCode,
    blockId: op.blockId,
    timestamp: op.timestamp,
    source: op.source,
  };
}
