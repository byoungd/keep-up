/**
 * Artifact Registry Tests
 */

import { describe, expect, it } from "vitest";
import { type ArtifactEnvelope, createArtifactRegistry } from "../artifacts";

describe("ArtifactRegistry", () => {
  it("stores validated artifacts", () => {
    const registry = createArtifactRegistry();
    const artifact: ArtifactEnvelope = {
      id: "artifact-1",
      type: "PlanCard",
      schemaVersion: "1.0.0",
      title: "Plan",
      payload: {
        goal: "Ship Phase 4",
        steps: [{ title: "Implement registry", status: "completed" }],
      },
      taskNodeId: "node-1",
      createdAt: "2026-01-15T00:00:00.000Z",
    };

    const result = registry.store(artifact);

    expect(result.stored).toBe(true);
    expect(registry.get("artifact-1")).toBeDefined();
  });

  it("quarantines invalid artifacts", () => {
    const registry = createArtifactRegistry();
    const artifact: ArtifactEnvelope = {
      id: "artifact-2",
      type: "DiffCard",
      schemaVersion: "1.0.0",
      title: "Diff",
      payload: { files: [] },
      taskNodeId: "node-2",
      createdAt: "2026-01-15T00:00:00.000Z",
    };

    const result = registry.store(artifact);

    expect(result.stored).toBe(false);
    expect(registry.listQuarantined()).toHaveLength(1);
  });

  it("stores test and review reports", () => {
    const registry = createArtifactRegistry();

    const testReport: ArtifactEnvelope = {
      id: "artifact-test-report",
      type: "TestReport",
      schemaVersion: "1.0.0",
      title: "Unit Tests",
      payload: {
        command: "pnpm vitest packages/agent-runtime",
        status: "passed",
        durationMs: 1200,
      },
      taskNodeId: "node-test",
      createdAt: "2026-01-19T00:00:00.000Z",
    };

    const reviewReport: ArtifactEnvelope = {
      id: "artifact-review-report",
      type: "ReviewReport",
      schemaVersion: "1.0.0",
      title: "Review Report",
      payload: {
        summary: "Reviewed changes, no blocking issues.",
        risks: [],
        recommendations: ["Add coverage for edge case X."],
      },
      taskNodeId: "node-review",
      createdAt: "2026-01-19T00:00:00.000Z",
    };

    const testResult = registry.store(testReport);
    const reviewResult = registry.store(reviewReport);

    expect(testResult.stored).toBe(true);
    expect(reviewResult.stored).toBe(true);
  });
});
