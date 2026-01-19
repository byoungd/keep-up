/**
 * Mode Tool Policy Tests
 */

import { describe, expect, it } from "vitest";
import { AgentModeManager } from "../modes/AgentModeManager";
import { createModePolicyEngine } from "../modes/modePolicy";
import { createSecurityPolicy, type ToolPolicyEngine } from "../security";
import type { MCPTool, MCPToolCall, ToolContext } from "../types";

const basePolicy: ToolPolicyEngine = {
  evaluate: () => ({ allowed: true, requiresConfirmation: false }),
};

function createToolContext(): ToolContext {
  return { security: createSecurityPolicy("balanced") };
}

function buildContext(tool: MCPTool, call: MCPToolCall) {
  return {
    call,
    tool: "file",
    operation: "execute",
    toolDefinition: tool,
    context: createToolContext(),
  };
}

describe("ModeToolPolicyEngine", () => {
  it("allows plan tools in plan mode even when not read-only", () => {
    const modeManager = new AgentModeManager("plan");
    const engine = createModePolicyEngine(modeManager, basePolicy);
    const tool: MCPTool = {
      name: "plan:generate",
      description: "Plan generator",
      inputSchema: { type: "object" },
    };
    const call: MCPToolCall = { name: tool.name, arguments: {} };

    const result = engine.evaluate(buildContext(tool, call));

    expect(result.allowed).toBe(true);
  });

  it("denies non-read-only tools in review mode", () => {
    const modeManager = new AgentModeManager("review");
    const engine = createModePolicyEngine(modeManager, basePolicy);
    const tool: MCPTool = {
      name: "write_file",
      description: "Write file",
      inputSchema: { type: "object" },
      annotations: { readOnly: false },
    };
    const call: MCPToolCall = { name: tool.name, arguments: {} };

    const result = engine.evaluate(buildContext(tool, call));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Review Mode");
  });

  it("allows read-only tools in review mode", () => {
    const modeManager = new AgentModeManager("review");
    const engine = createModePolicyEngine(modeManager, basePolicy);
    const tool: MCPTool = {
      name: "read_file",
      description: "Read file",
      inputSchema: { type: "object" },
      annotations: { readOnly: true },
    };
    const call: MCPToolCall = { name: tool.name, arguments: {} };

    const result = engine.evaluate(buildContext(tool, call));

    expect(result.allowed).toBe(true);
  });

  it("allows non-read-only tools in build mode", () => {
    const modeManager = new AgentModeManager("build");
    const engine = createModePolicyEngine(modeManager, basePolicy);
    const tool: MCPTool = {
      name: "write_file",
      description: "Write file",
      inputSchema: { type: "object" },
      annotations: { readOnly: false },
    };
    const call: MCPToolCall = { name: tool.name, arguments: {} };

    const result = engine.evaluate(buildContext(tool, call));

    expect(result.allowed).toBe(true);
  });
});
