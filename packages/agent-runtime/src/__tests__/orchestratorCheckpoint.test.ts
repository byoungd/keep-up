/**
 * Orchestrator checkpoint integration tests
 */

import { createEventBus, type RuntimeEvent } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import { createCheckpointManager } from "../checkpoint";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createSecurityPolicy } from "../security";
import type {
  CheckpointEvent,
  MCPTool,
  MCPToolCall,
  MCPToolResult,
  MCPToolServer,
  ToolContext,
} from "../types";

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
          requiresConfirmation: false,
          readOnly: true,
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

function createCompletionServer(): MCPToolServer {
  return {
    name: "completion",
    description: "Completion tools",
    listTools: () => [
      {
        name: "complete_task",
        description: "Finish the current task",
        inputSchema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
        },
        annotations: { policyAction: "connector.action" },
      },
    ],
    callTool: async () => ({
      success: true,
      content: [{ type: "text", text: "done" }],
    }),
  };
}

class SimpleToolRegistry {
  private readonly servers = new Map<string, MCPToolServer>();

  async register(server: MCPToolServer): Promise<void> {
    this.servers.set(server.name, server);
  }

  async unregister(serverName: string): Promise<void> {
    this.servers.delete(serverName);
  }

  listTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.servers.values()) {
      tools.push(...server.listTools());
    }
    return tools;
  }

  async callTool(call: MCPToolCall, context: ToolContext): Promise<MCPToolResult> {
    for (const server of this.servers.values()) {
      if (server.listTools().some((tool) => tool.name === call.name)) {
        return server.callTool(call, context);
      }
    }
    return {
      success: false,
      content: [],
      error: { code: "RESOURCE_NOT_FOUND", message: `Tool ${call.name} not found` },
    };
  }

  getServer(name: string): MCPToolServer | undefined {
    return this.servers.get(name);
  }

  hasTool(name: string): boolean {
    return this.listTools().some((tool) => tool.name === name);
  }

  on(_event: string, _handler: (event: unknown) => void): () => void {
    return () => undefined;
  }
}

class OneShotToolLLM implements IAgentLLM {
  private called = false;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    if (this.called) {
      return {
        content: "done",
        finishReason: "tool_use",
        toolCalls: [{ id: "call-2", name: "complete_task", arguments: { summary: "done" } }],
      };
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

describe("AgentOrchestrator checkpoints", () => {
  it("records turn checkpoints with tool history", async () => {
    const eventBus = createEventBus();
    const registry = new SimpleToolRegistry();
    await registry.register(createCompletionServer());
    await registry.register(createPingServer());

    const checkpointManager = createCheckpointManager();
    const llm = new OneShotToolLLM();

    const checkpointEvents: Array<RuntimeEvent<CheckpointEvent>> = [];
    eventBus.subscribe("checkpoint:created", (event) => checkpointEvents.push(event));
    eventBus.subscribe("checkpoint:updated", (event) => checkpointEvents.push(event));

    const orchestrator = createOrchestrator(llm, registry, {
      name: "checkpoint-agent",
      security: createSecurityPolicy("balanced"),
      requireConfirmation: false,
      eventBus,
      components: { checkpointManager },
    });

    await orchestrator.run("Run ping");

    const summaries = await checkpointManager.list();
    expect(summaries).toHaveLength(1);

    const checkpoint = await checkpointManager.load(summaries[0].id);
    expect(checkpoint?.status).toBe("completed");
    expect(checkpoint?.currentStep).toBe(2);
    expect(
      checkpoint?.messages.some((msg) => msg.role === "user" && msg.content === "Run ping")
    ).toBe(true);
    expect(checkpoint?.completedToolCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining(["ping", "complete_task"])
    );
    expect(checkpoint?.pendingToolCalls).toHaveLength(0);
    expect(checkpoint?.metadata.runId).toBeDefined();

    const updates = checkpointEvents.map((event) => event.payload.update);
    expect(updates).toContain("created");
    expect(updates).toContain("tool_result");
    expect(updates).toContain("status");
  });
});
