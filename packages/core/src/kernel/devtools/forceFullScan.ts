/**
 * LFCC v0.9 RC - Force Full Scan Implementation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/09_DevTools_Manual.md Section 3
 */

import type { AnnotationScanData, IntegrityScanner } from "../integrity/scanner";
import type { CompareMismatch } from "../integrity/types";
import type { DirtyInfo } from "../mapping/types";
import { generateFullScanReport } from "./compareHarness";
import type { FullScanReport } from "./types";

/** Force full scan options */
export type ForceFullScanOptions = {
  /** Include dirty scan comparison */
  compareDirty: boolean;
  /** Last dirty info for comparison */
  lastDirtyInfo?: DirtyInfo;
  /** Generate JSON report */
  generateJson: boolean;
};

/** Force full scan result */
export type ForceFullScanResult = {
  report: FullScanReport;
  jsonBlob?: string;
};

/**
 * Execute a forced full integrity scan
 * DEV-UX-001: Debug overlay MUST provide "Force Full Integrity Scan"
 */
export async function forceFullScan(
  scanner: IntegrityScanner,
  annotations: AnnotationScanData[],
  blockOrder: string[],
  options: ForceFullScanOptions
): Promise<ForceFullScanResult> {
  const startTime = Date.now();

  // Run full scan
  const fullMismatches = await scanner.fullScan();

  // Optionally run dirty scan for comparison
  let dirtyMismatches: CompareMismatch[] = [];
  if (options.compareDirty && options.lastDirtyInfo) {
    dirtyMismatches = await scanner.dirtyScan(options.lastDirtyInfo);
  }

  // Generate report
  const report = generateFullScanReport(
    startTime,
    blockOrder.length,
    annotations.length,
    dirtyMismatches,
    fullMismatches
  );

  const result: ForceFullScanResult = { report };

  // Generate JSON blob for bug reports
  if (options.generateJson) {
    result.jsonBlob = JSON.stringify(
      {
        report,
        metadata: {
          timestamp: new Date().toISOString(),
          block_count: blockOrder.length,
          annotation_count: annotations.length,
        },
      },
      null,
      2
    );
  }

  return result;
}

/**
 * Format scan report for display
 */
export function formatScanReport(report: FullScanReport): string {
  const lines: string[] = [
    "=== LFCC Full Integrity Scan Report ===",
    `Timestamp: ${new Date(report.timestamp).toISOString()}`,
    `Duration: ${report.duration_ms}ms`,
    `Blocks scanned: ${report.blocks_scanned}`,
    `Annotations scanned: ${report.annotations_scanned}`,
    "",
    "--- Summary ---",
    `Total mismatches: ${report.summary.total_mismatches}`,
    `Missed by dirty scan: ${report.summary.missed_by_dirty}`,
    `Hash mismatches: ${report.summary.hash_mismatches}`,
    `Chain violations: ${report.summary.chain_violations}`,
  ];

  if (report.mismatches.length > 0) {
    lines.push("", "--- Mismatches ---");
    for (const m of report.mismatches) {
      lines.push(`  [${m.kind}] anno=${m.anno_id} span=${m.span_id ?? "N/A"}`);
      lines.push(`    ${m.detail}`);
    }
  }

  if (report.dirty_vs_full_diff.length > 0) {
    lines.push("", "--- Missed by Dirty Scan ---");
    for (const m of report.dirty_vs_full_diff) {
      lines.push(`  [${m.kind}] anno=${m.anno_id} span=${m.span_id ?? "N/A"}`);
    }
  }

  return lines.join("\n");
}

/**
 * Create a bug report template from scan results
 */
export function createBugReportTemplate(
  report: FullScanReport,
  manifest?: unknown,
  dirtyInfo?: DirtyInfo
): string {
  const sections: string[] = [
    "## LFCC Integrity Bug Report",
    "",
    "### Environment",
    "- LFCC Version: 0.9 RC",
    `- Timestamp: ${new Date(report.timestamp).toISOString()}`,
    "",
    "### Scan Results",
    "```",
    formatScanReport(report),
    "```",
  ];

  if (manifest) {
    sections.push("", "### Policy Manifest", "```json", JSON.stringify(manifest, null, 2), "```");
  }

  if (dirtyInfo) {
    sections.push("", "### Last Dirty Info", "```json", JSON.stringify(dirtyInfo, null, 2), "```");
  }

  sections.push("", "### Full Report JSON", "```json", JSON.stringify(report, null, 2), "```");

  return sections.join("\n");
}
