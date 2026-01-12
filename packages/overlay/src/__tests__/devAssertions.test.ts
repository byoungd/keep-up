/**
 * LFCC v0.9 RC - Dev Assertions Tests
 */

import { describe, expect, it, vi } from "vitest";
import {
  DevAssertionError,
  assertDirtyScanCoverage,
  createDevAssertionsRunner,
  formatAssertionResult,
} from "../devAssertions.js";
import type { ScanReportSummary } from "../types.js";

describe("Dev Assertions", () => {
  describe("assertDirtyScanCoverage", () => {
    it("should pass when no mismatches missed", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 2,
        missedByDirty: 0,
        hashMismatches: 2,
        chainViolations: 0,
      };

      const result = assertDirtyScanCoverage(report, {
        enabled: true,
        throwOnFailure: false,
        logToConsole: false,
      });

      expect(result.passed).toBe(true);
      expect(result.missedMismatches).toBe(0);
    });

    it("should fail when mismatches missed", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 3,
        missedByDirty: 2,
        hashMismatches: 2,
        chainViolations: 1,
      };

      const result = assertDirtyScanCoverage(report, {
        enabled: true,
        throwOnFailure: false,
        logToConsole: false,
      });

      expect(result.passed).toBe(false);
      expect(result.missedMismatches).toBe(2);
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should skip when disabled", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 3,
        missedByDirty: 2,
        hashMismatches: 2,
        chainViolations: 1,
      };

      const result = assertDirtyScanCoverage(report, {
        enabled: false,
        throwOnFailure: true,
        logToConsole: false,
      });

      expect(result.passed).toBe(true);
    });

    it("should throw when configured", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 1,
        missedByDirty: 1,
        hashMismatches: 1,
        chainViolations: 0,
      };

      expect(() => {
        assertDirtyScanCoverage(report, {
          enabled: true,
          throwOnFailure: true,
          logToConsole: false,
        });
      }).toThrow(DevAssertionError);
    });

    it("should call onFailure callback", () => {
      const report: ScanReportSummary = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 1,
        missedByDirty: 1,
        hashMismatches: 1,
        chainViolations: 0,
      };

      const onFailure = vi.fn();

      assertDirtyScanCoverage(report, {
        enabled: true,
        throwOnFailure: false,
        logToConsole: false,
        onFailure,
      });

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
    });
  });

  describe("DevAssertionError", () => {
    it("should include result in error", () => {
      const result = { passed: false, missedMismatches: 2, details: ["test"] };
      const error = new DevAssertionError("Test error", result);

      expect(error.name).toBe("DevAssertionError");
      expect(error.result).toBe(result);
      expect(error.message).toBe("Test error");
    });
  });

  describe("createDevAssertionsRunner", () => {
    it("should create runner with config", () => {
      const runner = createDevAssertionsRunner({
        enabled: true,
        throwOnFailure: false,
        logToConsole: false,
      });

      expect(runner.isEnabled()).toBe(true);
    });

    it("should allow enabling/disabling", () => {
      const runner = createDevAssertionsRunner({
        enabled: false,
        throwOnFailure: false,
        logToConsole: false,
      });

      expect(runner.isEnabled()).toBe(false);
      runner.setEnabled(true);
      expect(runner.isEnabled()).toBe(true);
    });

    it("should run assertions after scan", () => {
      const runner = createDevAssertionsRunner({
        enabled: true,
        throwOnFailure: false,
        logToConsole: false,
      });

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

      const result = runner.runAfterScan(report);
      expect(result.passed).toBe(true);
    });
  });

  describe("formatAssertionResult", () => {
    it("should format passed result", () => {
      const result = { passed: true, missedMismatches: 0, details: [] };
      const formatted = formatAssertionResult(result);

      expect(formatted).toContain("✓");
      expect(formatted).toContain("passed");
    });

    it("should format failed result", () => {
      const result = {
        passed: false,
        missedMismatches: 2,
        details: ["Dirty scan missed 2 mismatch(es)"],
      };
      const formatted = formatAssertionResult(result);

      expect(formatted).toContain("✗");
      expect(formatted).toContain("FAILED");
      expect(formatted).toContain("Dirty scan missed");
    });
  });
});
