/**
 * Code Agent Gate Checker
 *
 * Provides artifact-backed gate checks for SOP quality gates.
 */

import type { ArtifactEnvelope, ArtifactType } from "../types";
import type { GateChecker, GateCheckResult } from "./types";

export interface ArtifactLookup {
  list(): ArtifactEnvelope[];
}

export interface CodeAgentGateCheckerOptions {
  artifacts: ArtifactLookup;
}

export function createCodeAgentGateChecker(options: CodeAgentGateCheckerOptions): GateChecker {
  return async (gate) => {
    const artifacts = options.artifacts.list();
    switch (gate.check) {
      case "tests_exist":
        return buildResult(
          hasArtifactType(artifacts, "TestReport"),
          "No TestReport artifacts found."
        );
      case "tests_pass":
        return buildResult(
          hasPassingTestReport(artifacts),
          "No passing TestReport artifacts found."
        );
      case "risk_reported":
        return buildResult(
          hasArtifactType(artifacts, "ReviewReport"),
          "No ReviewReport artifacts found."
        );
      default:
        return { passed: true };
    }
  };
}

function buildResult(passed: boolean, reason: string): GateCheckResult {
  return passed ? { passed: true } : { passed: false, reason };
}

function hasArtifactType(artifacts: ArtifactEnvelope[], type: ArtifactType): boolean {
  return artifacts.some((artifact) => artifact.type === type);
}

function hasPassingTestReport(artifacts: ArtifactEnvelope[]): boolean {
  for (const artifact of artifacts) {
    if (artifact.type !== "TestReport") {
      continue;
    }
    const status = artifact.payload.status;
    if (typeof status === "string" && status === "passed") {
      return true;
    }
  }
  return false;
}
