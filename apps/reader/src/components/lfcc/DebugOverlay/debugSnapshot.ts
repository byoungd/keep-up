/**
 * LFCC Debug Snapshot Exporter
 *
 * Exports a debug snapshot for diagnostics.
 * Contains NO user PII - only IDs, counts, and short snippets.
 */

import type { SpanChainPolicy } from "@ku0/lfcc-bridge";

// ============================================================================
// Types
// ============================================================================

export interface DebugSnapshotAnnotation {
  id: string;
  shortId: string;
  color?: string;
  storedState: string;
  displayState: string;
  verified: boolean;
  spansCount: number;
  resolvedBlockIds: string[];
}

export interface DebugSnapshotSelection {
  fromTo: { from: number; to: number } | null;
  selectionType: string;
  spanList: Array<{ blockId: string; start: number; end: number }>;
  chainPolicy: SpanChainPolicy | null;
  mappingMode: "strict" | "lenient";
  lastError: { code: string; message: string } | null;
  contextHash: string | null;
}

export interface DebugSnapshotDocument {
  docId: string;
  frontier: string;
  blockCount: number;
  lastTxType: string | null;
  lastTxClassification: string | null;
  lastTxTimestamp: number | null;
  manifestHash: string | null;
  anchorEncodingVersion: string | null;
}

export interface DebugSnapshotFocus {
  focusedAnnotationId: string | null;
  focusSource: "panel_click" | "scroll_to" | "other" | null;
  decorationCount: number;
  orderingKeyPreview: string[];
}

export interface DebugSnapshotDirty {
  touchedBlockIds: string[];
  neighborExpansionK: number;
  reason: string | null;
  spansReResolved: number;
  annotationsReVerified: number;
}

export interface DebugSnapshotPerf {
  dragUpdatesPerSecond: number;
  resolutionCallsPerSecond: number;
  decorationRebuildsPerSecond: number;
  avgResolutionDurationMs: number;
  p95ResolutionDurationMs: number;
}

export interface DebugSnapshot {
  version: "1.0.0";
  exportedAt: string;
  document: DebugSnapshotDocument;
  selection: DebugSnapshotSelection;
  annotations: DebugSnapshotAnnotation[];
  focus: DebugSnapshotFocus;
  dirty: DebugSnapshotDirty;
  perf: DebugSnapshotPerf;
  recentErrors: Array<{ timestamp: number; code: string; message: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

export function shortenId(id: string): string {
  if (id.length <= 8) {
    return id;
  }
  return `${id.slice(0, 4)}...${id.slice(-4)}`;
}

export function truncateMessage(message: string, maxLength = 120): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}...`;
}

// ============================================================================
// Export Utilities
// ============================================================================

export function downloadSnapshot(snapshot: DebugSnapshot): void {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lfcc-debug-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function copySnapshotToClipboard(snapshot: DebugSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot, null, 2);
  return navigator.clipboard.writeText(json);
}

// ============================================================================
// Default Empty Snapshot
// ============================================================================

export function createEmptySnapshot(): DebugSnapshot {
  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    document: {
      docId: "",
      frontier: "",
      blockCount: 0,
      lastTxType: null,
      lastTxClassification: null,
      lastTxTimestamp: null,
      manifestHash: null,
      anchorEncodingVersion: null,
    },
    selection: {
      fromTo: null,
      selectionType: "none",
      spanList: [],
      chainPolicy: null,
      mappingMode: "strict",
      lastError: null,
      contextHash: null,
    },
    annotations: [],
    focus: {
      focusedAnnotationId: null,
      focusSource: null,
      decorationCount: 0,
      orderingKeyPreview: [],
    },
    dirty: {
      touchedBlockIds: [],
      neighborExpansionK: 0,
      reason: null,
      spansReResolved: 0,
      annotationsReVerified: 0,
    },
    perf: {
      dragUpdatesPerSecond: 0,
      resolutionCallsPerSecond: 0,
      decorationRebuildsPerSecond: 0,
      avgResolutionDurationMs: 0,
      p95ResolutionDurationMs: 0,
    },
    recentErrors: [],
  };
}
