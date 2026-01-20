import type { MCPToolServer, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../index";

const context: ToolContext = { security: SECURITY_PRESETS.safe };

function createServer(name: string, tools: MCPToolServer["listTools"]): MCPToolServer {
  return {
    name,
    description: "test server",
    listTools: tools,
    async callTool(call, _context) {
      return {
        success: true,
        content: [{ type: "text", text: call.name }],
      };
    },
  };
}

describe("ToolRegistry", () => {
  it("rejects tools missing policyAction", async () => {
    const registry = createToolRegistry();
    const server = createServer("missing", () => [
      {
        name: "tool",
        description: "Missing policy action",
        inputSchema: { type: "object", properties: {} },
      },
    ]);

    await expect(registry.register(server)).rejects.toThrow("missing annotations.policyAction");
  });

  it("rejects tools with invalid policyAction", async () => {
    const registry = createToolRegistry();
    const server = createServer("invalid", () => [
      {
        name: "tool",
        description: "Invalid policy action",
        inputSchema: { type: "object", properties: {} },
        annotations: { policyAction: "invalid.action" as "connector.read" },
      },
    ]);

    await expect(registry.register(server)).rejects.toThrow("invalid policyAction");
  });

  it("registers tools with valid policyAction", async () => {
    const registry = createToolRegistry();
    const server = createServer("valid", () => [
      {
        name: "tool",
        description: "Valid policy action",
        inputSchema: { type: "object", properties: {} },
        annotations: { policyAction: "connector.read" },
      },
    ]);

    await expect(registry.register(server)).resolves.toBeUndefined();
    const result = await registry.callTool({ name: "valid:tool", arguments: {} }, context);
    expect(result.success).toBe(true);
  });
});
