/**
 * LFCC v0.9 RC - Overlay Controller
 *
 * Main controller for the debug overlay.
 * Coordinates all overlay components and provides a unified API.
 */

import { type AnnotationVisualizerData, renderAnnotationVisualizer } from "./annotationVisualizer";
import { type BlockOverlayRenderResult, renderBlockOverlays } from "./blockVisualizer";
import { createDevAssertionsRunner, type DevAssertionsConfig } from "./devAssertions";
import { type IntegrityPanelData, renderIntegrityPanel } from "./integrityPanel";
import {
  addEvent,
  clearEventLog,
  createOverlayState,
  hideOverlay,
  selectAnnotation,
  selectBlock,
  showOverlay,
  toggleOverlay,
  togglePanel,
  toScanReportSummary,
  updateScanReport,
} from "./state";
import type {
  AnnotationDisplayData,
  BlockMeta,
  BlockRect,
  OverlayConfig,
  OverlayEvent,
  OverlayEventType,
  OverlayPanel,
  OverlayState,
} from "./types";
import { DEFAULT_OVERLAY_CONFIG } from "./types";

/** Overlay controller events */
export type OverlayControllerEvents = {
  stateChange: (state: OverlayState) => void;
  scanRequested: (options: { compareDirty: boolean; generateJson: boolean }) => void;
  blockSelected: (blockId: string | null) => void;
  annotationSelected: (annoId: string | null) => void;
};

/** Event listener */
type EventListener<K extends keyof OverlayControllerEvents> = OverlayControllerEvents[K];

/**
 * Overlay Controller
 *
 * Main entry point for the debug overlay.
 * Platform-agnostic - actual rendering is done by the UI layer.
 */
export class OverlayController {
  private config: OverlayConfig;
  private state: OverlayState;
  private listeners = new Map<
    keyof OverlayControllerEvents,
    Set<EventListener<keyof OverlayControllerEvents>>
  >();
  private devAssertions: ReturnType<typeof createDevAssertionsRunner>;

  // Cached data for rendering
  private blockRects: BlockRect[] = [];
  private blockMetas = new Map<string, BlockMeta>();
  private annotations: AnnotationDisplayData[] = [];
  private mismatches: Array<{ kind: string; anno_id: string; span_id?: string; detail: string }> =
    [];
  private isScanning = false;

