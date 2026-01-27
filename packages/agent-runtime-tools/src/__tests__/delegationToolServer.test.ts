/**
 * DelegationToolServer tests
 */

import type {
  AgentProfile,
  AgentResult,
  AgentType,
  IAgentManager,
  MCPToolResult,
  SpawnAgentOptions,
  ToolContext,
} from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { DelegationToolServer } from "../tools/core/delegation";

function createContext(maxOutputBytes?: number): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions },
      limits: { ...base.limits, maxOutputBytes: maxOutputBytes ?? base.limits.maxOutputBytes },
    },
  };
}

function createProfile(type: AgentType): AgentProfile {
  return {
    type,
    name: `${type}-agent`,
    description: "test",
    allowedTools: [],
    systemPrompt: "test",
    securityPreset: "safe",
    maxTurns: 1,
    requireConfirmation: false,
  };
}

function createManager(
  output: string,
  onSpawn?: (options: SpawnAgentOptions) => void
): IAgentManager {
  return {
    spawn: async (options): Promise<AgentResult> => {
      onSpawn?.(options);
      return {
        agentId: "agent-1",
        type: options.type,
        success: true,
        output,
        turns: 1,
        durationMs: 5,
      };
    },
    spawnParallel: async () => [],
    getAvailableTypes: () => ["code", "research", "plan", "explore", "code-reviewer"],
    getProfile: (type) => createProfile(type),
    stop: async () => undefined,
    getStatus: () => undefined,
  };
}

function getText(result: MCPToolResult): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

describe("DelegationToolServer", () => {
  it("truncates delegated output", async () => {
    const manager = createManager("x".repeat(500));
    const server = new DelegationToolServer(manager);
    const context = createContext(80);

    const result = await server.callTool(
      { name: "delegate", arguments: { role: "coder", task: "Do work" } },
      context
    );

    const text = getText(result);
    expect(result.success).toBe(true);
    expect(text).toContain("Output truncated");
  });

  it("rejects empty task descriptions", async () => {
    const manager = createManager("ok");
    const server = new DelegationToolServer(manager);
    const context = createContext();

    const result = await server.callTool(
      { name: "delegate", arguments: { role: "coder", task: "   " } },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("sanitizes constraints and expected output", async () => {
    let captured: SpawnAgentOptions | undefined;
    const manager = createManager("ok", (options) => {
      captured = options;
    });
    const server = new DelegationToolServer(manager);
    const context = createContext();

    const result = await server.callTool(
      {
        name: "delegate",
        arguments: {
          role: "coder",
          task: "Do work",
          constraints: [" file:read ", " ", "bash:execute "],
          expectedOutput: "  json  ",
        },
      },
      context
    );

    expect(result.success).toBe(true);
    expect(captured?.allowedTools).toEqual(["file:read", "bash:execute"]);
    expect(captured?.task).toContain("Expected output format: json");
  });

  it("truncates list_roles output", async () => {
    const manager = createManager("ok");
    const server = new DelegationToolServer(manager);
    const context = createContext(60);

    const result = await server.callTool({ name: "list_roles", arguments: {} }, context);
    const text = getText(result);

    expect(result.success).toBe(true);
    expect(text).toContain("Output truncated");
  });
});
