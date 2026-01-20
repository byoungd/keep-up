/**
 * BashToolServer Tests
 */

import type { ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it, vi } from "vitest";
import { BashToolServer, type IBashExecutor } from "../tools/core/bash";

function createContext(): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions, bash: "confirm" },
      limits: { ...base.limits },
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
});
