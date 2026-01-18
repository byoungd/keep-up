/**
 * Orchestrator Control Plane Tests
 */

import { describe, expect, it } from "vitest";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import { createOrchestrator } from "../orchestrator/orchestrator";
import { createCompletionToolServer } from "../tools/core";
import { createToolRegistry } from "../tools/mcp/registry";
import type { MCPTool, MCPToolCall, MCPToolResult, MCPToolServer, ToolContext } from "../types";

class SequenceLLM implements IAgentLLM {
  private readonly responses: AgentLLMResponse[];
  private index = 0;

  constructor(responses: AgentLLMResponse[]) {
    this.responses = responses;
  }

  async complete(_request: AgentLLMRequest): Promise<AgentLLMResponse> {
    const response = this.responses[Math.min(this.index, this.responses.length - 1)];
    this.index += 1;
    return response;
  }
}

const noopServer: MCPToolServer = {
  name: "dummy",
  description: "dummy",
  listTools: (): MCPTool[] => [
    {
      name: "noop",
      description: "No-op tool",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  async callTool(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    return {
      success: true,
      content: [{ type: "text", text: "ok" }],
    };
  },
};

const toolCallResponse = (): AgentLLMResponse => ({
  content: "Use tool",
  finishReason: "tool_use",
  toolCalls: [{ name: "dummy:noop", arguments: {} }],
});

const stopResponse: AgentLLMResponse = {
  content: "done",
  finishReason: "tool_use",
  toolCalls: [{ name: "completion:complete_task", arguments: { summary: "done" } }],
};

const waitForTurns = (orchestrator: ReturnType<typeof createOrchestrator>, target: number) =>
  new Promise<void>((resolve) => {
    const unsubscribe = orchestrator.on((event) => {
      if (event.type === "turn:end" && orchestrator.getState().turn >= target) {
        unsubscribe();
        resolve();
      }
    });
  });

const waitForEvent = (orchestrator: ReturnType<typeof createOrchestrator>, type: string) =>
  new Promise<void>((resolve) => {
    const unsubscribe = orchestrator.on((event) => {
      if (event.type === type) {
        unsubscribe();
        resolve();
      }
    });
  });

describe("AgentOrchestrator control plane", () => {
  it("rejects multiple tool calls in interactive policy", async () => {
    const registry = createToolRegistry();
    await registry.register(noopServer);
    const llm = new SequenceLLM([
      {
        content: "Use tools",
        finishReason: "tool_use",
        toolCalls: [
          { name: "dummy:noop", arguments: {} },
          { name: "dummy:noop", arguments: {} },
        ],
      },
    ]);

    const orchestrator = createOrchestrator(llm, registry, {
      maxTurns: 1,
      requireConfirmation: false,
      toolExecutionContext: { policy: "interactive" },
    });

    await orchestrator.run("start");

    expect(orchestrator.getState().status).toBe("error");
    expect(orchestrator.getState().error).toContain("Single-Step Constraint Violation");
  });

  it("steps exactly one cycle", async () => {
    const registry = createToolRegistry();
    await registry.register(createCompletionToolServer());
    await registry.register(noopServer);
    const llm = new SequenceLLM([toolCallResponse(), toolCallResponse(), toolCallResponse()]);

    const orchestrator = createOrchestrator(llm, registry, {
      maxTurns: 5,
      requireConfirmation: false,
    });

    orchestrator.sendControlSignal({ type: "PAUSE" });
    const runPromise = orchestrator.run("start");

    const turnPromise = waitForTurns(orchestrator, 1);
    orchestrator.sendControlSignal({ type: "STEP" });

    await turnPromise;
    await waitForEvent(orchestrator, "control:paused");

    const controlState = orchestrator.getControlState();
    expect(orchestrator.getState().turn).toBe(1);
    expect(controlState.paused).toBe(true);

    orchestrator.stop();
    await runPromise;
  });

  it("pauses and resumes without losing state", async () => {
    const registry = createToolRegistry();
    await registry.register(createCompletionToolServer());
    await registry.register(noopServer);
    const llm = new SequenceLLM([toolCallResponse(), toolCallResponse(), stopResponse]);

    const orchestrator = createOrchestrator(llm, registry, {
      maxTurns: 5,
      requireConfirmation: false,
    });

    const pauseAfterFirstTurn = new Promise<void>((resolve) => {
      const unsubscribe = orchestrator.on((event) => {
        if (event.type === "turn:end" && orchestrator.getState().turn === 1) {
          orchestrator.sendControlSignal({ type: "PAUSE" });
          unsubscribe();
          resolve();
        }
      });
    });

    const runPromise = orchestrator.run("start");
    await pauseAfterFirstTurn;

    expect(orchestrator.getControlState().paused).toBe(true);
    const pausedTurn = orchestrator.getState().turn;

    orchestrator.sendControlSignal({ type: "RESUME" });
    await waitForTurns(orchestrator, pausedTurn + 1);

    expect(orchestrator.getState().turn).toBeGreaterThan(pausedTurn);

    await runPromise;
  });
});
