/**
 * LFCC v0.9 RC - DevTools Debug Overlay
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md
 *
 * Developer tooling for LFCC integration debugging:
 * - Block boundary visualization
 * - Annotation state machine visualization
 * - Force full integrity scan
 * - Dev assertions mode
 * - Observability debug overlay (@see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md)
 */

// Annotation visualizer
export {
  type AnnotationVisualizerData,
  DEFAULT_STATE_COLORS,
  filterEventsByAnnotation,
  formatGraceRemaining,
  formatStateLabel,
  formatTimeAgo,
  formatTimestamp,
  type GraceStatus,
  generateAnnotationVisualizerCss,
  getEventTypeColor,
  getStateColor,
  renderAnnotationVisualizer,
  type StateColorMap,
  type VerificationStatus,
} from "./annotationVisualizer";
// Block visualizer
export {
  type BlockOverlayRenderResult,
  buildContainerPath,
  calculateBlockDepth,
  extractDirtyBlockIds,
  formatBlockLabel,
  formatContainerPath,
  generateBlockOverlayCss,
  getBlockOverlayClasses,
  getBlockOverlayStyle,
  renderBlockOverlays,
} from "./blockVisualizer";
// Debug overlay (Observability UI)
export {
  // Types
  type AnnotationRowData,
  type AnnotationsSectionData,
  // Snapshot
  copySnapshotToClipboard,
  // State
  createDebugOverlayController,
  createDebugOverlayState,
  createDebugSnapshot,
  // Perf counters
  createPerfCounters,
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  type DebugOverlayConfig,
  type DebugOverlayController,
  type DebugOverlayState,
  type DebugSection,
  type DebugSnapshot,
  type DirtySectionData,
  type DocumentSectionData,
  downloadSnapshot,
  type FocusSectionData,
  // Renderer
  generateDebugOverlayCss,
  getPerfCounters,
  type PerfCounters,
  type PerfSectionData,
  renderActionsSection,
  renderAnnotationsSection,
  renderDebugOverlay,
  renderDirtySection,
  renderDocumentSection,
  renderFocusSection,
  renderPerfSection,
  renderSelectionSection,
  type SelectionSectionData,
  serializeSnapshot,
  shouldEnableDebugOverlay,
  validateSnapshotSchema,
} from "./debugOverlay";
// Dev assertions
export {
  assertDirtyScanCoverage,
  createDevAssertionsRunner,
  DEFAULT_DEV_ASSERTIONS_CONFIG,
  DevAssertionError,
  type DevAssertionResult,
  type DevAssertionsConfig,
  formatAssertionResult,
  shouldEnableDevAssertions,
} from "./devAssertions";

// Integrity panel
export {
  copyToClipboard,
  DEFAULT_FORCE_SCAN_OPTIONS,
  type ForceScanUIOptions,
  formatMismatchDisplay,
  formatScanReportDisplay,
  generateIntegrityPanelCss,
  generateScanExportJson,
  getScanStatusIndicator,
  type IntegrityPanelData,
  type MismatchDisplayData,
  renderIntegrityPanel,
} from "./integrityPanel";
// Overlay controller
export {
  createOverlayController,
  OverlayController,
  type OverlayControllerEvents,
} from "./overlayController";
// State management
export {
  addEvent,
  clearEventLog,
  createOverlayState,
  extractAnnotationData,
  extractBlockMeta,
  hideOverlay,
  selectAnnotation,
  selectBlock,
  showOverlay,
  toggleOverlay,
  togglePanel,
  toScanReportSummary,
  updateScanReport,
} from "./state";
// Types
export * from "./types";
