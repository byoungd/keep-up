/**
 * Orchestrator Stream Bridge Integration Tests
 */

import { describe, expect, it } from "vitest";
import { resetGlobalEventBus } from "../events";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import { collectStream, createStreamWriter } from "../streaming";
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

function createPingServer(): MCPToolServer {
  return {
    name: "ping",
    description: "Ping tools",
    listTools: () => [
      {
        name: "ping",
        description: "Ping the runtime",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { requiresConfirmation: false, readOnly: false },
      },
    ],
    callTool: async () => ({
      success: true,
      content: [{ type: "text", text: "pong" }],
    }),
  };
}

describe("AgentOrchestrator stream bridge", () => {
  it("emits progress and metadata chunks for execution events", async () => {
    resetGlobalEventBus();
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createPingServer());

    const writer = createStreamWriter("stream-bridge");
    const orchestrator = createOrchestrator(new OneShotToolLLM(), registry, {
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      components: {
        streamBridge: { stream: writer },
      },
    });

    await orchestrator.run("Run ping");
    writer.close();

    const chunks = await collectStream(writer);
    const progressChunks = chunks.filter((chunk) => chunk.type === "progress");
    const metadataChunks = chunks.filter((chunk) => chunk.type === "metadata");

    expect(progressChunks.length).toBeGreaterThan(0);
    expect(metadataChunks.some((chunk) => chunk.data.key === "execution:record")).toBe(true);
  });
});
