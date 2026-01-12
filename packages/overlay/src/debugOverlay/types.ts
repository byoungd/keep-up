/**
 * LFCC v0.9 RC - Debug Overlay Types
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 */

/**
 * Section types for the debug overlay panel
 */
export type DebugSection =
  | "document"
  | "selection"
  | "annotations"
  | "focus"
  | "dirty"
  | "perf"
  | "actions";

/**
 * Document section data
 */
export type DocumentSectionData = {
  docId: string | null;
  seedFlag: boolean;
  currentFrontier: string;
  blockCount: number;
  lastTxType: string;
  lastTxClassification: "split" | "join" | "reorder" | "none" | "inline";
  lastTxTimestamp: number;
};

/**
 * Selection section data
 */
export type SelectionSectionData = {
  /** PM selection: from/to */
  pmSelection: { from: number; to: number; type: string } | null;
  /** Mapped SpanList */
  mappedSpans: Array<{
    blockId: string;
    start: number;
    end: number;
  }>;
  /** Chain policy */
  chainPolicy: "required_order" | "strict_adjacency" | "bounded_gap" | null;
  /** Mapping mode */
  strictMapping: boolean;
  /** Last mapping error */
  lastMappingError: { code: string; message: string } | null;
};

/**
 * Annotation row data
 */
export type AnnotationRowData = {
  id: string;
  shortId: string;
  color: string | null;
  type: string;
  state: "active" | "active_unverified" | "broken_grace" | "active_partial" | "orphan";
  verificationStatus: "verified" | "unverified";
  lastVerifyResult: string | null;
  contextHashShort: string | null;
  spansCount: number;
  resolvedSegmentsCount: number;
  resolvedBlockIds: string[];
  lastError: { code: string; message: string } | null;
};

/**
 * Annotations section data
 */
export type AnnotationsSectionData = {
  annotations: AnnotationRowData[];
  totalCount: number;
};

/**
 * Focus section data
 */
export type FocusSectionData = {
  focusedAnnotationId: string | null;
  focusSource: "panel_click" | "scroll_to" | "keyboard" | "other" | null;
  focusOverlayDecorationCount: number;
  decorationKeyPreview: string[];
};

/**
 * Dirty/Tx classification section data
 */
export type DirtySectionData = {
  touchedBlockIds: string[];
  neighborExpansionK: number;
  reason: "split" | "join" | "reorder" | "inline" | "none";
  spansReResolvedCount: number;
  annotationsReVerifiedCount: number;
};

/**
 * Performance counters
 */
export type PerfSectionData = {
  dragUpdatesPerSecond: number;
  resolutionCallsPerSecond: number;
  decorationRebuildsPerSecond: number;
  avgResolutionDurationMs: number;
  p95ResolutionDurationMs: number;
};

/**
 * Debug snapshot for export
 */
export type DebugSnapshot = {
  version: "1.0.0";
  timestamp: number;
  document: DocumentSectionData | null;
  selection: SelectionSectionData | null;
  annotations: AnnotationRowData[];
  focus: FocusSectionData | null;
  dirty: DirtySectionData | null;
  recentErrors: Array<{ code: string; message: string; timestamp: number }>;
};

/**
 * Debug overlay state
 */
export type DebugOverlayState = {
  visible: boolean;
  expandedSections: Set<DebugSection>;
  decorationOutlinesEnabled: boolean;
  lastScanResult: { ok: boolean; failureCount: number } | null;
  document: DocumentSectionData | null;
  selection: SelectionSectionData | null;
  annotations: AnnotationsSectionData | null;
  focus: FocusSectionData | null;
  dirty: DirtySectionData | null;
  perf: PerfSectionData | null;
};

/**
 * Debug overlay configuration
 */
export type DebugOverlayConfig = {
  /** Enable overlay (requires NODE_ENV !== 'production' + flag) */
  enabled: boolean;
  /** Update throttle interval in ms */
  throttleMs: number;
  /** Max annotations to display in table */
  maxAnnotationsDisplay: number;
};

/**
 * Default configuration
 */
export const DEFAULT_DEBUG_OVERLAY_CONFIG: DebugOverlayConfig = {
  enabled: false,
  throttleMs: 300,
  maxAnnotationsDisplay: 50,
};

/**
 * Check if debug overlay should be enabled
 */
export function shouldEnableDebugOverlay(): boolean {
  // Must not be production
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    return false;
  }

  // Check query param
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("lfccDebug") === "1") {
      return true;
    }

    // Check localStorage
    try {
      if (localStorage.getItem("lfcc.debug") === "1") {
        return true;
      }
    } catch {
      // localStorage not available
    }
  }

  return false;
}
