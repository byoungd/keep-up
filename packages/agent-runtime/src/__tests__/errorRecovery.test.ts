/**
 * Error Recovery Engine Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createErrorRecoveryEngine, type RecoveryStrategy } from "../orchestrator/errorRecovery";
import type { MCPToolCall, MCPToolResult, ToolError } from "../types";

const toolCall: MCPToolCall = {
  name: "tool:test",
  arguments: { value: 1 },
};

const successResult: MCPToolResult = {
  success: true,
  content: [],
};

describe("ErrorRecoveryEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries transient errors and returns recovered result", async () => {
    const strategies: RecoveryStrategy[] = [
      {
        errorPattern: /timeout/i,
        category: "transient",
        maxRetries: 2,
        baseBackoffMs: 10,
        backoffMultiplier: 1,
        maxBackoffMs: 10,
        action: "retry",
        contextMessage: () => "retry",
      },
    ];
    const engine = createErrorRecoveryEngine(strategies);
    const initialError: ToolError = { code: "EXECUTION_FAILED", message: "timeout" };
    const retryError: ToolError = { code: "EXECUTION_FAILED", message: "flaky" };
    const executor = vi
      .fn<Promise<MCPToolResult>, [MCPToolCall]>()
      .mockRejectedValueOnce(retryError)
      .mockResolvedValueOnce(successResult);

    const recoveryPromise = engine.recover(toolCall, initialError, executor);

    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const recovery = await recoveryPromise;

    expect(executor).toHaveBeenCalledTimes(2);
    expect(recovery.recovered).toBe(true);
    expect(recovery.result).toEqual(successResult);
    expect(recovery.attempts).toBe(2);
  });

  it("stops retries when error signatures repeat", async () => {
    const strategies: RecoveryStrategy[] = [
      {
        errorPattern: /timeout/i,
        category: "transient",
        maxRetries: 3,
        baseBackoffMs: 10,
        backoffMultiplier: 1,
        maxBackoffMs: 10,
        action: "retry",
        contextMessage: () => "retry",
      },
    ];
    const engine = createErrorRecoveryEngine(strategies);
    const initialError: ToolError = { code: "EXECUTION_FAILED", message: "timeout" };
    const executor = vi.fn<Promise<MCPToolResult>, [MCPToolCall]>().mockRejectedValue(initialError);

    const recoveryPromise = engine.recover(toolCall, initialError, executor);

    await vi.advanceTimersByTimeAsync(10);

    const recovery = await recoveryPromise;

    expect(executor).toHaveBeenCalledTimes(1);
    expect(recovery.recovered).toBe(false);
    expect(recovery.attempts).toBe(1);
  });

  it("aborts on permanent errors without retry", async () => {
    const engine = createErrorRecoveryEngine();
    const error: ToolError = { code: "INVALID_ARGUMENTS", message: "bad input" };
    const executor = vi.fn();

    const recovery = await engine.recover(toolCall, error, executor);

    expect(executor).not.toHaveBeenCalled();
    expect(recovery.recovered).toBe(false);
    expect(recovery.attempts).toBe(0);
    expect(recovery.error).toEqual(error);
  });

  it("prevents retrying exact failed action twice", async () => {
    const engine = createErrorRecoveryEngine();
    const error: ToolError = { code: "INVALID_ARGUMENTS", message: "bad input" };

    const first = await engine.recover(toolCall, error, vi.fn());
    expect(first.recovered).toBe(false);

    const second = await engine.recover(toolCall, error, vi.fn());

    expect(second.recovered).toBe(false);
    expect(second.error?.code).toBe("DUPLICATE_FAILED_ACTION");
    expect(second.attempts).toBe(0);
  });
});
