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
});
