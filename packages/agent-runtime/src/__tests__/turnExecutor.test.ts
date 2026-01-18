/**
 * @file turnExecutor.test.ts
 * @description Tests for the TurnExecutor
 */

import { describe, expect, it, vi } from "vitest";
import type { ContextItem } from "../context";
import { ContextFrameBuilder } from "../context";
import type { AgentLLMResponse, IAgentLLM } from "../orchestrator/orchestrator";
import type { TurnExecutorDependencies } from "../orchestrator/turnExecutor";
import { createTurnExecutor } from "../orchestrator/turnExecutor";
import type { AgentState } from "../types";

describe("TurnExecutor", () => {
  const createMockDeps = (
    overrides: Partial<TurnExecutorDependencies> = {}
  ): TurnExecutorDependencies => ({
    llm: {
      complete: vi.fn().mockResolvedValue({
        content: "Test response",
        finishReason: "stop",
      } satisfies AgentLLMResponse),
    } as unknown as IAgentLLM,
    messageCompressor: {
      compress: vi.fn().mockReturnValue({
        messages: [],
        compressionRatio: 0,
        removedCount: 0,
      }),
    } as TurnExecutorDependencies["messageCompressor"],
    requestCache: {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    } as unknown as TurnExecutorDependencies["requestCache"],
    getToolDefinitions: vi.fn().mockReturnValue([]),
    ...overrides,
  });

  const createMockState = (): AgentState => ({
    turn: 0,
    messages: [{ role: "system", content: "You are a helpful assistant" }],
    pendingToolCalls: [],
    status: "thinking",
    agentId: "agent-test",
  });

  describe("execute", () => {
    it("returns complete outcome when LLM returns stop", async () => {
      const deps = createMockDeps();
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.type).toBe("complete");
      expect(outcome.response?.content).toBe("Test response");
      expect(outcome.assistantMessage?.role).toBe("assistant");
    });

    it("returns tool_use outcome when LLM returns tool calls", async () => {
      const deps = createMockDeps({
        llm: {
          complete: vi.fn().mockResolvedValue({
            content: "Using tools",
            finishReason: "tool_use",
            toolCalls: [{ callId: "1", name: "test_tool", arguments: {} }],
          } satisfies AgentLLMResponse),
        } as unknown as IAgentLLM,
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.type).toBe("tool_use");
      expect(outcome.toolCalls).toHaveLength(1);
      expect(outcome.toolCalls?.[0].name).toBe("test_tool");
    });

    it("returns error outcome when LLM throws", async () => {
      const deps = createMockDeps({
        llm: {
          complete: vi.fn().mockRejectedValue(new Error("LLM failed")),
        } as unknown as IAgentLLM,
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.type).toBe("error");
      expect(outcome.error).toBe("LLM failed");
    });

    it("uses cache when available", async () => {
      const cachedResponse: AgentLLMResponse = {
        content: "Cached response",
        finishReason: "stop",
      };
      const completeFn = vi.fn();
      const deps = createMockDeps({
        llm: { complete: completeFn } as unknown as IAgentLLM,
        requestCache: {
          get: vi.fn().mockReturnValue(cachedResponse),
          set: vi.fn(),
        } as unknown as TurnExecutorDependencies["requestCache"],
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.response?.content).toBe("Cached response");
      expect(outcome.metrics.cacheHit).toBe(true);
      expect(completeFn).not.toHaveBeenCalled();
    });

    it("records compression metrics", async () => {
      const deps = createMockDeps({
        messageCompressor: {
          compress: vi.fn().mockReturnValue({
            messages: [],
            compressionRatio: 0.5,
            removedCount: 3,
          }),
        } as TurnExecutorDependencies["messageCompressor"],
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.metrics.compressionRatio).toBe(0.5);
    });

    it("includes totalTimeMs in metrics", async () => {
      const deps = createMockDeps();
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.metrics.totalTimeMs).toBeGreaterThan(0);
    });

    it("uses custom temperature from config", async () => {
      const completeFn = vi.fn().mockResolvedValue({
        content: "Test",
        finishReason: "stop",
      } satisfies AgentLLMResponse);
      const deps = createMockDeps({
        llm: { complete: completeFn } as unknown as IAgentLLM,
      });
      const executor = createTurnExecutor(deps, { temperature: 0.5 });
      const state = createMockState();

      await executor.execute(state);

      expect(completeFn).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.5 }));
    });

    it("uses default temperature when not specified", async () => {
      const completeFn = vi.fn().mockResolvedValue({
        content: "Test",
        finishReason: "stop",
      } satisfies AgentLLMResponse);
      const deps = createMockDeps({
        llm: { complete: completeFn } as unknown as IAgentLLM,
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      await executor.execute(state);

      expect(completeFn).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });
  });

  describe("knowledge matching", () => {
    it("injects knowledge content into system prompt", async () => {
      const completeFn = vi.fn().mockResolvedValue({
        content: "Test",
        finishReason: "stop",
      } satisfies AgentLLMResponse);
      const deps = createMockDeps({
        llm: { complete: completeFn } as unknown as IAgentLLM,
        knowledgeRegistry: {
          match: vi.fn().mockReturnValue({
            items: [{ content: "Knowledge item" }],
            formattedContent: "## Context\nKnowledge item",
          }),
        } as unknown as TurnExecutorDependencies["knowledgeRegistry"],
      });
      const executor = createTurnExecutor(deps, { agentName: "test-agent" });
      const state: AgentState = {
        ...createMockState(),
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User query" },
        ],
      };

      await executor.execute(state);

      expect(completeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining("## Relevant Knowledge"),
        })
      );
    });
  });

  describe("context frame", () => {
    it("injects context frame content into system prompt", async () => {
      const completeFn = vi.fn().mockResolvedValue({
        content: "Test",
        finishReason: "stop",
      } satisfies AgentLLMResponse);

      const builder = new ContextFrameBuilder({ maxTokens: 100, frameIdFactory: () => "frame-1" });
      const items: ContextItem[] = [
        { id: "short-1", tier: "short_term", content: "Recent context" },
      ];

      const deps = createMockDeps({
        llm: { complete: completeFn } as unknown as IAgentLLM,
        contextFrameBuilder: builder,
        getContextItems: () => items,
      });
      const executor = createTurnExecutor(deps);
      const state: AgentState = {
        ...createMockState(),
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User query" },
        ],
      };

      await executor.execute(state);

      expect(completeFn).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining("## Context Frame"),
        })
      );
    });
  });
});
