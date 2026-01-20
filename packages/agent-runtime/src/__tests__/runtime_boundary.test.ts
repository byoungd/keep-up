import type { MCPToolCall, MCPToolServer, ToolContext } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../index";

describe("ToolRegistry Boundary Conditions", () => {
  it("should handle calling non-existent tool", async () => {
    const registry = createToolRegistry();
    const context = {
      security: {
        permissions: { bash: "none", file: "none", network: "none", browser: "none", lfcc: "none" },
        sandbox: { type: "none" },
        limits: { maxExecutionTimeMs: 1000, maxOutputBytes: 1000 },
      },
    } as unknown as ToolContext;
    const call: MCPToolCall = { name: "non_existent", arguments: {} };

    const result = await registry.callTool(call, context);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("should handle duplicate registration", async () => {
    const registry = createToolRegistry();
    const mockServer = {
      name: "test-server",
      listTools: () => [
        { name: "test-tool", description: "test", inputSchema: { type: "object", properties: {} } },
      ],
      callTool: async () => ({ success: true, content: [] }),
    } as unknown as MCPToolServer;

    await registry.register(mockServer);
    await expect(registry.register(mockServer)).rejects.toThrow(/already registered/i);
  });

  it("should handle registration of server with no tools", async () => {
    const registry = createToolRegistry();
    const emptyServer = {
      name: "empty-server",
      listTools: () => [],
      callTool: async () => ({ success: false, error: { code: "NOT_FOUND", message: "No tools" } }),
    } as unknown as MCPToolServer;

    await registry.register(emptyServer);
    expect(registry.listTools().length).toBe(0);
  });

  it("should handle malformed tool arguments", async () => {
    const registry = createToolRegistry();
    const mockServer = {
      name: "test-server",
      listTools: () => [
        {
          name: "test-tool",
          description: "test",
          inputSchema: {
            type: "object",
            properties: { req: { type: "string" } },
            required: ["req"],
          },
        },
      ],
      callTool: async (call: MCPToolCall) => {
        if (!call.arguments?.req) {
          return { success: false, error: { code: "INVALID_PARAMS", message: "Missing req" } };
        }
        return { success: true, content: [] };
      },
    } as unknown as MCPToolServer;

    await registry.register(mockServer);
    const context = {
      security: {
        permissions: { bash: "none", file: "none", network: "none", browser: "none", lfcc: "none" },
        sandbox: { type: "none" },
        limits: { maxExecutionTimeMs: 1000, maxOutputBytes: 1000 },
      },
    } as unknown as ToolContext;

    // Call with missing required argument (using qualified name)
    const result = await registry.callTool(
      { name: "test-server:test-tool", arguments: {} },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_PARAMS");
  });
});
