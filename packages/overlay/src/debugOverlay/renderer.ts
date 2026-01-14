/**
 * LFCC v0.9 RC - Debug Overlay Renderer
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 *
 * Pure rendering functions for debug overlay sections
 */

import { STATUS_COLORS } from "@ku0/app";
import type {
  AnnotationsSectionData,
  DebugOverlayState,
  DebugSection,
  DirtySectionData,
  DocumentSectionData,
  FocusSectionData,
  PerfSectionData,
  SelectionSectionData,
} from "./types";

// ============================================================================
// CSS Generation
// ============================================================================

/**
 * Generate debug overlay CSS
 */
export function generateDebugOverlayCss(): string {
  return `
/* LFCC Debug Overlay */
.lfcc-debug-overlay {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 380px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: rgba(20, 20, 25, 0.95);
  border: 1px solid #444;
  border-radius: 8px;
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 11px;
  color: #e0e0e0;
  z-index: 99999;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.lfcc-debug-overlay::-webkit-scrollbar {
  width: 6px;
}

.lfcc-debug-overlay::-webkit-scrollbar-track {
  background: transparent;
}

.lfcc-debug-overlay::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.lfcc-debug-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(30, 30, 40, 0.9);
  border-bottom: 1px solid #444;
  position: sticky;
  top: 0;
  z-index: 1;
}

.lfcc-debug-title {
  font-weight: 600;
  color: #4a9eff;
  font-size: 12px;
}

.lfcc-debug-close {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.lfcc-debug-close:hover {
  color: #fff;
}

.lfcc-debug-section {
  border-bottom: 1px solid #333;
}

.lfcc-debug-section:last-child {
  border-bottom: none;
}

.lfcc-debug-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(40, 40, 50, 0.5);
  cursor: pointer;
  user-select: none;
}

.lfcc-debug-section-header:hover {
  background: rgba(50, 50, 60, 0.6);
}

.lfcc-debug-section-title {
  font-weight: 500;
  color: #aaa;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
}

.lfcc-debug-section-toggle {
  color: #666;
  font-size: 10px;
}

.lfcc-debug-section-content {
  padding: 8px 12px;
}

.lfcc-debug-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}

.lfcc-debug-label {
  color: #888;
}

.lfcc-debug-value {
  color: #e0e0e0;
  text-align: right;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lfcc-debug-value--active { color: ${STATUS_COLORS.active.badge}; }
.lfcc-debug-value--partial { color: ${STATUS_COLORS.active_partial.badge}; }
.lfcc-debug-value--orphan { color: ${STATUS_COLORS.orphan.badge}; }
.lfcc-debug-value--unverified { color: ${STATUS_COLORS.active_unverified.badge}; }
.lfcc-debug-value--error { color: ${STATUS_COLORS.orphan.badge}; }
.lfcc-debug-value--success { color: ${STATUS_COLORS.active.badge}; }

.lfcc-debug-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}

.lfcc-debug-table th {
  text-align: left;
  padding: 4px;
  border-bottom: 1px solid #444;
  color: #888;
  font-weight: 500;
}

.lfcc-debug-table td {
  padding: 4px;
  border-bottom: 1px solid #333;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lfcc-debug-table tr:hover {
  background: rgba(74, 158, 255, 0.1);
  cursor: pointer;
}

.lfcc-debug-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
}

.lfcc-debug-btn {
  padding: 4px 8px;
  background: rgba(74, 158, 255, 0.2);
  border: 1px solid #4a9eff;
  color: #4a9eff;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.lfcc-debug-btn:hover {
  background: rgba(74, 158, 255, 0.3);
}

.lfcc-debug-btn--secondary {
  background: rgba(100, 100, 100, 0.2);
  border-color: #666;
  color: #aaa;
}

.lfcc-debug-btn--secondary:hover {
  background: rgba(100, 100, 100, 0.3);
}

.lfcc-debug-toggle-btn {
  position: fixed;
  bottom: 16px;
  right: 16px;
  padding: 8px 12px;
  background: rgba(74, 158, 255, 0.9);
  border: none;
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  z-index: 99998;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.lfcc-debug-toggle-btn:hover {
  background: rgba(74, 158, 255, 1);
}

/* Decoration outlines mode */
.lfcc-debug-outlines .lfcc-annotation {
  outline: 2px dashed rgba(255, 255, 0, 0.5) !important;
}

.lfcc-debug-outlines .lfcc-annotation--focused {
  outline: 2px dashed rgba(0, 255, 0, 0.8) !important;
}
`;
}

