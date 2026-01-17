/**
 * Orchestrator Execution Event Bus Tests
 */

import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../events";
import { createEventBus } from "../events";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { createToolRegistry } from "../tools/mcp/registry";
import type { ExecutionDecision, MCPToolServer, ToolExecutionRecord } from "../types";

function createPingServer(): MCPToolServer {
  return {
    name: "ping",
    description: "Ping tools",
    listTools: () => [
      {
        name: "ping",
        description: "Ping the runtime",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { requiresConfirmation: true, readOnly: false },
      },
    ],
    callTool: async () => ({
      success: true,
      content: [{ type: "text", text: "pong" }],
    }),
  };
}

class OneShotToolLLM implements IAgentLLM {
  private called = false;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    if (this.called) {
      return { content: "done", finishReason: "stop" };
    }

    this.called = true;
    return {
      content: "",
      finishReason: "tool_use",
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

describe("AgentOrchestrator execution event bus", () => {
  it("emits execution decisions and records with correlation metadata", async () => {
    const eventBus = createEventBus();
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createPingServer());

    const llm = new OneShotToolLLM();

    const decisions: Array<RuntimeEvent<ExecutionDecision>> = [];
    const records: Array<RuntimeEvent<ToolExecutionRecord>> = [];
    eventBus.subscribe("execution:decision", (event) => decisions.push(event));
    eventBus.subscribe("execution:record", (event) => records.push(event));

    const orchestrator = createOrchestrator(llm, registry, {
      name: "execution-agent",
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      eventBus,
    });

    await orchestrator.run("Run ping");

    expect(decisions).toHaveLength(1);
    expect(records.map((event) => event.payload.status)).toEqual(["started", "completed"]);
    const correlationId = decisions[0]?.meta.correlationId;
    expect(correlationId).toBeDefined();
    expect(records[0]?.meta.correlationId).toBe(correlationId);
    expect(decisions[0]?.meta.source).toBe("execution-agent");
    expect(records[0]?.meta.source).toBe("execution-agent");
  });
});
