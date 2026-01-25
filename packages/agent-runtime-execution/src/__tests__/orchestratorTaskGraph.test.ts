/**
 * Orchestrator TaskGraph Integration Tests
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createCompletionToolServer, createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { createTaskGraphStore } from "../tasks/taskGraph";
import type { MCPToolServer } from "../types";

class OneShotToolLLM implements IAgentLLM {
  private called = false;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    if (this.called) {
      return {
        content: "Done",
        finishReason: "tool_use",
        toolCalls: [{ name: "complete_task", arguments: { summary: "Done" } }],
      };
    }

    this.called = true;
    return {
      content: "",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call-1",
          name: "ping",
          arguments: {},
        },
      ],
    };
  }
}

function createPingServer(): MCPToolServer {
  return {
    name: "ping",
    description: "Ping tools",
    listTools: () => [
      {
        name: "ping",
        description: "Ping the runtime",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: {
          requiresConfirmation: true,
          readOnly: false,
          policyAction: "connector.read",
        },
      },
    ],
    callTool: async () => ({
      success: true,
      content: [{ type: "text", text: "pong" }],
    }),
  };
}

describe("AgentOrchestrator task graph", () => {
  it("records tool call nodes and completion", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());
    await registry.register(createPingServer());

    const graph = createTaskGraphStore();
    const orchestrator = createOrchestrator(new OneShotToolLLM(), registry, {
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      components: { taskGraph: graph },
    });

    await orchestrator.run("Run ping");

    const nodes = graph.listNodes();
    expect(nodes).toHaveLength(3);
    const planNode = nodes.find((node) => node.type === "plan");
    const toolNodes = nodes.filter((node) => node.type === "tool_call");
    expect(planNode?.status).toBe("completed");
    expect(toolNodes).toHaveLength(2);
    expect(toolNodes.every((node) => node.status === "completed")).toBe(true);
  });

  it("attaches task node ids to confirmation requests", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());
    await registry.register(createPingServer());

    const graph = createTaskGraphStore();
    const orchestrator = createOrchestrator(new OneShotToolLLM(), registry, {
      security: createSecurityPolicy("balanced"),
      components: { taskGraph: graph },
    });

    let requestTaskNodeId: string | undefined;
    orchestrator.setConfirmationHandler(async (request) => {
      requestTaskNodeId = request.taskNodeId;
      return false;
    });

    await orchestrator.run("Run ping with confirmation");

    expect(requestTaskNodeId).toBeDefined();
    const nodes = graph.listNodes();
    const toolNode = nodes.find((node) => node.type === "tool_call");
    expect(toolNode?.status).toBe("failed");
  });

  it("creates plan step nodes when planning is enabled", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());
    await registry.register(createPingServer());

    const graph = createTaskGraphStore();
    const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "taskgraph-plan-"));

    try {
      const orchestrator = createOrchestrator(new OneShotToolLLM(), registry, {
        security: createSecurityPolicy("balanced"),
        requireConfirmation: false,
        components: { taskGraph: graph },
        planning: { enabled: true, persistToFile: true, workingDirectory },
      });

      await orchestrator.run("Run ping with planning");

      const planStepNodes = graph.listNodes().filter((node) => node.type === "subtask");
      expect(planStepNodes).toHaveLength(1);
      expect(planStepNodes[0]?.title).toBe("Step 1: Call ping");
      expect(planStepNodes[0]?.status).toBe("completed");
    } finally {
      await fs.rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
