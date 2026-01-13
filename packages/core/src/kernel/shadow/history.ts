/**
 * LFCC v0.9 RC - History Integration
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/05_History_Integration_Guide.md
 */

import type { HistoryPolicy } from "../policy/types.js";
import type { ShadowBlock, ShadowDocument } from "./types.js";

/** History entry for undo/redo */
export type HistoryEntry = {
  /** Timestamp of the entry */
  timestamp: number;
  /** Snapshot of affected blocks */
  blocks: Map<string, ShadowBlock>;
  /** Block order at this point */
  block_order: string[];
  /** Annotation IDs that were active */
  annotation_ids: string[];
};

/** History stack state */
export type HistoryState = {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  maxSize: number;
};

/**
 * Create initial history state
 */
export function createHistoryState(maxSize = 100): HistoryState {
  return {
    undoStack: [],
    redoStack: [],
    maxSize,
  };
}

/**
 * Push a new entry to the undo stack
 */
export function pushHistory(
  state: HistoryState,
  doc: ShadowDocument,
  annotationIds: string[]
): HistoryState {
  const entry: HistoryEntry = {
    timestamp: Date.now(),
    blocks: new Map(doc.blocks),
    block_order: [...doc.block_order],
    annotation_ids: [...annotationIds],
  };

  const newUndoStack = [...state.undoStack, entry];

  // Trim if exceeds max size
  if (newUndoStack.length > state.maxSize) {
    newUndoStack.shift();
  }

  return {
    ...state,
    undoStack: newUndoStack,
    redoStack: [], // Clear redo stack on new action
  };
}

/**
 * Perform undo operation
 */
export function undo(
  state: HistoryState,
  currentDoc: ShadowDocument,
  currentAnnotationIds: string[]
): { state: HistoryState; entry: HistoryEntry | null } {
  if (state.undoStack.length === 0) {
    return { state, entry: null };
  }

  // Save current state to redo stack
  const currentEntry: HistoryEntry = {
    timestamp: Date.now(),
    blocks: new Map(currentDoc.blocks),
    block_order: [...currentDoc.block_order],
    annotation_ids: [...currentAnnotationIds],
  };

  const newUndoStack = [...state.undoStack];
  // biome-ignore lint/style/noNonNullAssertion: history logic
  const entry = newUndoStack.pop()!;

  return {
    state: {
      ...state,
      undoStack: newUndoStack,
      redoStack: [...state.redoStack, currentEntry],
    },
    entry,
  };
}

/**
 * Perform redo operation
 */
export function redo(
  state: HistoryState,
  currentDoc: ShadowDocument,
  currentAnnotationIds: string[]
): { state: HistoryState; entry: HistoryEntry | null } {
  if (state.redoStack.length === 0) {
    return { state, entry: null };
  }

  // Save current state to undo stack
  const currentEntry: HistoryEntry = {
    timestamp: Date.now(),
    blocks: new Map(currentDoc.blocks),
    block_order: [...currentDoc.block_order],
    annotation_ids: [...currentAnnotationIds],
  };

  const newRedoStack = [...state.redoStack];
  // biome-ignore lint/style/noNonNullAssertion: history logic
  const entry = newRedoStack.pop()!;

  return {
    state: {
      ...state,
      undoStack: [...state.undoStack, currentEntry],
      redoStack: newRedoStack,
    },
    entry,
  };
}

/**
 * Apply a history entry to restore document state
 */
export function applyHistoryEntry(doc: ShadowDocument, entry: HistoryEntry): ShadowDocument {
  return {
    ...doc,
    blocks: new Map(entry.blocks),
    block_order: [...entry.block_order],
  };
}

/** Result of history restore for annotations */
export type HistoryRestoreResult = {
  /** Annotation IDs that were restored */
  restored_annotation_ids: string[];
  /** Block IDs that were affected */
  affected_block_ids: string[];
  /** Whether verification should be triggered */
  should_verify: boolean;
  /** Whether grace period should be skipped */
  skip_grace: boolean;
};

/**
 * Process history restore for annotations
 * HISTORY-001: Restored annotations enter via active_unverified
 * HISTORY-002: Must revive stable UUIDs (no new IDs)
 * HISTORY-003: Skip broken_grace
 * HISTORY-004: Trigger high-priority verification
 */
export function processHistoryRestore(
  entry: HistoryEntry,
  currentAnnotationIds: string[],
  policy: HistoryPolicy
): HistoryRestoreResult {
  // Find annotations that were restored
  const restoredIds = entry.annotation_ids.filter((id) => !currentAnnotationIds.includes(id));

  // Find affected blocks
  const affectedBlockIds = [...entry.block_order];

  return {
    restored_annotation_ids: restoredIds,
    affected_block_ids: affectedBlockIds,
    should_verify: policy.force_verify_on_restore,
    skip_grace: policy.restore_skip_grace,
  };
}

/**
 * Check if an operation is a history restore
 */
export function isHistoryRestore(opCode: string): boolean {
  return opCode === "OP_HISTORY_RESTORE";
}

/**
 * Get the display state for a restored annotation
 * Per HISTORY-001: enters via active_unverified
 */
export function getRestoredAnnotationDisplayState(
  policy: HistoryPolicy
): "active_unverified" | "active" {
  return policy.restore_enters_unverified ? "active_unverified" : "active";
}
