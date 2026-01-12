"use client";

import type { Result } from "axe-core";
import * as React from "react";

/**
 * A11y audit interval in milliseconds.
 * Set to 0 to disable periodic audits (only run once on mount).
 * Default: 60000 (60 seconds) - reduced from 5s to prevent performance issues.
 */
const A11Y_AUDIT_INTERVAL = 60000;

/**
 * Enable/disable A11y reporter via localStorage.
 * Set localStorage.setItem('a11y-reporter-enabled', 'true') to enable.
 */
function isA11yReporterEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const stored = localStorage.getItem("a11y-reporter-enabled");
  // Disabled by default, opt-in via localStorage
  return stored === "true";
}

/**
 * Gets console color based on violation impact level.
 */
function getImpactColor(impact?: string | null): string {
  if (impact === "critical") {
    return "red";
  }
  if (impact === "serious") {
    return "orange";
  }
  return "yellow";
}

/**
 * Logs accessibility violations to the console.
 * Uses console.warn since this is a dev-only utility for a11y auditing.
 */
function logViolations(violations: Result[]) {
  for (const v of violations) {
    const color = getImpactColor(v.impact);
    const impact = v.impact?.toUpperCase() ?? "UNKNOWN";
    const nodes = v.nodes.map((n) => String(n.target)).join(", ");

    // Log with color formatting for browsers that support it
    console.warn(
      `%c${impact}%c ${v.help}\n  ${v.description}\n  ${v.helpUrl}\n  Nodes: ${nodes}`,
      `color: ${color}; font-weight: bold`,
      "color: inherit"
    );
  }
}

/**
 * A11y Reporter using axe-core directly.
 *
 * Note: @axe-core/react is incompatible with React 19 due to ES module
 * read-only exports. This component uses axe-core directly to run
 * accessibility audits on the document.
 *
 * Performance: Audits are expensive. Interval increased to 60s (from 5s).
 * Enable via: localStorage.setItem('a11y-reporter-enabled', 'true')
 * Manual audit: window.__runA11yAudit?.()
 */
export function A11yReporter() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      if (!isA11yReporterEnabled()) {
        return;
      }

      let intervalId: ReturnType<typeof setInterval> | null = null;

      const initAxe = async () => {
        const axe = await import("axe-core");

        const runAudit = async () => {
          try {
            const results = await axe.default.run(document.body);
            if (results.violations.length > 0) {
              logViolations(results.violations);
            }
          } catch {
            // Silently ignore errors during audit
          }
        };

        // Expose manual audit function for debugging
        (window as Window & { __runA11yAudit?: () => Promise<void> }).__runA11yAudit = runAudit;

        // Run initial audit after a short delay
        setTimeout(runAudit, 2000);

        // Run periodic audits (0 = disabled)
        if (A11Y_AUDIT_INTERVAL > 0) {
          intervalId = setInterval(runAudit, A11Y_AUDIT_INTERVAL);
        }
      };

      initAxe().catch(() => {
        // Silently ignore initialization errors
      });

      return () => {
        if (intervalId) {
          clearInterval(intervalId);
        }
        // Clean up global function
        (window as Window & { __runA11yAudit?: () => Promise<void> }).__runA11yAudit = undefined;
      };
    }
  }, []);

  return null;
}
