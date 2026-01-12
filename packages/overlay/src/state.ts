/**
 * LFCC v0.9 RC - DevTools Overlay State Management
 *
 * Pure state management for the debug overlay.
 * No UI framework dependencies - works in Node.js and Browser.
 */

import type {
  AnnotationDisplayData,
  BlockMeta,
  OverlayConfig,
  OverlayEvent,
  OverlayEventType,
  OverlayPanel,
  OverlayState,
  ScanReportSummary,
} from "./types";
import { DEFAULT_OVERLAY_CONFIG } from "./types";

/** Create initial overlay state */
export function createOverlayState(config?: Partial<OverlayConfig>): OverlayState {
  const mergedConfig = { ...DEFAULT_OVERLAY_CONFIG, ...config };
  return {
    visible: false,
    activePanels: new Set(mergedConfig.defaultPanels),
    selectedBlockId: null,
    selectedAnnoId: null,
    lastScanReport: null,
    eventLog: [],
  };
}

/** Toggle overlay visibility */
export function toggleOverlay(state: OverlayState): OverlayState {
  return {
    ...state,
    visible: !state.visible,
  };
}

/** Show overlay */
export function showOverlay(state: OverlayState): OverlayState {
  return {
    ...state,
    visible: true,
  };
}

/** Hide overlay */
export function hideOverlay(state: OverlayState): OverlayState {
  return {
    ...state,
    visible: false,
  };
}

/** Toggle a panel */
export function togglePanel(state: OverlayState, panel: OverlayPanel): OverlayState {
  const newPanels = new Set(state.activePanels);
  if (newPanels.has(panel)) {
    newPanels.delete(panel);
  } else {
    newPanels.add(panel);
  }
  return {
    ...state,
    activePanels: newPanels,
  };
}

/** Select a block */
export function selectBlock(state: OverlayState, blockId: string | null): OverlayState {
  return {
    ...state,
    selectedBlockId: blockId,
  };
}

/** Select an annotation */
export function selectAnnotation(state: OverlayState, annoId: string | null): OverlayState {
  return {
    ...state,
    selectedAnnoId: annoId,
  };
}

/** Update scan report */
export function updateScanReport(state: OverlayState, report: ScanReportSummary): OverlayState {
  return {
    ...state,
    lastScanReport: report,
  };
}

/** Add event to log */
export function addEvent(
  state: OverlayState,
  type: OverlayEventType,
  source: string,
  detail: string,
  metadata?: Record<string, unknown>,
  maxSize = 100
): OverlayState {
  const event: OverlayEvent = {
    id: generateEventId(),
    timestamp: Date.now(),
    type,
    source,
    detail,
    metadata,
  };

  const newLog = [event, ...state.eventLog];
  if (newLog.length > maxSize) {
    newLog.length = maxSize;
  }

  return {
    ...state,
    eventLog: newLog,
  };
}

/** Clear event log */
export function clearEventLog(state: OverlayState): OverlayState {
  return {
    ...state,
    eventLog: [],
  };
}

/** Generate unique event ID */
function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Data Extraction Helpers
// ============================================================================

/** Extract block metadata from block data */
export function extractBlockMeta(
  blockId: string,
  type: string,
  parentPath: string[],
  textContent: string,
  childCount: number,
  dirtyBlockIds: Set<string>
): BlockMeta {
  return {
    blockId,
    type,
    containerPath: parentPath.length > 0 ? parentPath.join(" > ") : "(root)",
    isDirty: dirtyBlockIds.has(blockId),
    textPreview: textContent.slice(0, 50) + (textContent.length > 50 ? "..." : ""),
    childCount,
  };
}

/** Extract annotation display data */
export function extractAnnotationData(
  annoId: string,
  spanIds: string[],
  targetBlockIds: string[],
  currentState: string,
  graceToken: string | null,
  graceExpiresAt: number | null,
  lastVerifyTime: number | null,
  lastVerifyReason: string | null,
  contextHash: string | null
): AnnotationDisplayData {
  return {
    annoId,
    spanIds,
    targetBlockIds,
    currentState,
    graceToken,
    graceExpiresAt,
    lastVerifyTime,
    lastVerifyReason,
    contextHash,
  };
}

/** Convert full scan report to summary */
export function toScanReportSummary(report: {
  timestamp: number;
  duration_ms: number;
  blocks_scanned: number;
  annotations_scanned: number;
  summary: {
    total_mismatches: number;
    missed_by_dirty: number;
    hash_mismatches: number;
    chain_violations: number;
  };
}): ScanReportSummary {
  return {
    timestamp: report.timestamp,
    durationMs: report.duration_ms,
    blocksScanned: report.blocks_scanned,
    annotationsScanned: report.annotations_scanned,
    totalMismatches: report.summary.total_mismatches,
    missedByDirty: report.summary.missed_by_dirty,
    hashMismatches: report.summary.hash_mismatches,
    chainViolations: report.summary.chain_violations,
  };
}
