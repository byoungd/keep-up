/**
 * Artifact Pipeline Tests
 */

import type { ArtifactEvents, RuntimeEvent } from "@ku0/agent-runtime-control";
import { createEventBus } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import type { ArtifactEnvelope } from "../artifacts";
import { createArtifactPipeline, createArtifactRegistry } from "../artifacts";
import { createTaskGraphStore } from "../tasks/taskGraph";

function createPlanArtifact(overrides: Partial<ArtifactEnvelope> = {}): ArtifactEnvelope {
  return {
    id: "artifact-1",
    type: "PlanCard",
    schemaVersion: "1.0.0",
    title: "Plan",
    payload: {
      goal: "Ship artifact pipeline",
      steps: [{ title: "Step one" }],
    },
    taskNodeId: "task-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ArtifactPipeline", () => {
  it("stores and emits valid artifacts", () => {
    const registry = createArtifactRegistry();
    const taskGraph = createTaskGraphStore();
    const eventBus = createEventBus();
    const pipeline = createArtifactPipeline({
      registry,
      taskGraph,
      eventBus,
      eventSource: "artifact-test",
    });

    const emitted: Array<RuntimeEvent<ArtifactEvents["artifact:emitted"]>> = [];
    eventBus.subscribe("artifact:emitted", (event) => emitted.push(event));

    const result = pipeline.emit(createPlanArtifact(), {
      correlationId: "corr-1",
      source: "artifact-test",
    });

    expect(result.stored).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.artifactNodeId).toBeDefined();
    expect(taskGraph.listNodes().some((node) => node.type === "artifact")).toBe(true);
    expect(
      taskGraph
        .listEvents()
        .some((event) => event.type === "artifact_emitted" && event.correlationId === "corr-1")
    ).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.meta.source).toBe("artifact-test");
    expect(emitted[0]?.meta.correlationId).toBe("corr-1");
  });

  it("quarantines invalid artifacts and emits quarantine events", () => {
    const registry = createArtifactRegistry();
    const taskGraph = createTaskGraphStore();
    const eventBus = createEventBus();
    const pipeline = createArtifactPipeline({
      registry,
      taskGraph,
      eventBus,
      eventSource: "artifact-test",
    });

    const emitted: Array<RuntimeEvent<ArtifactEvents["artifact:emitted"]>> = [];
    const quarantined: Array<RuntimeEvent<ArtifactEvents["artifact:quarantined"]>> = [];
    eventBus.subscribe("artifact:emitted", (event) => emitted.push(event));
    eventBus.subscribe("artifact:quarantined", (event) => quarantined.push(event));

    const invalidArtifact = createPlanArtifact({
      id: "artifact-2",
      payload: { goal: "Invalid", steps: [] },
    });
    const result = pipeline.emit(invalidArtifact, {
      correlationId: "corr-2",
      source: "artifact-test",
    });

    expect(result.stored).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.errors?.length ?? 0).toBeGreaterThan(0);
    const node = taskGraph.listNodes().find((candidate) => candidate.artifactId === "artifact-2");
    expect(node?.status).toBe("failed");
    expect(emitted).toHaveLength(1);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.meta.correlationId).toBe("corr-2");
  });
});
