/**
 * LFCC v0.9 RC - Integrity Panel Tests
 */

import { describe, expect, it } from "vitest";
import {
  formatMismatchDisplay,
  formatScanReportDisplay,
  generateIntegrityPanelCss,
  generateScanExportJson,
  getScanStatusIndicator,
  renderIntegrityPanel,
} from "../integrityPanel.js";
import type { ScanReportSummary } from "../types.js";

describe("Integrity Panel", () => {
  describe("renderIntegrityPanel", () => {
    it("should render panel data", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 2,
        missedByDirty: 1,
        hashMismatches: 1,
        chainViolations: 1,
      };

      const mismatches = [
        { kind: "hash_mismatch", anno_id: "a1", span_id: "s1", detail: "Hash differs" },
        { kind: "chain_violation", anno_id: "a2", detail: "Chain broken" },
      ];

      const result = renderIntegrityPanel(report, mismatches, false);

      expect(result.lastReport).toBe(report);
      expect(result.mismatches.length).toBe(2);
      expect(result.isScanning).toBe(false);
      expect(result.canExport).toBe(true);
    });

    it("should set severity based on kind", () => {
      const mismatches = [
        { kind: "hash_mismatch", anno_id: "a1", detail: "test" },
        { kind: "chain_violation", anno_id: "a2", detail: "test" },
      ];

      const result = renderIntegrityPanel(null, mismatches, false);

      expect(result.mismatches[0].severity).toBe("warning");
      expect(result.mismatches[1].severity).toBe("error");
    });

    it("should handle null report", () => {
      const result = renderIntegrityPanel(null, [], false);
      expect(result.lastReport).toBeNull();
      expect(result.canExport).toBe(false);
    });
  });

  describe("formatScanReportDisplay", () => {
    it("should format report for display", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 150,
        blocksScanned: 20,
        annotationsScanned: 10,
        totalMismatches: 3,
        missedByDirty: 1,
        hashMismatches: 2,
        chainViolations: 1,
      };

      const lines = formatScanReportDisplay(report);

      expect(lines.some((l) => l.includes("150ms"))).toBe(true);
      expect(lines.some((l) => l.includes("20"))).toBe(true);
      expect(lines.some((l) => l.includes("Total mismatches: 3"))).toBe(true);
    });
  });

  describe("getScanStatusIndicator", () => {
    it("should return success for no mismatches", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 0,
        missedByDirty: 0,
        hashMismatches: 0,
        chainViolations: 0,
      };

      const status = getScanStatusIndicator(report);
      expect(status.status).toBe("success");
    });

    it("should return error for chain violations", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 1,
        missedByDirty: 0,
        hashMismatches: 0,
        chainViolations: 1,
      };

      const status = getScanStatusIndicator(report);
      expect(status.status).toBe("error");
    });

    it("should return warning for other mismatches", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 1,
        missedByDirty: 0,
        hashMismatches: 1,
        chainViolations: 0,
      };

      const status = getScanStatusIndicator(report);
      expect(status.status).toBe("warning");
    });
  });

  describe("formatMismatchDisplay", () => {
    it("should format mismatch with span", () => {
      const mismatch = {
        kind: "hash_mismatch",
        annoId: "anno-12345678",
        spanId: "span-87654321",
        detail: "test",
        severity: "warning" as const,
      };

      const formatted = formatMismatchDisplay(mismatch);
      expect(formatted).toContain("hash_mismatch");
      expect(formatted).toContain("anno=anno-12");
      expect(formatted).toContain("span=span-876");
    });

    it("should format mismatch without span", () => {
      const mismatch = {
        kind: "chain_violation",
        annoId: "anno-12345678",
        spanId: null,
        detail: "test",
        severity: "error" as const,
      };

      const formatted = formatMismatchDisplay(mismatch);
      expect(formatted).toContain("chain_violation");
      expect(formatted).not.toContain("span=");
    });
  });

  describe("generateScanExportJson", () => {
    it("should generate valid JSON", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 0,
        missedByDirty: 0,
        hashMismatches: 0,
        chainViolations: 0,
      };

      const json = generateScanExportJson(report, [], { docId: "test-doc" });
      const parsed = JSON.parse(json);

      expect(parsed.report).toEqual(report);
      expect(parsed.metadata.lfccVersion).toBe("0.9 RC");
      expect(parsed.metadata.docId).toBe("test-doc");
    });
  });

  describe("generateIntegrityPanelCss", () => {
    it("should generate valid CSS", () => {
      const css = generateIntegrityPanelCss();
      expect(css).toContain(".lfcc-integrity-panel");
      expect(css).toContain(".lfcc-scan-button");
      expect(css).toContain(".lfcc-report-section");
      expect(css).toContain(".lfcc-mismatch-list");
    });
  });
});
