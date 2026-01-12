/**
 * LFCC v0.9 RC - Integrity Panel & Force Full Scan
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md Section D
 *
 * Provides force full scan integration and report rendering.
 */

import type { OverlayCssTokens, ScanReportSummary } from "./types";
import { DEFAULT_CSS_TOKENS } from "./types";

/** Mismatch display data */
export type MismatchDisplayData = {
  kind: string;
  annoId: string;
  spanId: string | null;
  detail: string;
  severity: "error" | "warning";
};

/** Integrity panel render data */
export type IntegrityPanelData = {
  lastReport: ScanReportSummary | null;
  mismatches: MismatchDisplayData[];
  isScanning: boolean;
  canExport: boolean;
};

/** Force scan options for UI */
export type ForceScanUIOptions = {
  compareDirty: boolean;
  generateJson: boolean;
  highlightMismatches: boolean;
};

/** Default force scan options */
export const DEFAULT_FORCE_SCAN_OPTIONS: ForceScanUIOptions = {
  compareDirty: true,
  generateJson: true,
  highlightMismatches: true,
};

/**
 * Render integrity panel data
 */
export function renderIntegrityPanel(
  lastReport: ScanReportSummary | null,
  mismatches: Array<{ kind: string; anno_id: string; span_id?: string; detail: string }>,
  isScanning: boolean
): IntegrityPanelData {
  const displayMismatches: MismatchDisplayData[] = mismatches.map((m) => ({
    kind: m.kind,
    annoId: m.anno_id,
    spanId: m.span_id ?? null,
    detail: m.detail,
    severity: m.kind === "chain_violation" ? "error" : "warning",
  }));

  return {
    lastReport,
    mismatches: displayMismatches,
    isScanning,
    canExport: lastReport !== null,
  };
}

/**
 * Format scan report for display
 */
export function formatScanReportDisplay(report: ScanReportSummary): string[] {
  const lines: string[] = [
    `Scan completed at ${new Date(report.timestamp).toLocaleTimeString()}`,
    `Duration: ${report.durationMs}ms`,
    `Blocks: ${report.blocksScanned} | Annotations: ${report.annotationsScanned}`,
    "",
    "Results:",
    `  Total mismatches: ${report.totalMismatches}`,
    `  Hash mismatches: ${report.hashMismatches}`,
    `  Chain violations: ${report.chainViolations}`,
    `  Missed by dirty scan: ${report.missedByDirty}`,
  ];

  return lines;
}

/**
 * Get status indicator for scan report
 */
export function getScanStatusIndicator(report: ScanReportSummary): {
  status: "success" | "warning" | "error";
  message: string;
} {
  if (report.totalMismatches === 0) {
    return { status: "success", message: "No integrity issues found" };
  }

  if (report.chainViolations > 0) {
    return { status: "error", message: `${report.chainViolations} chain violation(s) detected` };
  }

  return { status: "warning", message: `${report.totalMismatches} mismatch(es) found` };
}

/**
 * Format mismatch for display
 */
export function formatMismatchDisplay(mismatch: MismatchDisplayData): string {
  const spanPart = mismatch.spanId ? ` span=${mismatch.spanId.slice(0, 8)}...` : "";
  return `[${mismatch.kind}] anno=${mismatch.annoId.slice(0, 8)}...${spanPart}`;
}

/**
 * Generate JSON export from scan report
 */
export function generateScanExportJson(
  report: ScanReportSummary,
  mismatches: MismatchDisplayData[],
  metadata?: Record<string, unknown>
): string {
  const exportData = {
    report,
    mismatches,
    metadata: {
      exportedAt: new Date().toISOString(),
      lfccVersion: "0.9 RC",
      ...metadata,
    },
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Copy text to clipboard (browser only)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Generate CSS for integrity panel
 */
export function generateIntegrityPanelCss(tokens: OverlayCssTokens = DEFAULT_CSS_TOKENS): string {
  return `
.lfcc-integrity-panel {
  padding: 12px;
}

.lfcc-scan-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: #2196f3;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.lfcc-scan-button:hover {
  background: #1976d2;
}

.lfcc-scan-button:disabled {
  background: #666;
  cursor: not-allowed;
}

.lfcc-scan-button--scanning {
  background: #ff9800;
}

.lfcc-scan-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.lfcc-scan-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${tokens.textColor};
}

.lfcc-scan-option input {
  margin: 0;
}

.lfcc-report-section {
  margin-top: 16px;
  padding: 12px;
  background: ${tokens.panelBg};
  border: 1px solid ${tokens.borderColor};
  border-radius: 4px;
}

.lfcc-report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.lfcc-report-title {
  font-size: 14px;
  font-weight: 500;
  color: ${tokens.textColor};
}

.lfcc-status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.lfcc-status-badge--success {
  background: ${tokens.successColor};
  color: #fff;
}

.lfcc-status-badge--warning {
  background: ${tokens.warningColor};
  color: #000;
}

.lfcc-status-badge--error {
  background: ${tokens.errorColor};
  color: #fff;
}

.lfcc-report-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.lfcc-stat-item {
  display: flex;
  flex-direction: column;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.lfcc-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: ${tokens.textColor};
}

.lfcc-stat-label {
  font-size: 10px;
  color: ${tokens.textColor};
  opacity: 0.6;
}

.lfcc-mismatch-list {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.lfcc-mismatch-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  margin-bottom: 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 11px;
}

.lfcc-mismatch-item--error {
  border-left: 3px solid ${tokens.errorColor};
}

.lfcc-mismatch-item--warning {
  border-left: 3px solid ${tokens.warningColor};
}

.lfcc-mismatch-kind {
  font-weight: 500;
  flex-shrink: 0;
}

.lfcc-mismatch-detail {
  color: ${tokens.textColor};
  opacity: 0.8;
  word-break: break-word;
}

.lfcc-export-button {
  margin-top: 12px;
  padding: 8px 16px;
  background: transparent;
  color: ${tokens.textColor};
  border: 1px solid ${tokens.borderColor};
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.lfcc-export-button:hover {
  background: rgba(255, 255, 255, 0.1);
}
`.trim();
}
