/**
 * Code Agent Orchestrator Factory Tests
 */

import { createArtifactRegistry } from "@ku0/agent-runtime-persistence/artifacts";
import { createCompletionToolServer, createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { createCodeAgentOrchestrator } from "../orchestrator/codeAgentFactory";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { CODER_SOP, createCodeAgentGateChecker, createSOPExecutor } from "../sop";
import type { ArtifactEnvelope, MCPToolServer } from "../types";

function createReadToolServer(): MCPToolServer {
  return {
    name: "file-test",
    description: "File read tools",
    listTools: () => [
      {
        name: "file:read",
        description: "Read a file",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        annotations: { readOnly: true, policyAction: "file.read" },
      },
    ],
    callTool: async () => ({
      success: true,
      content: [{ type: "text", text: "ok" }],
    }),
  };
}

class PlanThenCompleteLLM implements IAgentLLM {
  private called = false;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    if (this.called) {
      return {
        content: "done",
        finishReason: "tool_use",
        toolCalls: [
          {
            id: "call-complete",
            name: "complete_task",
            arguments: { summary: "done" },
          },
        ],
      };
    }

    this.called = true;
    return {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "call-read",
          name: "file:read",
          arguments: { path: "/tmp/plan.txt" },
        },
      ],
    };
  }
}

class NoopLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "", finishReason: "stop" };
  }
}

function createTestReport(status: "passed" | "failed"): ArtifactEnvelope {
  return {
    id: `test-report-${status}-${crypto.randomUUID()}`,
    type: "TestReport",
    schemaVersion: "1.0.0",
    title: "Test Report",
    payload: {
      command: "pnpm test",
      status,
      durationMs: 1200,
    },
    taskNodeId: "task-1",
    createdAt: new Date().toISOString(),
  };
}

function createReviewReport(): ArtifactEnvelope {
  return {
    id: `review-report-${crypto.randomUUID()}`,
    type: "ReviewReport",
    schemaVersion: "1.0.0",
    title: "Review Report",
    payload: {
      summary: "Reviewed changes",
      risks: ["Potential regression in tool gating"],
      recommendations: ["Add regression tests"],
    },
    taskNodeId: "task-1",
    createdAt: new Date().toISOString(),
  };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createCodeAgentOrchestrator", () => {
  it("emits a PlanCard artifact and advances SOP to implement", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: true });
    await registry.register(createCompletionToolServer());
    await registry.register(createReadToolServer());

    const artifactRegistry = createArtifactRegistry();
    const gateChecker = createCodeAgentGateChecker({ artifacts: artifactRegistry });
    const sopExecutor = createSOPExecutor(CODER_SOP, gateChecker);

    const orchestrator = createCodeAgentOrchestrator(new PlanThenCompleteLLM(), registry, {
      name: "code-agent",
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      artifactRegistry,
      sopExecutor,
    });

    await orchestrator.run("Plan and read a file");

    const planArtifacts = artifactRegistry
      .list()
      .filter((artifact) => artifact.type === "PlanCard");
    expect(planArtifacts).toHaveLength(1);
    expect(sopExecutor.getCurrentPhase()).toBe("implement");
  });

  it("advances SOP phases based on TestReport and ReviewReport artifacts", async () => {
    const artifactRegistry = createArtifactRegistry();
    const gateChecker = createCodeAgentGateChecker({ artifacts: artifactRegistry });
    const sopExecutor = createSOPExecutor(CODER_SOP, gateChecker);
    await sopExecutor.advancePhase();
    await sopExecutor.advancePhase();
    expect(sopExecutor.getCurrentPhase()).toBe("implement");

    const registry = createToolRegistry({ enforceQualifiedNames: true });
    const orchestrator = createCodeAgentOrchestrator(new NoopLLM(), registry, {
      name: "code-agent",
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      artifactRegistry,
      sopExecutor,
    });

    orchestrator.emitArtifact(createTestReport("failed"));
    await flushPromises();
    expect(sopExecutor.getCurrentPhase()).toBe("verify");

    orchestrator.emitArtifact(createTestReport("passed"));
    await flushPromises();
    expect(sopExecutor.getCurrentPhase()).toBe("review");

    orchestrator.emitArtifact(createReviewReport());
    await flushPromises();
    expect(sopExecutor.getCurrentPhase()).toBe("complete");
  });
});