// ============================================================================
// Section Renderers (Return HTML strings)
// ============================================================================

/**
 * Render document section
 */
export function renderDocumentSection(data: DocumentSectionData | null): string {
  if (!data) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No document data</span></div>';
  }

  return `
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Doc ID</span>
      <span class="lfcc-debug-value">${data.docId ?? "—"}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Frontier</span>
      <span class="lfcc-debug-value">${data.currentFrontier.slice(0, 16)}...</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Block Count</span>
      <span class="lfcc-debug-value">${data.blockCount}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Last Tx</span>
      <span class="lfcc-debug-value">${data.lastTxType} / ${data.lastTxClassification}</span>
    </div>
  `;
}

/**
 * Render selection section
 */
export function renderSelectionSection(data: SelectionSectionData | null): string {
  if (!data) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No selection</span></div>';
  }

  const pmSel = data.pmSelection
    ? `${data.pmSelection.from}-${data.pmSelection.to} (${data.pmSelection.type})`
    : "—";

  const spans =
    data.mappedSpans.length > 0
      ? data.mappedSpans.map((s) => `${s.blockId.slice(-6)}:${s.start}-${s.end}`).join(", ")
      : "—";

  const errorHtml = data.lastMappingError
    ? `<div class="lfcc-debug-row">
         <span class="lfcc-debug-label">Error</span>
         <span class="lfcc-debug-value lfcc-debug-value--error">${data.lastMappingError.code}</span>
       </div>`
    : "";

  return `
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">PM Selection</span>
      <span class="lfcc-debug-value">${pmSel}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Mapped Spans</span>
      <span class="lfcc-debug-value">${spans}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Chain Policy</span>
      <span class="lfcc-debug-value">${data.chainPolicy ?? "—"}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Strict</span>
      <span class="lfcc-debug-value">${data.strictMapping ? "Yes" : "No"}</span>
    </div>
    ${errorHtml}
  `;
}

/**
 * Render annotations section
 */
export function renderAnnotationsSection(
  data: AnnotationsSectionData | null,
  maxDisplay = 50
): string {
  if (!data || data.annotations.length === 0) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No annotations</span></div>';
  }

  const displayed = data.annotations.slice(0, maxDisplay);

  const rows = displayed
    .map((anno) => {
      const stateClass = getStateClass(anno.state);
      const blockIds =
        anno.resolvedBlockIds.length > 0
          ? anno.resolvedBlockIds
              .slice(0, 3)
              .map((id) => id.slice(-6))
              .join(", ") + (anno.resolvedBlockIds.length > 3 ? "..." : "")
          : "—";

      return `
      <tr data-anno-id="${anno.id}">
        <td title="${anno.id}">${anno.shortId}</td>
        <td class="${stateClass}">${anno.state}</td>
        <td>${anno.spansCount}/${anno.resolvedSegmentsCount}</td>
        <td>${blockIds}</td>
      </tr>
    `;
    })
    .join("");

  const footer =
    data.totalCount > maxDisplay
      ? `<div style="padding: 4px; color: #888;">... and ${data.totalCount - maxDisplay} more</div>`
      : "";

  return `
    <table class="lfcc-debug-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>State</th>
          <th>Spans</th>
          <th>Blocks</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${footer}
  `;
}

/**
 * Render focus section
 */
export function renderFocusSection(data: FocusSectionData | null): string {
  if (!data) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No focus data</span></div>';
  }

  const keys =
    data.decorationKeyPreview.length > 0 ? data.decorationKeyPreview.slice(0, 5).join(", ") : "—";

  return `
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Focused</span>
      <span class="lfcc-debug-value">${data.focusedAnnotationId ?? "none"}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Source</span>
      <span class="lfcc-debug-value">${data.focusSource ?? "—"}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Decorations</span>
      <span class="lfcc-debug-value">${data.focusOverlayDecorationCount}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Keys</span>
      <span class="lfcc-debug-value">${keys}</span>
    </div>
  `;
}

/**
 * Render dirty section
 */
export function renderDirtySection(data: DirtySectionData | null): string {
  if (!data) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No dirty data</span></div>';
  }

  const blocks =
    data.touchedBlockIds.length > 0
      ? data.touchedBlockIds.map((id) => id.slice(-6)).join(", ")
      : "—";

  return `
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Touched</span>
      <span class="lfcc-debug-value">${blocks}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Expansion K</span>
      <span class="lfcc-debug-value">${data.neighborExpansionK}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Reason</span>
      <span class="lfcc-debug-value">${data.reason}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Re-resolved</span>
      <span class="lfcc-debug-value">${data.spansReResolvedCount} spans / ${data.annotationsReVerifiedCount} annos</span>
    </div>
  `;
}