  constructor(config?: Partial<OverlayConfig>, devAssertionsConfig?: DevAssertionsConfig) {
    this.config = { ...DEFAULT_OVERLAY_CONFIG, ...config };
    this.state = createOverlayState(this.config);
    this.devAssertions = createDevAssertionsRunner(
      devAssertionsConfig ?? { enabled: false, throwOnFailure: false, logToConsole: true }
    );
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /** Get current state */
  getState(): OverlayState {
    return this.state;
  }

  /** Get config */
  getConfig(): OverlayConfig {
    return this.config;
  }

  /** Toggle overlay visibility */
  toggle(): void {
    this.state = toggleOverlay(this.state);
    this.emit("stateChange", this.state);
  }

  /** Show overlay */
  show(): void {
    this.state = showOverlay(this.state);
    this.emit("stateChange", this.state);
  }

  /** Hide overlay */
  hide(): void {
    this.state = hideOverlay(this.state);
    this.emit("stateChange", this.state);
  }

  /** Toggle a panel */
  togglePanelVisibility(panel: OverlayPanel): void {
    this.state = togglePanel(this.state, panel);
    this.emit("stateChange", this.state);
  }

  /** Select a block */
  setSelectedBlock(blockId: string | null): void {
    this.state = selectBlock(this.state, blockId);
    this.emit("stateChange", this.state);
    this.emit("blockSelected", blockId);
  }

  /** Select an annotation */
  setSelectedAnnotation(annoId: string | null): void {
    this.state = selectAnnotation(this.state, annoId);
    this.emit("stateChange", this.state);
    this.emit("annotationSelected", annoId);
  }

  // ============================================================================
  // Data Updates
  // ============================================================================

  /** Update block data */
  updateBlocks(rects: BlockRect[], metas: Map<string, BlockMeta>): void {
    this.blockRects = rects;
    this.blockMetas = metas;
  }

  /** Update annotations */
  updateAnnotations(annotations: AnnotationDisplayData[]): void {
    this.annotations = annotations;
  }

  /** Update scan results */
  updateScanResults(
    report: {
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
    },
    mismatches: Array<{ kind: string; anno_id: string; span_id?: string; detail: string }>
  ): void {
    const summary = toScanReportSummary(report);
    this.state = updateScanReport(this.state, summary);
    this.mismatches = mismatches;
    this.isScanning = false;

    // Log event
    this.logEvent(
      "scan_complete",
      "integrity",
      `Scan completed: ${summary.totalMismatches} mismatches`
    );

    // Run dev assertions
    if (this.devAssertions.isEnabled()) {
      const result = this.devAssertions.runAfterScan(summary);
      if (!result.passed) {
        this.logEvent(
          "mismatch_detected",
          "dev_assertions",
          `Dirty scan missed ${result.missedMismatches} mismatches`
        );
      }
    }

    this.emit("stateChange", this.state);
  }

  /** Set scanning state */
  setScanning(scanning: boolean): void {
    this.isScanning = scanning;
  }

  // ============================================================================
  // Event Logging
  // ============================================================================

  /** Log an event */
  logEvent(
    type: OverlayEventType,
    source: string,
    detail: string,
    metadata?: Record<string, unknown>
  ): void {
    this.state = addEvent(this.state, type, source, detail, metadata, this.config.maxEventLogSize);
    this.emit("stateChange", this.state);
  }

  /** Clear event log */
  clearEvents(): void {
    this.state = clearEventLog(this.state);
    this.emit("stateChange", this.state);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  /** Render block overlays */
  renderBlocks(): BlockOverlayRenderResult {
    return renderBlockOverlays(this.blockRects, this.blockMetas, this.state.selectedBlockId);
  }

  /** Render annotation visualizer for selected annotation */
  renderSelectedAnnotation(): AnnotationVisualizerData | null {
    if (!this.state.selectedAnnoId) {
      return null;
    }

    const annotation = this.annotations.find((a) => a.annoId === this.state.selectedAnnoId);
    if (!annotation) {
      return null;
    }

    return renderAnnotationVisualizer(annotation, this.state.eventLog);
  }

  /** Render all annotations */
  renderAnnotations(): AnnotationVisualizerData[] {
    return this.annotations.map((a) => renderAnnotationVisualizer(a, this.state.eventLog));
  }

  /** Render integrity panel */
  renderIntegrity(): IntegrityPanelData {
    return renderIntegrityPanel(this.state.lastScanReport, this.mismatches, this.isScanning);
  }

  /** Get event log */
  getEventLog(): OverlayEvent[] {
    return this.state.eventLog;
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /** Request a force full scan */
  requestForceScan(options: { compareDirty: boolean; generateJson: boolean }): void {
    this.isScanning = true;
    this.logEvent("user_action", "overlay", "Force full scan requested");
    this.emit("scanRequested", options);
  }

  /** Enable/disable dev assertions */
  setDevAssertionsEnabled(enabled: boolean): void {
    this.devAssertions.setEnabled(enabled);
  }

  /** Check if dev assertions are enabled */
  isDevAssertionsEnabled(): boolean {
    return this.devAssertions.isEnabled();
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /** Add event listener */
  on<K extends keyof OverlayControllerEvents>(
    event: K,
    listener: OverlayControllerEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener as EventListener<keyof OverlayControllerEvents>);
  }

  /** Remove event listener */
  off<K extends keyof OverlayControllerEvents>(
    event: K,
    listener: OverlayControllerEvents[K]
  ): void {
    this.listeners.get(event)?.delete(listener as EventListener<keyof OverlayControllerEvents>);
  }

  /** Emit event */
  private emit<K extends keyof OverlayControllerEvents>(
    event: K,
    ...args: Parameters<OverlayControllerEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        (listener as (...args: unknown[]) => void)(...args);
      }
    }
  }

  // ============================================================================
  // Keyboard Shortcut
  // ============================================================================

  /** Handle keyboard shortcut */
  handleKeyboardShortcut(event: {
    key: string;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  }): boolean {
    const shortcut = this.config.toggleShortcut;
    const parts = shortcut.split("+").map((p) => p.toLowerCase());

    const ctrlRequired = parts.includes("ctrl");
    const shiftRequired = parts.includes("shift");
    const metaRequired = parts.includes("meta") || parts.includes("cmd");
    const key = parts.find((p) => !["ctrl", "shift", "meta", "cmd"].includes(p));

    if (
      event.ctrlKey === ctrlRequired &&
      event.shiftKey === shiftRequired &&
      event.metaKey === metaRequired &&
      event.key.toLowerCase() === key
    ) {
      this.toggle();
      return true;
    }

    return false;
  }
}

/**
 * Create overlay controller instance
 */
export function createOverlayController(
  config?: Partial<OverlayConfig>,
  devAssertionsConfig?: DevAssertionsConfig
): OverlayController {
  return new OverlayController(config, devAssertionsConfig);
}
