/**
 * BashToolServer Tests
 */

import type { ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it, vi } from "vitest";
import { BashToolServer, type IBashExecutor } from "../tools/core/bash";

function createContext(workingDirectory?: string, maxExecutionTimeMs?: number): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox, workingDirectory },
      permissions: { ...base.permissions, bash: "confirm" },
      limits: {
        ...base.limits,
        maxExecutionTimeMs: maxExecutionTimeMs ?? base.limits.maxExecutionTimeMs,
      },
    },
  };
}

function createExecutor(): IBashExecutor {
  return {
    execute: vi.fn(async () => ({
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
      truncated: false,
      durationMs: 5,
    })),
  };
}

describe("BashToolServer", () => {
  it("blocks unsafe shell operators outside quotes", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext();

    const result = await server.callTool(
      { name: "execute", arguments: { command: "echo safe && touch unsafe.txt" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("allows operators inside quotes", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext();

    const result = await server.callTool(
      { name: "execute", arguments: { command: 'echo "safe && sound"' } },
      context
    );

    expect(result.success).toBe(true);
    expect(executor.execute).toHaveBeenCalled();
  });

  it("blocks command substitution", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext();

    const result = await server.callTool(
      { name: "execute", arguments: { command: "echo $(whoami)" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("rejects working directories outside the sandbox root", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext("/tmp/sandbox");

    const result = await server.callTool(
      { name: "execute", arguments: { command: "echo ok", cwd: "/tmp/other" } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("rejects empty commands", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext();

    const result = await server.callTool(
      { name: "execute", arguments: { command: "   " } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("clamps timeout to max execution time", async () => {
    const executor = createExecutor();
    const server = new BashToolServer(executor);
    const context = createContext(undefined, 5);

    await server.callTool(
      { name: "execute", arguments: { command: "echo ok", timeout: 100 } },
      context
    );

    expect(executor.execute).toHaveBeenCalled();
    const options = (executor.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.timeoutMs).toBe(5);
  });
});
