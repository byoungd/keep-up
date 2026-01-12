/**
 * LFCC v0.9 RC - Transaction Classification
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 4
 *
 * Deterministic classification of ProseMirror transactions into LFCC operation codes.
 * MUST be deterministic: same transaction -> same opCodes, touchedBlocks, txnIndex.
 */

import type { OpCode, TypedOp } from "./types";

/**
 * Input for transaction classification
 * Abstract, does not depend on ProseMirror directly
 */
export interface TransactionInput {
  /** Document steps (abstract representation) */
  steps: TransactionStep[];
  /** Whether this is an undo operation */
  isUndo?: boolean;
  /** Whether this is a redo operation */
  isRedo?: boolean;
  /** Seed for deterministic txnIndex (if provided) */
  seed?: number;
}

/** Abstract step representation */
export interface TransactionStep {
  type: "replace" | "replaceAround" | "addMark" | "removeMark";
  /** Block IDs affected */
  affectedBlockIds: string[];
  /** For replace steps */
  from?: number;
  to?: number;
  insertedText?: string;
  deletedLength?: number;
  /** For mark steps */
  markType?: string;
}

/**
 * Result of transaction classification
 * LFCC-CONFORMANCE: All fields must be deterministic
 */
export interface ClassifyTransactionResult {
  /** Operation codes identified */
  opCodes: OpCode[];
  /** Typed operations with full details */
  typedOps: TypedOp[];
  /** Block IDs touched by this transaction */
  touchedBlocks: string[];
  /** Optional: touched ranges within blocks */
  touchedRanges?: Map<string, { start: number; end: number }>;
  /** Deterministic transaction index (seed-based if provided) */
  txnIndex: number;
}

/** Static counter for txnIndex when no seed provided */
let globalTxnCounter = 0;

/** Reset global counter (for testing) */
export function resetTxnCounter(): void {
  globalTxnCounter = 0;
}

/**
 * Classify a transaction into LFCC operation codes deterministically.
 *
 * LFCC-CONFORMANCE:
 * - Same transaction input -> same opCodes, touchedBlocks, txnIndex
 * - No time/random dependence
 * - Seed support for deterministic txnIndex across runs
 */
export function classifyTransaction(input: TransactionInput): ClassifyTransactionResult {
  const state = createClassificationState();

  if (input.isUndo || input.isRedo) {
    handleHistoryRestore(input.steps, state);
  } else {
    handleStepClassification(input.steps, state);
  }

  return finalizeClassification(state, input);
}

type ClassificationState = {
  opCodes: OpCode[];
  typedOps: TypedOp[];
  touchedBlocksSet: Set<string>;
  touchedRanges: Map<string, { start: number; end: number }>;
};

function createClassificationState(): ClassificationState {
  return {
    opCodes: [],
    typedOps: [],
    touchedBlocksSet: new Set<string>(),
    touchedRanges: new Map<string, { start: number; end: number }>(),
  };
}

function handleHistoryRestore(steps: TransactionStep[], state: ClassificationState): void {
  state.opCodes.push("OP_HISTORY_RESTORE");
  state.typedOps.push({ code: "OP_HISTORY_RESTORE", restored_blocks: [] });
  for (const step of steps) {
    for (const blockId of step.affectedBlockIds) {
      state.touchedBlocksSet.add(blockId);
    }
  }
}

function handleStepClassification(steps: TransactionStep[], state: ClassificationState): void {
  for (const step of steps) {
    const stepResult = classifyStep(step);
    state.opCodes.push(...stepResult.opCodes);
    state.typedOps.push(...stepResult.typedOps);

    for (const blockId of step.affectedBlockIds) {
      state.touchedBlocksSet.add(blockId);
      trackTouchedRange(state.touchedRanges, blockId, step.from, step.to);
    }
  }
}

function trackTouchedRange(
  touchedRanges: Map<string, { start: number; end: number }>,
  blockId: string,
  from?: number,
  to?: number
): void {
  if (from === undefined || to === undefined) {
    return;
  }
  const existing = touchedRanges.get(blockId);
  if (existing) {
    touchedRanges.set(blockId, {
      start: Math.min(existing.start, from),
      end: Math.max(existing.end, to),
    });
  } else {
    touchedRanges.set(blockId, { start: from, end: to });
  }
}

function finalizeClassification(
  state: ClassificationState,
  input: TransactionInput
): ClassifyTransactionResult {
  const uniqueOpCodes = [...new Set(state.opCodes)].sort() as OpCode[];
  const touchedBlocks = [...state.touchedBlocksSet].sort();
  const txnIndex =
    input.seed !== undefined
      ? computeDeterministicIndex(input.seed, input.steps.length)
      : globalTxnCounter++;

  return {
    opCodes: uniqueOpCodes,
    typedOps: state.typedOps,
    touchedBlocks,
    touchedRanges: state.touchedRanges.size > 0 ? state.touchedRanges : undefined,
    txnIndex,
  };
}

/**
 * Classify a single step
 */
function classifyStep(step: TransactionStep): { opCodes: OpCode[]; typedOps: TypedOp[] } {
  switch (step.type) {
    case "replace":
      return classifyReplaceStep(step);

    case "replaceAround":
      return classifyReplaceAroundStep(step);

    case "addMark":
    case "removeMark":
      return classifyMarkStep(step);
  }
}

function classifyReplaceStep(step: TransactionStep): { opCodes: OpCode[]; typedOps: TypedOp[] } {
  if (step.insertedText?.includes("\n")) {
    return {
      opCodes: ["OP_BLOCK_SPLIT"],
      typedOps: [
        {
          code: "OP_BLOCK_SPLIT",
          block_id: step.affectedBlockIds[0] ?? "",
          offset: step.from ?? 0,
        },
      ],
    };
  }

  if (step.affectedBlockIds.length > 1 && step.deletedLength && step.deletedLength > 0) {
    return { opCodes: ["OP_BLOCK_JOIN"], typedOps: [] };
  }

  const blockId = step.affectedBlockIds[0] ?? "";
  return {
    opCodes: ["OP_TEXT_EDIT"],
    typedOps: [
      {
        code: "OP_TEXT_EDIT",
        block_id: blockId,
        offset: step.from ?? 0,
        delete_count: step.deletedLength ?? 0,
        insert: step.insertedText ?? "",
      },
    ],
  };
}

function classifyReplaceAroundStep(step: TransactionStep): {
  opCodes: OpCode[];
  typedOps: TypedOp[];
} {
  const opCode = step.affectedBlockIds.length > 1 ? "OP_LIST_REPARENT" : "OP_BLOCK_CONVERT";
  return { opCodes: [opCode], typedOps: [] };
}

function classifyMarkStep(step: TransactionStep): { opCodes: OpCode[]; typedOps: TypedOp[] } {
  return {
    opCodes: ["OP_MARK_EDIT"],
    typedOps: [
      {
        code: "OP_MARK_EDIT",
        block_id: step.affectedBlockIds[0] ?? "",
        start: step.from ?? 0,
        end: step.to ?? 0,
        mark: step.markType ?? "",
        add: step.type === "addMark",
      },
    ],
  };
}

/**
 * Compute deterministic transaction index from seed
 * Uses a simple polynomial hash for determinism
 */
function computeDeterministicIndex(seed: number, stepCount: number): number {
  // Simple polynomial rolling hash
  const PRIME = 31;
  const MOD = 1_000_000_007;

  let hash = seed;
  hash = (hash * PRIME + stepCount) % MOD;

  return hash;
}
