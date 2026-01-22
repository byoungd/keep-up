export type PreflightCheckKind = "lint" | "typecheck" | "test";
export type PreflightCheckStatus = "pass" | "fail" | "skipped";

export interface PreflightCheckDefinition {
  id: string;
  name: string;
  kind: PreflightCheckKind;
  command: string;
  args: string[];
  timeoutMs?: number;
  description?: string;
}

export interface PreflightCheckResult {
  id: string;
  name: string;
  kind: PreflightCheckKind;
  command: string;
  args: string[];
  status: PreflightCheckStatus;
  durationMs: number;
  exitCode?: number;
  output: string;
}

export interface PreflightPlan {
  checks: PreflightCheckDefinition[];
  changedFiles: string[];
  selectionNotes: string[];
}

export interface PreflightReport {
  reportId: string;
  sessionId: string;
  checks: PreflightCheckResult[];
  riskSummary: string;
  createdAt: number;
}
