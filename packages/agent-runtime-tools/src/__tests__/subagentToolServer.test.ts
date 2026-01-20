/**
 * SubagentToolServer tests
 */

import type {
  AgentProfile,
  AgentResult,
  AgentType,
  IAgentManager,
  MCPToolResult,
  ToolContext,
} from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { SubagentToolServer } from "../tools/core/subagent";

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

function createManager(output: string): IAgentManager {
  return {
    spawn: async (options): Promise<AgentResult> => ({
      agentId: "agent-1",
      type: options.type,
      success: true,
      output,
      turns: 1,
      durationMs: 5,
    }),
    spawnParallel: async (options) =>
      options.map((opt, index) => ({
        agentId: `agent-${index + 1}`,
        type: opt.type,
        success: true,
        output,
        turns: 1,
        durationMs: 5,
      })),
    getAvailableTypes: () => ["code", "research"],
    getProfile: (type) => createProfile(type),
    stop: async () => undefined,
    getStatus: () => undefined,
  };
}

function getText(result: MCPToolResult): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

describe("SubagentToolServer", () => {
  it("truncates spawn output", async () => {
    const manager = createManager("x".repeat(500));
    const server = new SubagentToolServer(manager);
    const context = createContext(80);

    const result = await server.callTool(
      { name: "spawn", arguments: { type: "code", task: "Do work" } },
      context
    );

    const text = getText(result);
    expect(result.success).toBe(true);
    expect(text).toContain("Output truncated");
  });

  it("truncates types output", async () => {
    const manager = createManager("ok");
    const server = new SubagentToolServer(manager);
    const context = createContext(20);

    const result = await server.callTool({ name: "types", arguments: {} }, context);
    const text = getText(result);

    expect(result.success).toBe(true);
    expect(text).toContain("Output truncated");
  });
});
