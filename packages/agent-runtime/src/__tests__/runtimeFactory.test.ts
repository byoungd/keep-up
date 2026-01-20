/**
 * Runtime Composition Root Tests
 */

import { createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createRuntime } from "../runtime";
import { createSecurityPolicy } from "../security";
import type { MCPToolServer } from "../types";

class NoopLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "", finishReason: "stop" };
  }
}

function createPingServer(): MCPToolServer {
  return {
    name: "ping",
    description: "Ping tools",
    listTools: () => [
      {
        name: "echo",
        description: "Echo message",
        inputSchema: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
        },
        annotations: {
          requiresConfirmation: false,
          readOnly: true,
          policyAction: "connector.read",
        },
      },
    ],
    callTool: async (call, _context) => ({
      success: true,
      content: [{ type: "text", text: String(call.arguments.message ?? "") }],
    }),
  };
}

describe("createRuntime", () => {
  it("registers tool servers and defaults to balanced security", async () => {
    const runtime = await createRuntime({
      components: {
        llm: new NoopLLM(),
        toolServers: [createPingServer()],
      },
    });

    expect(runtime.registry.hasTool("ping:echo")).toBe(true);
    expect(runtime.permissionChecker.getPolicy()).toEqual(createSecurityPolicy("balanced"));
  });

  it("uses a provided registry without tool servers", async () => {
    const registry = createToolRegistry();

    const runtime = await createRuntime({
      components: {
        llm: new NoopLLM(),
        registry,
      },
    });

    expect(runtime.registry).toBe(registry);
  });

  it("requires tool servers when no registry is supplied", async () => {
    await expect(
      createRuntime({
        components: {
          llm: new NoopLLM(),
        },
      })
    ).rejects.toThrow("createRuntime requires toolServers when registry is not provided");
  });
});
