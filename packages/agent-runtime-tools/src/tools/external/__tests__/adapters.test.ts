import { type MCPTool, type MCPToolResult, SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { AdapterRegistry, ExternalToolServer, type IExternalFrameworkAdapter } from "../adapters";

function createAdapter(options: {
  name: string;
  available?: boolean;
  throwOnAvailable?: boolean;
  tools?: MCPTool[];
  executeResult?: MCPToolResult;
  throwOnExecute?: boolean;
}): IExternalFrameworkAdapter {
  const tools = options.tools ?? [];
  const executeResult: MCPToolResult = options.executeResult ?? {
    success: true,
    content: [{ type: "text", text: "ok" }],
  };

  return {
    name: options.name,
    async isAvailable() {
      if (options.throwOnAvailable) {
        throw new Error("availability failed");
      }
      return options.available ?? false;
    },
    async importTools() {
      return tools;
    },
    async executeTool() {
      if (options.throwOnExecute) {
        throw new Error("execute failed");
      }
      return executeResult;
    },
  };
}

describe("AdapterRegistry", () => {
  it("rejects duplicate adapter names", () => {
    const registry = new AdapterRegistry();
    registry.register(createAdapter({ name: "dup" }));

    expect(() => registry.register(createAdapter({ name: "dup" }))).toThrow(
      'Adapter "dup" is already registered'
    );
  });

  it("returns only available adapters, ignoring availability errors", async () => {
    const registry = new AdapterRegistry();
    registry.register(createAdapter({ name: "ok", available: true }));
    registry.register(createAdapter({ name: "no", available: false }));
    registry.register(createAdapter({ name: "boom", throwOnAvailable: true }));

    const available = await registry.getAvailable();

    expect(available.map((adapter) => adapter.name)).toEqual(["ok"]);
  });
});

describe("ExternalToolServer", () => {
  it("filters tools without valid policy actions", async () => {
    const tools: MCPTool[] = [
      {
        name: "good",
        description: "ok",
        inputSchema: { type: "object", properties: {} },
        annotations: { policyAction: "connector.read" },
      },
      {
        name: "bad",
        description: "missing policy",
        inputSchema: { type: "object", properties: {} },
      },
    ];

    const adapter = createAdapter({ name: "test", available: true, tools });
    const server = new ExternalToolServer(adapter);

    await server.initialize();

    const toolNames = server.listTools().map((tool) => tool.name);
    expect(toolNames).toEqual(["good"]);
  });

  it("clears cached tools when adapter is unavailable", async () => {
    const tools: MCPTool[] = [
      {
        name: "good",
        description: "ok",
        inputSchema: { type: "object", properties: {} },
        annotations: { policyAction: "connector.read" },
      },
    ];
    let available = true;
    const adapter: IExternalFrameworkAdapter = {
      name: "test",
      async isAvailable() {
        return available;
      },
      async importTools() {
        return tools;
      },
      async executeTool() {
        return { success: true, content: [{ type: "text", text: "ok" }] };
      },
    };
    const server = new ExternalToolServer(adapter);

    await server.initialize();
    expect(server.listTools().length).toBe(1);

    available = false;
    await server.initialize();
    expect(server.listTools().length).toBe(0);
  });

  it("returns an error result when adapter execution fails", async () => {
    const adapter = createAdapter({ name: "test", available: true, throwOnExecute: true });
    const server = new ExternalToolServer(adapter);
    const context = { security: SECURITY_PRESETS.safe };

    const result = await server.callTool({ name: "any", arguments: {} }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("EXECUTION_FAILED");
  });
});
