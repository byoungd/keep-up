import type {
  PreflightCheckDefinition,
  PreflightCheckResult,
  PreflightPlan,
  PreflightReport,
} from "./types";

export interface PreflightRunInput {
  sessionId: string;
  plan: PreflightPlan;
  runCheck: (check: PreflightCheckDefinition) => Promise<PreflightCheckResult>;
  reportId?: string;
  now?: () => number;
}

export async function runPreflightPlan(input: PreflightRunInput): Promise<PreflightReport> {
  const now = input.now ?? Date.now;
  const reportId = input.reportId ?? crypto.randomUUID();
  const start = now();
  const checks: PreflightCheckResult[] = [];

  for (const check of input.plan.checks) {
    checks.push(await input.runCheck(check));
  }

  return {
    reportId,
    sessionId: input.sessionId,
    checks,
    riskSummary: summarizePreflightResults(checks),
    createdAt: start,
  };
}

export function summarizePreflightResults(checks: PreflightCheckResult[]): string {
  if (checks.length === 0) {
    return "No preflight checks were selected.";
  }
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const check of checks) {
    if (check.status === "pass") {
      passed += 1;
    } else if (check.status === "fail") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }

  const parts = [`${passed} passed`, `${failed} failed`];
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }
  return parts.join(", ");
}
