/**
 * Orchestrator TaskGraph Integration Tests
 */

import { describe, expect, it } from "vitest";
import { createOrchestrator } from "../orchestrator/orchestrator";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { createTaskGraphStore } from "../tasks/taskGraph";
import { createToolRegistry } from "../tools/mcp/registry";
import type { MCPToolServer } from "../types";

class OneShotToolLLM implements IAgentLLM {
  private called = false;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    if (this.called) {
      return { content: "Done", finishReason: "stop" };
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
    await registry.register(createPingServer());

    const graph = createTaskGraphStore();
    const orchestrator = createOrchestrator(new OneShotToolLLM(), registry, {
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      components: { taskGraph: graph },
    });

    await orchestrator.run("Run ping");

    const nodes = graph.listNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("tool_call");
    expect(nodes[0]?.status).toBe("completed");
  });
});
