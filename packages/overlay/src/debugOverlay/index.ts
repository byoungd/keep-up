/**
 * LFCC v0.9 RC - Debug Overlay Module
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 *
 * Exports for the observability debug overlay
 */

// Types
export * from "./types";

// State management
export {
  createDebugOverlayController,
  createDebugOverlayState,
  recordScanResult,
  toggleDebugOverlayVisibility,
  toggleDebugSection,
  toggleDecorationOutlines,
  updateAnnotationsSection,
  updateDirtySection,
  updateDocumentSection,
  updateFocusSection,
  updatePerfSection,
  updateSelectionSection,
  type DebugOverlayController,
} from "./state";

// Snapshot export
export {
  copySnapshotToClipboard,
  createDebugSnapshot,
  downloadSnapshot,
  serializeSnapshot,
  validateSnapshotSchema,
} from "./debugSnapshot";

// Performance counters
export { createPerfCounters, getPerfCounters, type PerfCounters } from "./perfCounters";

// Renderer
export {
  generateDebugOverlayCss,
  renderActionsSection,
  renderAnnotationsSection,
  renderDebugOverlay,
  renderDirtySection,
  renderDocumentSection,
  renderFocusSection,
  renderPerfSection,
  renderSelectionSection,
} from "./renderer";
