import { createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { createIsolatedToolRegistry } from "../tools/workbench/registry";
import type { MCPTool, MCPToolCall, MCPToolResult, MCPToolServer, ToolContext } from "../types";
import { SECURITY_PRESETS } from "../types";

const baseServer: MCPToolServer = {
  name: "base",
  description: "Base server",
  listTools: (): MCPTool[] => [
    {
      name: "noop",
      description: "No-op tool",
      inputSchema: { type: "object", properties: {} },
      annotations: { policyAction: "connector.read" },
    },
  ],
  async callTool(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    return { success: true, content: [{ type: "text", text: "base" }] };
  },
};

const overlayServer: MCPToolServer = {
  name: "overlay",
  description: "Overlay server",
  listTools: (): MCPTool[] => [
    {
      name: "ping",
      description: "Ping tool",
      inputSchema: { type: "object", properties: {} },
      annotations: { policyAction: "connector.read" },
    },
  ],
  async callTool(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    return { success: true, content: [{ type: "text", text: "overlay" }] };
  },
};

const baseContext: ToolContext = { security: { ...SECURITY_PRESETS.safe } };

describe("IsolatedToolRegistry", () => {
  it("keeps overlay registrations isolated from base registry", async () => {
    const baseRegistry = createToolRegistry();
    await baseRegistry.register(baseServer);

    const isolated = createIsolatedToolRegistry(baseRegistry);
    await isolated.register(overlayServer);

    expect(baseRegistry.hasTool("overlay:ping")).toBe(false);
    expect(isolated.hasTool("overlay:ping")).toBe(true);

    expect(baseRegistry.listTools().map((tool) => tool.name)).toEqual(["base:noop"]);
    expect(
      isolated
        .listTools()
        .map((tool) => tool.name)
        .sort()
    ).toEqual(["base:noop", "overlay:ping"]);
  });

  it("routes calls to overlay tools without mutating base", async () => {
    const baseRegistry = createToolRegistry();
    await baseRegistry.register(baseServer);

    const isolated = createIsolatedToolRegistry(baseRegistry);
    await isolated.register(overlayServer);

    const result = await isolated.callTool({ name: "overlay:ping", arguments: {} }, baseContext);
    expect(result.success).toBe(true);
    expect(result.content[0]?.text).toBe("overlay");

    const baseResult = await baseRegistry.callTool(
      { name: "base:noop", arguments: {} },
      baseContext
    );
    expect(baseResult.success).toBe(true);
    expect(baseResult.content[0]?.text).toBe("base");
  });
});
