/**
 * Code Agent Gate Checker Tests
 */

import { describe, expect, it } from "vitest";
import { type ArtifactEnvelope, createArtifactRegistry } from "../artifacts";
import { createCodeAgentGateChecker, type QualityGate } from "../sop";

function createTestReport(status: "passed" | "failed"): ArtifactEnvelope {
  return {
    id: `artifact-test-${status}`,
    type: "TestReport",
    schemaVersion: "1.0.0",
    title: `Tests ${status}`,
    payload: {
      command: "pnpm vitest packages/agent-runtime",
      status,
      durationMs: 200,
    },
    taskNodeId: "node-test",
    createdAt: "2026-01-19T00:00:00.000Z",
  };
}

function createReviewReport(): ArtifactEnvelope {
  return {
    id: "artifact-review",
    type: "ReviewReport",
    schemaVersion: "1.0.0",
    title: "Review Report",
    payload: {
      summary: "Reviewed changes and documented risks.",
      risks: [],
    },
    taskNodeId: "node-review",
    createdAt: "2026-01-19T00:00:00.000Z",
  };
}

describe("createCodeAgentGateChecker", () => {
  it("fails tests_exist when no TestReport exists", async () => {
    const registry = createArtifactRegistry();
    const checker = createCodeAgentGateChecker({ artifacts: registry });
    const gate: QualityGate = { after: "implement", check: "tests_exist" };

    const result = await checker(gate);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain("TestReport");
  });

  it("passes tests_exist when TestReport exists", async () => {
    const registry = createArtifactRegistry();
    registry.store(createTestReport("failed"));
    const checker = createCodeAgentGateChecker({ artifacts: registry });

    const result = await checker({ after: "implement", check: "tests_exist" });

    expect(result.passed).toBe(true);
  });

  it("fails tests_pass without a passing TestReport", async () => {
    const registry = createArtifactRegistry();
    registry.store(createTestReport("failed"));
    const checker = createCodeAgentGateChecker({ artifacts: registry });

    const result = await checker({ after: "verify", check: "tests_pass" });

    expect(result.passed).toBe(false);
    expect(result.reason).toContain("passing");
  });

  it("passes tests_pass with a passing TestReport", async () => {
    const registry = createArtifactRegistry();
    registry.store(createTestReport("failed"));
    registry.store(createTestReport("passed"));
    const checker = createCodeAgentGateChecker({ artifacts: registry });

    const result = await checker({ after: "verify", check: "tests_pass" });

    expect(result.passed).toBe(true);
  });

  it("passes risk_reported when ReviewReport exists", async () => {
    const registry = createArtifactRegistry();
    registry.store(createReviewReport());
    const checker = createCodeAgentGateChecker({ artifacts: registry });

    const result = await checker({ after: "review", check: "risk_reported" });

    expect(result.passed).toBe(true);
  });
});
