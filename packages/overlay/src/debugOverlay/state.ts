/**
 * LFCC v0.9 RC - Debug Overlay State Manager
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 *
 * Manages debug overlay state without mutating LFCC replicated state
 */

import type {
  AnnotationRowData,
  DebugOverlayConfig,
  DebugOverlayState,
  DebugSection,
  DirtySectionData,
  DocumentSectionData,
  FocusSectionData,
  PerfSectionData,
  SelectionSectionData,
} from "./types";
import { DEFAULT_DEBUG_OVERLAY_CONFIG, shouldEnableDebugOverlay } from "./types";

/**
 * Create initial debug overlay state
 */
export function createDebugOverlayState(): DebugOverlayState {
  return {
    visible: false,
    expandedSections: new Set<DebugSection>(["document", "selection", "annotations"]),
    decorationOutlinesEnabled: false,
    lastScanResult: null,
    document: null,
    selection: null,
    annotations: null,
    focus: null,
    dirty: null,
    perf: null,
  };
}

/**
 * Toggle overlay visibility
 */
export function toggleDebugOverlayVisibility(state: DebugOverlayState): DebugOverlayState {
  return {
    ...state,
    visible: !state.visible,
  };
}

/**
 * Toggle section expansion
 */
export function toggleDebugSection(
  state: DebugOverlayState,
  section: DebugSection
): DebugOverlayState {
  const newExpanded = new Set(state.expandedSections);
  if (newExpanded.has(section)) {
    newExpanded.delete(section);
  } else {
    newExpanded.add(section);
  }
  return {
    ...state,
    expandedSections: newExpanded,
  };
}

/**
 * Toggle decoration outlines
 */
export function toggleDecorationOutlines(state: DebugOverlayState): DebugOverlayState {
  return {
    ...state,
    decorationOutlinesEnabled: !state.decorationOutlinesEnabled,
  };
}

/**
 * Update document section data
 */
export function updateDocumentSection(
  state: DebugOverlayState,
  data: DocumentSectionData
): DebugOverlayState {
  return {
    ...state,
    document: data,
  };
}

/**
 * Update selection section data
 */
export function updateSelectionSection(
  state: DebugOverlayState,
  data: SelectionSectionData
): DebugOverlayState {
  return {
    ...state,
    selection: data,
  };
}

/**
 * Update annotations section data
 */
export function updateAnnotationsSection(
  state: DebugOverlayState,
  annotations: AnnotationRowData[]
): DebugOverlayState {
  return {
    ...state,
    annotations: {
      annotations,
      totalCount: annotations.length,
    },
  };
}

/**
 * Update focus section data
 */
export function updateFocusSection(
  state: DebugOverlayState,
  data: FocusSectionData
): DebugOverlayState {
  return {
    ...state,
    focus: data,
  };
}

/**
 * Update dirty section data
 */
export function updateDirtySection(
  state: DebugOverlayState,
  data: DirtySectionData
): DebugOverlayState {
  return {
    ...state,
    dirty: data,
  };
}

/**
 * Update perf section data
 */
export function updatePerfSection(
  state: DebugOverlayState,
  data: PerfSectionData
): DebugOverlayState {
  return {
    ...state,
    perf: data,
  };
}

/**
 * Record scan result
 */
export function recordScanResult(
  state: DebugOverlayState,
  result: { ok: boolean; failureCount: number }
): DebugOverlayState {
  return {
    ...state,
    lastScanResult: result,
  };
}

/**
 * Debug overlay controller
 */
export type DebugOverlayController = {
  /** Current state */
  getState: () => DebugOverlayState;
  /** Configuration */
  getConfig: () => DebugOverlayConfig;
  /** Check if overlay is enabled */
  isEnabled: () => boolean;
  /** Toggle visibility */
  toggle: () => void;
  /** Show overlay */
  show: () => void;
  /** Hide overlay */
  hide: () => void;
  /** Toggle section */
  toggleSection: (section: DebugSection) => void;
  /** Toggle decoration outlines */
  toggleOutlines: () => void;
  /** Update document data */
  updateDocument: (data: DocumentSectionData) => void;
  /** Update selection data */
  updateSelection: (data: SelectionSectionData) => void;
  /** Update annotations data */
  updateAnnotations: (annotations: AnnotationRowData[]) => void;
  /** Update focus data */
  updateFocus: (data: FocusSectionData) => void;
  /** Update dirty data */
  updateDirty: (data: DirtySectionData) => void;
  /** Update perf data */
  updatePerf: (data: PerfSectionData) => void;
  /** Record integrity scan result */
  recordScan: (result: { ok: boolean; failureCount: number }) => void;
  /** Subscribe to state changes */
  subscribe: (callback: (state: DebugOverlayState) => void) => () => void;
};

/**
 * Create debug overlay controller
 */
export function createDebugOverlayController(
  config: Partial<DebugOverlayConfig> = {}
): DebugOverlayController {
  const fullConfig: DebugOverlayConfig = {
    ...DEFAULT_DEBUG_OVERLAY_CONFIG,
    ...config,
    enabled: config.enabled ?? shouldEnableDebugOverlay(),
  };

  let state = createDebugOverlayState();
  const subscribers = new Set<(state: DebugOverlayState) => void>();

  function notify() {
    for (const callback of subscribers) {
      callback(state);
    }
  }

  function updateState(newState: DebugOverlayState) {
    state = newState;
    notify();
  }

  return {
    getState: () => state,
    getConfig: () => fullConfig,
    isEnabled: () => fullConfig.enabled,

    toggle() {
      updateState(toggleDebugOverlayVisibility(state));
    },

    show() {
      if (!state.visible) {
        updateState({ ...state, visible: true });
      }
    },

    hide() {
      if (state.visible) {
        updateState({ ...state, visible: false });
      }
    },

    toggleSection(section: DebugSection) {
      updateState(toggleDebugSection(state, section));
    },

    toggleOutlines() {
      updateState(toggleDecorationOutlines(state));
    },

    updateDocument(data: DocumentSectionData) {
      updateState(updateDocumentSection(state, data));
    },

    updateSelection(data: SelectionSectionData) {
      updateState(updateSelectionSection(state, data));
    },

    updateAnnotations(annotations: AnnotationRowData[]) {
      updateState(updateAnnotationsSection(state, annotations));
    },

    updateFocus(data: FocusSectionData) {
      updateState(updateFocusSection(state, data));
    },

    updateDirty(data: DirtySectionData) {
      updateState(updateDirtySection(state, data));
    },

    updatePerf(data: PerfSectionData) {
      updateState(updatePerfSection(state, data));
    },

    recordScan(result: { ok: boolean; failureCount: number }) {
      updateState(recordScanResult(state, result));
    },

    subscribe(callback: (state: DebugOverlayState) => void) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
