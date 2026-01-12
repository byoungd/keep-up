/**
 * LFCC v0.9 RC - DevTools Debug Overlay Types
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md
 */

/** Overlay panel types */
export type OverlayPanel = "blocks" | "annotations" | "integrity" | "events";

/** Overlay configuration */
export type OverlayConfig = {
  /** Enable overlay (dev flag) */
  enabled: boolean;
  /** Keyboard shortcut to toggle */
  toggleShortcut: string;
  /** Initially visible panels */
  defaultPanels: OverlayPanel[];
  /** Show dirty block highlights */
  showDirtyBlocks: boolean;
  /** Enable dev assertions mode */
  devAssertionsMode: boolean;
  /** Max events to keep in log */
  maxEventLogSize: number;
};

/** Overlay state */
export type OverlayState = {
  /** Whether overlay is visible */
  visible: boolean;
  /** Active panels */
  activePanels: Set<OverlayPanel>;
  /** Selected block ID */
  selectedBlockId: string | null;
  /** Selected annotation ID */
  selectedAnnoId: string | null;
  /** Last scan report */
  lastScanReport: ScanReportSummary | null;
  /** Event log */
  eventLog: OverlayEvent[];
};

/** Block rect for overlay rendering */
export type BlockRect = {
  blockId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Block metadata for overlay */
export type BlockMeta = {
  blockId: string;
  type: string;
  containerPath: string;
  isDirty: boolean;
  textPreview: string;
  childCount: number;
};

/** Annotation display data */
export type AnnotationDisplayData = {
  annoId: string;
  spanIds: string[];
  targetBlockIds: string[];
  currentState: string;
  graceToken: string | null;
  graceExpiresAt: number | null;
  lastVerifyTime: number | null;
  lastVerifyReason: string | null;
  contextHash: string | null;
};

/** Overlay event for event log */
export type OverlayEvent = {
  id: string;
  timestamp: number;
  type: OverlayEventType;
  source: string;
  detail: string;
  metadata?: Record<string, unknown>;
};

/** Event types */
export type OverlayEventType =
  | "state_transition"
  | "checkpoint"
  | "grace_enter"
  | "grace_exit"
  | "scan_complete"
  | "mismatch_detected"
  | "repair_attempt"
  | "block_dirty"
  | "user_action";

/** Scan report summary for display */
export type ScanReportSummary = {
  timestamp: number;
  durationMs: number;
  blocksScanned: number;
  annotationsScanned: number;
  totalMismatches: number;
  missedByDirty: number;
  hashMismatches: number;
  chainViolations: number;
};

/** Block overlay render data */
export type BlockOverlayData = {
  rect: BlockRect;
  meta: BlockMeta;
  isSelected: boolean;
  isDirty: boolean;
};

/** CSS tokens for overlay styling */
export type OverlayCssTokens = {
  /** Overlay background */
  overlayBg: string;
  /** Panel background */
  panelBg: string;
  /** Text color */
  textColor: string;
  /** Border color */
  borderColor: string;
  /** Block outline color */
  blockOutline: string;
  /** Dirty block highlight */
  dirtyHighlight: string;
  /** Selected highlight */
  selectedHighlight: string;
  /** Error color */
  errorColor: string;
  /** Warning color */
  warningColor: string;
  /** Success color */
  successColor: string;
};

/** Default CSS tokens */
export const DEFAULT_CSS_TOKENS: OverlayCssTokens = {
  overlayBg: "rgba(0, 0, 0, 0.85)",
  panelBg: "rgba(30, 30, 30, 0.95)",
  textColor: "#e0e0e0",
  borderColor: "#444",
  blockOutline: "#4a9eff",
  dirtyHighlight: "#ff9800",
  selectedHighlight: "#00e676",
  errorColor: "#f44336",
  warningColor: "#ff9800",
  successColor: "#4caf50",
};

/** Default overlay config */
export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  enabled: false,
  toggleShortcut: "Ctrl+Shift+D",
  defaultPanels: ["blocks", "annotations"],
  showDirtyBlocks: true,
  devAssertionsMode: false,
  maxEventLogSize: 100,
};
