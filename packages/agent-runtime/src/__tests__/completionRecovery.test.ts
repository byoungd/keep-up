/**
 * Completion + Recovery Contract Tests
 */

import { describe, expect, it } from "vitest";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createCompletionToolServer } from "../tools/core";
import { createToolRegistry } from "../tools/mcp/registry";
import type { MCPToolServer } from "../types";

class StopLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "done", finishReason: "stop" };
  }
}

class CapturingCompletionLLM implements IAgentLLM {
  lastRequest: AgentLLMRequest | undefined;

  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    this.lastRequest = request;
    return {
      content: "done",
      finishReason: "tool_use",
      toolCalls: [{ name: "complete_task", arguments: { summary: "done" } }],
    };
  }
}

class PingLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return {
      content: "",
      finishReason: "tool_use",
      toolCalls: [{ name: "ping", arguments: {} }],
    };
  }
}

class InvalidCompletionLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        {
          name: "complete_task",
          arguments: { summary: " ", extra: "nope" },
        },
      ],
    };
  }
}

class MixedCompletionLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        { name: "complete_task", arguments: { summary: "done" } },
        { name: "ping", arguments: {} },
      ],
    };
  }
}

class DuplicateCompletionLLM implements IAgentLLM {
  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return {
      content: "",
      finishReason: "tool_use",
      toolCalls: [
        { name: "complete_task", arguments: { summary: "first" } },
        { name: "complete_task", arguments: { summary: "second" } },
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

describe("Completion and recovery contracts", () => {
  it("marks error when model stops without completion tool", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());
    const orchestrator = createOrchestrator(new StopLLM(), registry, {
      maxTurns: 1,
      requireConfirmation: false,
    });

    const state = await orchestrator.run("hello");

    expect(state.status).toBe("error");
    expect(state.error).toContain("Completion tool");
  });

  it("injects recovery warning and restricts tools", async () => {
    const llm = new CapturingCompletionLLM();
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());

    const events: string[] = [];
    const orchestrator = createOrchestrator(llm, registry, {
      maxTurns: 2,
      requireConfirmation: false,
      recovery: { enabled: true, graceTurns: 1, graceTimeoutMs: 1000 },
    });
    orchestrator.on((event) => events.push(event.type));

    const state = await orchestrator.run("hello");

    expect(state.status).toBe("complete");
    expect(events).toContain("recovery");
    expect(llm.lastRequest?.tools).toHaveLength(1);
    expect(llm.lastRequest?.tools[0]?.name).toBe("complete_task");
    const warning = state.messages.find(
      (message) => message.role === "system" && message.content.includes("Final warning")
    );
    expect(warning).toBeDefined();
  });

  it("errors when completion payload fails schema validation", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());

    const orchestrator = createOrchestrator(new InvalidCompletionLLM(), registry, {
      maxTurns: 1,
      requireConfirmation: false,
    });

    const state = await orchestrator.run("hello");

    expect(state.status).toBe("error");
    expect(state.error).toContain("Completion tool execution failed");

    const toolMessage = state.messages.find((message) => message.role === "tool");
    if (!toolMessage || toolMessage.role !== "tool") {
      throw new Error("Expected a tool message for completion validation.");
    }
    expect(toolMessage.result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("errors when recovery turn does not complete", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());
    await registry.register(createPingServer());

    const orchestrator = createOrchestrator(new PingLLM(), registry, {
      maxTurns: 3,
      requireConfirmation: false,
      recovery: { enabled: true, graceTurns: 1, graceTimeoutMs: 1000 },
    });

    const state = await orchestrator.run("ping until limit");

    expect(state.turn).toBe(2);
    expect(state.status).toBe("error");
    expect(state.error).toContain("Recovery failed");
  });

  it("errors when completion is combined with other tool calls", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());

    const orchestrator = createOrchestrator(new MixedCompletionLLM(), registry, {
      maxTurns: 1,
      requireConfirmation: false,
    });

    const state = await orchestrator.run("hello");

    expect(state.status).toBe("error");
    expect(state.error).toContain("Completion tool must be called alone");
  });

  it("errors when completion is called multiple times in one turn", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createCompletionToolServer());

    const orchestrator = createOrchestrator(new DuplicateCompletionLLM(), registry, {
      maxTurns: 1,
      requireConfirmation: false,
    });

    const state = await orchestrator.run("hello");

    expect(state.status).toBe("error");
    expect(state.error).toContain("Completion tool must only be called once");
  });
});
