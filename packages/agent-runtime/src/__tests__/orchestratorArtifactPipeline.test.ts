/**
 * Orchestrator Artifact Pipeline Tests
 */

import { describe, expect, it } from "vitest";
import type { ArtifactEvents, RuntimeEvent } from "../events";
import { createEventBus } from "../events";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { createTaskGraphStore } from "../tasks/taskGraph";
import { createToolRegistry } from "../tools/mcp/registry";
import type { ArtifactEnvelope } from "../types";

class NoopLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "Done", finishReason: "stop" };
  }
}

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

describe("AgentOrchestrator artifact pipeline", () => {
  it("emits artifact events and records task graph nodes", () => {
    const eventBus = createEventBus();
    const taskGraph = createTaskGraphStore();
    const registry = createToolRegistry({ enforceQualifiedNames: false });

    const orchestrator = createOrchestrator(new NoopLLM(), registry, {
      security: createSecurityPolicy("balanced"),
      eventBus,
      components: { taskGraph },
    });

    const emitted: Array<RuntimeEvent<ArtifactEvents["artifact:emitted"]>> = [];
    eventBus.subscribe("artifact:emitted", (event) => emitted.push(event));

    const result = orchestrator.emitArtifact(createPlanArtifact(), {
      correlationId: "corr-1",
      source: "artifact-test",
    });

    expect(result.stored).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.meta.correlationId).toBe("corr-1");
    expect(emitted[0]?.meta.source).toBe("artifact-test");

    const node = taskGraph.listNodes().find((candidate) => candidate.artifactId === "artifact-1");
    expect(node?.type).toBe("artifact");
    expect(node?.status).toBe("completed");
    expect(
      taskGraph
        .listEvents()
        .some((event) => event.type === "artifact_emitted" && event.correlationId === "corr-1")
    ).toBe(true);
  });
});