/**
 * Render perf section
 */
export function renderPerfSection(data: PerfSectionData | null): string {
  if (!data) {
    return '<div class="lfcc-debug-row"><span class="lfcc-debug-label">No perf data</span></div>';
  }

  return `
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Drag updates/s</span>
      <span class="lfcc-debug-value">${data.dragUpdatesPerSecond}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Resolution/s</span>
      <span class="lfcc-debug-value">${data.resolutionCallsPerSecond}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Decorations/s</span>
      <span class="lfcc-debug-value">${data.decorationRebuildsPerSecond}</span>
    </div>
    <div class="lfcc-debug-row">
      <span class="lfcc-debug-label">Avg/p95 resolve</span>
      <span class="lfcc-debug-value">${data.avgResolutionDurationMs}ms / ${data.p95ResolutionDurationMs}ms</span>
    </div>
  `;
}

/**
 * Render actions section
 */
export function renderActionsSection(
  lastScanResult: { ok: boolean; failureCount: number } | null,
  outlinesEnabled: boolean
): string {
  const scanResult = lastScanResult
    ? lastScanResult.ok
      ? '<span class="lfcc-debug-value--success">OK</span>'
      : `<span class="lfcc-debug-value--error">${lastScanResult.failureCount} failures</span>`
    : "";

  return `
    <div class="lfcc-debug-actions">
      <button class="lfcc-debug-btn" data-action="force-scan">
        Force Full Scan
      </button>
      <button class="lfcc-debug-btn lfcc-debug-btn--secondary" data-action="dump-snapshot">
        Dump Snapshot
      </button>
      <button class="lfcc-debug-btn lfcc-debug-btn--secondary" data-action="toggle-outlines">
        ${outlinesEnabled ? "Hide" : "Show"} Outlines
      </button>
    </div>
    ${scanResult ? `<div style="padding: 0 12px 8px;">Last scan: ${scanResult}</div>` : ""}
  `;
}

// ============================================================================
// Full Overlay Renderer
// ============================================================================

/**
 * Render complete debug overlay
 */
export function renderDebugOverlay(state: DebugOverlayState): string {
  if (!state.visible) {
    return `<button class="lfcc-debug-toggle-btn" data-action="toggle">LFCC Debug</button>`;
  }

  const sections: Array<{ id: DebugSection; title: string; content: string }> = [
    { id: "document", title: "Document", content: renderDocumentSection(state.document) },
    { id: "selection", title: "Selection", content: renderSelectionSection(state.selection) },
    {
      id: "annotations",
      title: "Annotations",
      content: renderAnnotationsSection(state.annotations),
    },
    { id: "focus", title: "Focus", content: renderFocusSection(state.focus) },
    { id: "dirty", title: "Dirty/Tx", content: renderDirtySection(state.dirty) },
    { id: "perf", title: "Perf", content: renderPerfSection(state.perf) },
    {
      id: "actions",
      title: "Actions",
      content: renderActionsSection(state.lastScanResult, state.decorationOutlinesEnabled),
    },
  ];

  const sectionsHtml = sections
    .map((section) => {
      const isExpanded = state.expandedSections.has(section.id);
      return `
      <div class="lfcc-debug-section">
        <div class="lfcc-debug-section-header" data-section="${section.id}">
          <span class="lfcc-debug-section-title">${section.title}</span>
          <span class="lfcc-debug-section-toggle">${isExpanded ? "▼" : "▶"}</span>
        </div>
        ${isExpanded ? `<div class="lfcc-debug-section-content">${section.content}</div>` : ""}
      </div>
    `;
    })
    .join("");

  return `
    <div class="lfcc-debug-overlay ${state.decorationOutlinesEnabled ? "lfcc-debug-outlines" : ""}">
      <div class="lfcc-debug-header">
        <span class="lfcc-debug-title">LFCC Debug</span>
        <button class="lfcc-debug-close" data-action="close">×</button>
      </div>
      ${sectionsHtml}
    </div>
  `;
}

// ============================================================================
// Helpers
// ============================================================================

function getStateClass(state: string): string {
  switch (state) {
    case "active":
      return "lfcc-debug-value--active";
    case "active_partial":
      return "lfcc-debug-value--partial";
    case "orphan":
      return "lfcc-debug-value--orphan";
    case "active_unverified":
    case "broken_grace":
      return "lfcc-debug-value--unverified";
    default:
      return "";
  }
}
