import type { MCPTool, MCPToolServer } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { ToolDiscoveryEngine } from "../toolDiscovery";

function createTool(name: string, description = "test tool"): MCPTool {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {} },
    annotations: { category: "external" },
  };
}

function createServer(name: string, toolNames: string[]): MCPToolServer {
  return {
    name,
    description: "test server",
    listTools: () => toolNames.map((toolName) => createTool(toolName)),
    async callTool(call) {
      return {
        success: true,
        content: [{ type: "text", text: call.name }],
      };
    },
  };
}

describe("ToolDiscoveryEngine", () => {
  it("resolves unqualified tool names only when unique", () => {
    const engine = new ToolDiscoveryEngine();
    engine.registerServer(createServer("file", ["read"]));

    const unique = engine.getTool("read");
    expect(unique?.name).toBe("read");

    engine.registerServer(createServer("file2", ["read"]));

    const ambiguous = engine.getTool("read");
    expect(ambiguous).toBeUndefined();
    expect(engine.getTool("file:read")?.name).toBe("read");
    expect(engine.getTool("file2:read")?.name).toBe("read");
  });

  it("returns matches for capability-only searches", () => {
    const engine = new ToolDiscoveryEngine();
    const server: MCPToolServer = {
      name: "web",
      description: "test server",
      listTools: () => [createTool("fetch", "Fetch HTTP content from URLs for analysis")],
      async callTool(call) {
        return {
          success: true,
          content: [{ type: "text", text: call.name }],
        };
      },
    };
    engine.registerServer(server);

    const results = engine.search({ capabilities: ["http"] });
    expect(results.length).toBe(1);
    expect(results[0].matchReason).toContain("capabilities");
  });

  it("returns no results when limit is zero", () => {
    const engine = new ToolDiscoveryEngine();
    engine.registerServer(createServer("core", ["status", "help"]));

    const results = engine.search({ query: "status", limit: 0 });
    expect(results).toEqual([]);
  });

  it("handles already-qualified tool names", () => {
    const engine = new ToolDiscoveryEngine();
    engine.registerServer(createServer("registry", ["file:read"]));

    const tool = engine.getTool("file:read");
    expect(tool?.name).toBe("file:read");
  });
});
