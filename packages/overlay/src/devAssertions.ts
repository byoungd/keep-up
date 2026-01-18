/**
 * LFCC v0.9 RC - Dev Assertions Mode
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/04_DevTools_Debug_Overlay.md Section E
 *
 * Background comparison of dirty scan vs full scan.
 * Throws hard errors in dev mode when full scan finds issues missed by dirty scan.
 */

import { observability } from "@ku0/core";
import type { ScanReportSummary } from "./types";

/** Dev assertion result */
export type DevAssertionResult = {
  passed: boolean;
  missedMismatches: number;
  details: string[];
};

/** Dev assertions config */
export type DevAssertionsConfig = {
  /** Enable dev assertions */
  enabled: boolean;
  /** Throw on assertion failure */
  throwOnFailure: boolean;
  /** Log assertions to console */
  logToConsole: boolean;
  /** Callback on assertion failure */
  onFailure?: (result: DevAssertionResult) => void;
};

/** Default dev assertions config */
export const DEFAULT_DEV_ASSERTIONS_CONFIG: DevAssertionsConfig = {
  enabled: false,
  throwOnFailure: true,
  logToConsole: true,
};

const logger = observability.getLogger();

/**
 * Assert that dirty scan covers all issues found by full scan
 */
export function assertDirtyScanCoverage(
  report: ScanReportSummary,
  config: DevAssertionsConfig = DEFAULT_DEV_ASSERTIONS_CONFIG
): DevAssertionResult {
  if (!config.enabled) {
    return { passed: true, missedMismatches: 0, details: [] };
  }

  const missedMismatches = report.missedByDirty;
  const passed = missedMismatches === 0;

  const details: string[] = [];
  if (!passed) {
    details.push(`Dirty scan missed ${missedMismatches} mismatch(es) found by full scan`);
    details.push(`Total mismatches: ${report.totalMismatches}`);
    details.push(`Hash mismatches: ${report.hashMismatches}`);
    details.push(`Chain violations: ${report.chainViolations}`);
  }

  const result: DevAssertionResult = { passed, missedMismatches, details };

  if (!passed) {
    if (config.logToConsole) {
      logger.error("mapping", "LFCC dev assertion failed", undefined, { result });
    }

    if (config.onFailure) {
      config.onFailure(result);
    }

    if (config.throwOnFailure) {
      throw new DevAssertionError(
        `LFCC Dev Assertion Failed: Dirty scan missed ${missedMismatches} mismatch(es)`,
        result
      );
    }
  }

  return result;
}

/**
 * Dev assertion error
 */
export class DevAssertionError extends Error {
  constructor(
    message: string,
    public readonly result: DevAssertionResult
  ) {
    super(message);
    this.name = "DevAssertionError";
  }
}

/**
 * Create a dev assertions runner
 */
export function createDevAssertionsRunner(config: DevAssertionsConfig): {
  runAfterScan: (report: ScanReportSummary) => DevAssertionResult;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
} {
  let currentConfig = { ...config };

  return {
    runAfterScan: (report: ScanReportSummary) => {
      return assertDirtyScanCoverage(report, currentConfig);
    },
    isEnabled: () => currentConfig.enabled,
    setEnabled: (enabled: boolean) => {
      currentConfig = { ...currentConfig, enabled };
    },
  };
}

/**
 * Format assertion result for display
 */
export function formatAssertionResult(result: DevAssertionResult): string {
  if (result.passed) {
    return "✓ Dev assertion passed: Dirty scan coverage is complete";
  }

  const lines = ["✗ Dev assertion FAILED", ...result.details.map((d) => `  ${d}`)];

  return lines.join("\n");
}

/**
 * Check if dev assertions should be enabled based on environment
 */
export function shouldEnableDevAssertions(): boolean {
  // Check for Node.js environment
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV === "development" || process.env.LFCC_DEV_ASSERTIONS === "true";
  }

  // Check for browser environment
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    return url.searchParams.has("lfcc_dev_assertions");
  }

  return false;
}
