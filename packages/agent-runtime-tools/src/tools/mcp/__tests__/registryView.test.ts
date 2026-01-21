import { type MCPToolServer, SECURITY_PRESETS, type ToolContext } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { createToolRegistry, createToolRegistryView } from "../index";

const security = SECURITY_PRESETS.balanced;
const context: ToolContext = { security };

function createTestServer(name: string, toolNames: string[]): MCPToolServer {
  return {
    name,
    description: "test server",
    listTools: () =>
      toolNames.map((toolName) => ({
        name: toolName,
        description: "test tool",
        inputSchema: { type: "object", properties: {} },
        annotations: { policyAction: "connector.read" },
      })),
    async callTool(call, _context) {
      if (!toolNames.includes(call.name)) {
        return {
          success: false,
          content: [{ type: "text", text: "Tool not found" }],
          error: { code: "RESOURCE_NOT_FOUND", message: "Tool not found" },
        };
      }
      return { success: true, content: [{ type: "text", text: call.name }] };
    },
  };
}

describe("ToolRegistryView", () => {
  it("filters tools and blocks disallowed calls", async () => {
    const registry = createToolRegistry();
    await registry.register(createTestServer("test", ["allowed", "blocked"]));

    const view = createToolRegistryView(registry, { allowedTools: ["test:allowed"] });

    const toolNames = view.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(["test:allowed"]);
    expect(view.hasTool("test:allowed")).toBe(true);
    expect(view.hasTool("test:blocked")).toBe(false);

    const blocked = await view.callTool({ name: "test:blocked", arguments: {} }, context);
    expect(blocked.success).toBe(false);
    expect(blocked.error?.code).toBe("PERMISSION_DENIED");

    const allowed = await view.callTool({ name: "test:allowed", arguments: {} }, context);
    expect(allowed.success).toBe(true);
  });

  it("does not mutate the parent registry", async () => {
    const registry = createToolRegistry();
    await registry.register(createTestServer("base", ["keep"]));

    const view = createToolRegistryView(registry, { allowedTools: ["base:keep"] });
    const extra = createTestServer("extra", ["tool"]);

    await expect(view.register(extra)).rejects.toThrow("read-only");
    await expect(view.unregister("base")).rejects.toThrow("read-only");

    expect(registry.hasTool("base:keep")).toBe(true);
    expect(registry.hasTool("extra:tool")).toBe(false);
  });

  it("matches unqualified allowlist entries against qualified tools", async () => {
    const registry = createToolRegistry();
    await registry.register(createTestServer("test", ["allowed"]));

    const view = createToolRegistryView(registry, { allowedTools: ["allowed"] });

    const toolNames = view.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(["test:allowed"]);
    expect(view.hasTool("test:allowed")).toBe(true);

    const allowed = await view.callTool({ name: "test:allowed", arguments: {} }, context);
    expect(allowed.success).toBe(true);
  });

  it("does not allow prefix-only wildcard matches", async () => {
    const registry = createToolRegistry();
    await registry.register(createTestServer("file", ["read"]));
    await registry.register(createTestServer("file2", ["read"]));

    const view = createToolRegistryView(registry, { allowedTools: ["file:*"] });

    const toolNames = view.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(["file:read"]);
    expect(view.hasTool("file:read")).toBe(true);
    expect(view.hasTool("file2:read")).toBe(false);

    const allowed = await view.callTool({ name: "file:read", arguments: {} }, context);
    expect(allowed.success).toBe(true);

    const blocked = await view.callTool({ name: "file2:read", arguments: {} }, context);
    expect(blocked.success).toBe(false);
    expect(blocked.error?.code).toBe("PERMISSION_DENIED");
  });

  it("allows unqualified tools when resolved to an allowed server", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createTestServer("file", ["read"]));

    const view = createToolRegistryView(registry, { allowedTools: ["file:read"] });

    const toolNames = view.listTools().map((tool) => tool.name);
    expect(toolNames).toContain("read");

    const result = await view.callTool({ name: "read", arguments: {} }, context);
    expect(result.success).toBe(true);
  });
});
