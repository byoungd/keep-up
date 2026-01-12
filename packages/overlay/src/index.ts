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

// Types
export * from "./types";

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
  toScanReportSummary,
  toggleOverlay,
  togglePanel,
  updateScanReport,
} from "./state";

// Block visualizer
export {
  buildContainerPath,
  calculateBlockDepth,
  extractDirtyBlockIds,
  formatBlockLabel,
  formatContainerPath,
  generateBlockOverlayCss,
  getBlockOverlayClasses,
  getBlockOverlayStyle,
  renderBlockOverlays,
  type BlockOverlayRenderResult,
} from "./blockVisualizer";

// Annotation visualizer
export {
  DEFAULT_STATE_COLORS,
  filterEventsByAnnotation,
  formatGraceRemaining,
  formatStateLabel,
  formatTimeAgo,
  formatTimestamp,
  generateAnnotationVisualizerCss,
  getEventTypeColor,
  getStateColor,
  renderAnnotationVisualizer,
  type AnnotationVisualizerData,
  type GraceStatus,
  type StateColorMap,
  type VerificationStatus,
} from "./annotationVisualizer";

// Integrity panel
export {
  DEFAULT_FORCE_SCAN_OPTIONS,
  copyToClipboard,
  formatMismatchDisplay,
  formatScanReportDisplay,
  generateIntegrityPanelCss,
  generateScanExportJson,
  getScanStatusIndicator,
  renderIntegrityPanel,
  type ForceScanUIOptions,
  type IntegrityPanelData,
  type MismatchDisplayData,
} from "./integrityPanel";

// Dev assertions
export {
  DEFAULT_DEV_ASSERTIONS_CONFIG,
  DevAssertionError,
  assertDirtyScanCoverage,
  createDevAssertionsRunner,
  formatAssertionResult,
  shouldEnableDevAssertions,
  type DevAssertionResult,
  type DevAssertionsConfig,
} from "./devAssertions";

// Overlay controller
export {
  OverlayController,
  createOverlayController,
  type OverlayControllerEvents,
} from "./overlayController";

// Debug overlay (Observability UI)
export {
  // Types
  type AnnotationRowData,
  type AnnotationsSectionData,
  type DebugOverlayConfig,
  type DebugOverlayState,
  type DebugSection,
  type DebugSnapshot,
  type DirtySectionData,
  type DocumentSectionData,
  type FocusSectionData,
  type PerfSectionData,
  type SelectionSectionData,
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  shouldEnableDebugOverlay,
  // State
  createDebugOverlayController,
  createDebugOverlayState,
  type DebugOverlayController,
  // Snapshot
  copySnapshotToClipboard,
  createDebugSnapshot,
  downloadSnapshot,
  serializeSnapshot,
  validateSnapshotSchema,
  // Perf counters
  createPerfCounters,
  getPerfCounters,
  type PerfCounters,
  // Renderer
  generateDebugOverlayCss,
  renderDebugOverlay,
  renderDocumentSection,
  renderSelectionSection,
  renderAnnotationsSection,
  renderFocusSection,
  renderDirtySection,
  renderPerfSection,
  renderActionsSection,
} from "./debugOverlay";
