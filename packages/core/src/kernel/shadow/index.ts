/**
 * LFCC v0.9 RC - Shadow Model Module
 */

export {
  type ClassifyTransactionResult,
  classifyTransaction,
  resetTxnCounter,
  type TransactionInput,
  type TransactionStep,
} from "./classifyTransaction.js";
export {
  applyHistoryEntry,
  createHistoryState,
  getRestoredAnnotationDisplayState,
  type HistoryEntry,
  type HistoryRestoreResult,
  type HistoryState,
  isHistoryRestore,
  processHistoryRestore,
  pushHistory,
  redo,
  undo,
} from "./history.js";
export {
  classifyEvent,
  type EditorEvent,
  eventToTypedOp,
  isStructuralOp,
  requiresFullScan,
} from "./opClassifier.js";
export {
  addBlock,
  applyOp,
  createShadowDocument,
  getBlock,
  getContentBlocks,
} from "./shadowModel.js";
export * from "./types.js";
