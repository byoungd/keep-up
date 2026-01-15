/**
 * @file turnExecutor.test.ts
 * @description Tests for the TurnExecutor
 */

import { describe, expect, it, vi } from "vitest";
import type { AgentLLMResponse } from "../orchestrator/orchestrator";
import { createTurnExecutor } from "../orchestrator/turnExecutor";
import type { AgentState } from "../types";

describe("TurnExecutor", () => {
  const createMockDeps = (overrides: Partial<Parameters<typeof createTurnExecutor>[0]> = {}) => ({
    llm: {
      complete: vi.fn().mockResolvedValue({
        content: "Test response",
        finishReason: "stop",
      } as AgentLLMResponse),
    },
    messageCompressor: {
      compress: vi.fn().mockReturnValue({
        messages: [],
        compressionRatio: 0,
        removedCount: 0,
      }),
    },
    requestCache: {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    },
    getToolDefinitions: vi.fn().mockReturnValue([]),
    ...overrides,
  });

  const createMockState = (): AgentState => ({
    turn: 0,
    messages: [{ role: "system", content: "You are a helpful assistant" }],
    pendingToolCalls: [],
    status: "thinking",
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
            toolCalls: [{ id: "1", name: "test_tool", arguments: {} }],
          } as AgentLLMResponse),
        },
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
        },
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
      const deps = createMockDeps({
        requestCache: {
          get: vi.fn().mockReturnValue(cachedResponse),
          set: vi.fn(),
        },
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.response?.content).toBe("Cached response");
      expect(outcome.metrics?.cacheHit).toBe(true);
      expect(deps.llm.complete).not.toHaveBeenCalled();
    });

    it("records compression metrics", async () => {
      const deps = createMockDeps({
        messageCompressor: {
          compress: vi.fn().mockReturnValue({
            messages: [],
            compressionRatio: 0.5,
            removedCount: 3,
          }),
        },
      });
      const executor = createTurnExecutor(deps);
      const state = createMockState();

      const outcome = await executor.execute(state);

      expect(outcome.metrics?.compressionRatio).toBe(0.5);
    });
  });
});
