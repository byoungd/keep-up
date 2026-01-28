/**
 * AgentOrchestrator Context Compaction Tests
 */

import { createCompletionToolServer, createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it, vi } from "vitest";
import { createContextCompactor } from "../../context";
import { InMemorySessionState } from "../../session";
import type { AgentMessage } from "../../types";
import type { AgentLLMRequest, AgentLLMResponse, IAgentLLM } from "../orchestrator";
import { createOrchestrator } from "../orchestrator";

class SummaryThenCompleteLLM implements IAgentLLM {
  async complete(request: AgentLLMRequest): Promise<AgentLLMResponse> {
    const lastUserMessage = [...request.messages].reverse().find((message) => {
      return message.role === "user";
    });
    if (lastUserMessage?.content.includes("CONVERSATION TO SUMMARIZE")) {
      return {
        content: "- Summary of conversation",
        finishReason: "stop",
      };
    }

    return {
      content: "Done.",
      finishReason: "tool_use",
      toolCalls: [
        {
          id: "call-1",
          name: "completion:complete_task",
          arguments: { summary: "done" },
        },
      ],
    };
  }
}

describe("AgentOrchestrator context compaction", () => {
  it("triggers compaction when threshold is exceeded", async () => {
    const registry = createToolRegistry();
    await registry.register(createCompletionToolServer());

    const initialMessages: AgentMessage[] = [
      { role: "system", content: "System prompt" },
      ...Array.from({ length: 6 }).flatMap((_, index) => [
        {
          role: "user",
          content: `User message ${index}: ${"detail ".repeat(40)}`,
        },
        {
          role: "assistant",
          content: `Assistant reply ${index}: ${"response ".repeat(40)}`,
        },
      ]),
    ];

    const sessionState = new InMemorySessionState({
      initialState: {
        turn: 0,
        messages: initialMessages,
        pendingToolCalls: [],
        status: "idle",
      },
    });

    const compactor = createContextCompactor({
      contextConfig: {
        maxTokens: 200,
        compressionThreshold: 0.2,
        preserveLastN: 1,
        compressionStrategy: "hybrid",
      },
    });
    const checkSpy = vi.spyOn(compactor, "checkThreshold");

    const orchestrator = createOrchestrator(new SummaryThenCompleteLLM(), registry, {
      requireConfirmation: false,
      components: { sessionState, contextCompactor: compactor },
    });

    const state = await orchestrator.run("Trigger compaction");

    expect(checkSpy).toHaveBeenCalled();
    expect(
      state.messages.some(
        (message) =>
          message.role === "system" && message.content.startsWith("[Conversation Summary]")
      )
    ).toBe(true);
    expect(state.messages.length).toBeLessThan(initialMessages.length);
  });
});
