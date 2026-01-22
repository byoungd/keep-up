/**
 * Streaming execution loop tests.
 */

import { createEventBus } from "@ku0/agent-runtime-control";
import { describe, expect, it } from "vitest";
import type { ToolConfirmationResolver, ToolExecutor } from "../executor";
import type {
  AgentLLMRequest,
  AgentLLMResponse,
  AgentToolDefinition,
  IAgentLLM,
} from "../orchestrator/llmTypes";
import { createSecurityPolicy } from "../security";
import { createTokenStreamWriter, runStreamingLoop, type StreamEvent } from "../streaming";
import type { ConfirmationRequest, MCPToolCall, MCPToolResult, ToolContext } from "../types";

class MockStreamingLLM implements IAgentLLM {
  private callCount = 0;

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    return { content: "", finishReason: "stop" };
  }

  async *stream(_request: AgentLLMRequest) {
    this.callCount += 1;
    if (this.callCount === 1) {
      yield { type: "content", content: "Hello " } as const;
      yield {
        type: "tool_call",
        toolCall: { id: "call-1", name: "test:tool", arguments: {} },
      } as const;
      yield { type: "content", content: "World" } as const;
      return;
    }
    yield { type: "content", content: "Done" } as const;
  }
}

class MockToolExecutor implements ToolExecutor, ToolConfirmationResolver {
  public executed = 0;
  public requiresConfirmationFlag = false;

  requiresConfirmation(_call: MCPToolCall, _context: ToolContext): boolean {
    return this.requiresConfirmationFlag;
  }

  async execute(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    this.executed += 1;
    return {
      success: true,
      content: [
        { type: "text", text: "step-1" },
        { type: "text", text: "step-2" },
      ],
    };
  }
}

const toolDefinitions: AgentToolDefinition[] = [
  { name: "test:tool", description: "test tool", inputSchema: { type: "object" } },
];

function createContext(): ToolContext {
  return { security: createSecurityPolicy("balanced") };
}

describe("runStreamingLoop", () => {
  it("interleaves content and tool results while logging events", async () => {
    const llm = new MockStreamingLLM();
    const toolExecutor = new MockToolExecutor();
    const stream = createTokenStreamWriter();
    const events: StreamEvent[] = [];
    stream.onEvent((event) => {
      events.push(event);
    });

    const eventBus = createEventBus();
    const busEvents: string[] = [];
    eventBus.subscribe("stream:event", (event) => {
      busEvents.push(event.type);
    });

    await runStreamingLoop({
      llm,
      stream,
      toolExecutor,
      toolDefinitions,
      messages: [{ role: "user", content: "Run" }],
      toolContext: createContext(),
      eventBus,
      eventSource: "test",
    });

    const types = events.map((event) => event.type);
    expect(types[0]).toBe("token");
    expect(types).toContain("tool:start");
    expect(types).toContain("tool:progress");
    expect(types).toContain("tool:end");
    expect(types).toContain("done");
    expect(busEvents.length).toBeGreaterThan(0);
    expect(toolExecutor.executed).toBe(1);
  });

  it("honors confirmation handlers for tool calls", async () => {
    const llm = new MockStreamingLLM();
    const toolExecutor = new MockToolExecutor();
    toolExecutor.requiresConfirmationFlag = true;
    const stream = createTokenStreamWriter();
    const events: StreamEvent[] = [];
    stream.onEvent((event) => {
      events.push(event);
    });

    const confirmationHandler = async (_request: ConfirmationRequest) => false;

    await runStreamingLoop({
      llm,
      stream,
      toolExecutor,
      toolDefinitions,
      messages: [{ role: "user", content: "Run" }],
      toolContext: createContext(),
      confirmationHandler,
    });

    const toolEnd = events.find((event) => event.type === "tool:end");
    expect(toolEnd).toBeDefined();
    if (toolEnd?.type === "tool:end") {
      expect(toolEnd.success).toBe(false);
    }
    expect(toolExecutor.executed).toBe(0);
  });
});
