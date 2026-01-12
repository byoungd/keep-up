/**
 * LFCC v0.9 RC - Shadow Model Module
 */

export {
  applyHistoryEntry,
  createHistoryState,
  getRestoredAnnotationDisplayState,
  isHistoryRestore,
  processHistoryRestore,
  pushHistory,
  redo,
  undo,
  type HistoryEntry,
  type HistoryRestoreResult,
  type HistoryState,
} from "./history";
export {
  classifyEvent,
  eventToTypedOp,
  isStructuralOp,
  requiresFullScan,
  type EditorEvent,
} from "./opClassifier";
export {
  classifyTransaction,
  resetTxnCounter,
  type ClassifyTransactionResult,
  type TransactionInput,
  type TransactionStep,
} from "./classifyTransaction";
export {
  addBlock,
  applyOp,
  createShadowDocument,
  getBlock,
  getContentBlocks,
} from "./shadowModel";
export * from "./types";
