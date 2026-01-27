/**
 * ScriptExecutor tests
 */

import type { MCPTool, MCPToolCall, MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { ScriptExecutor } from "../tools/core/scriptExecutor";
import type { IToolRegistry } from "../tools/mcp/registry";

function createContext(): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions },
      limits: { ...base.limits },
    },
  };
}

function createRegistry(): IToolRegistry {
  const tool: MCPTool = {
    name: "mock:echo",
    description: "Echo input text",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
      },
      required: ["text"],
    },
  };

  return {
    register: async () => undefined,
    unregister: async () => undefined,
    listTools: () => [tool],
    callTool: async (call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> => {
      const text = (call.arguments as { text?: string }).text ?? "";
      return { success: true, content: [{ type: "text", text }] };
    },
    getServer: () => undefined,
    hasTool: (name: string) => name === tool.name,
    on: () => () => undefined,
  };
}

describe("ScriptExecutor", () => {
  it("executes scripts and returns values", async () => {
    const executor = new ScriptExecutor({ timeoutMs: 1000, captureConsole: true });
    const context = {
      registry: createRegistry(),
      toolContext: createContext(),
      variables: {},
    };

    const result = await executor.execute(
      `
const echoed = await tools.mock.echo({ text: "hi" });
return echoed;
`,
      context
    );

    expect(result.success).toBe(true);
    expect(result.returnValue).toBe("hi");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("captures console output when enabled", async () => {
    const executor = new ScriptExecutor({ timeoutMs: 1000, captureConsole: true });
    const context = {
      registry: createRegistry(),
      toolContext: createContext(),
      variables: {},
    };

    const result = await executor.execute('console.log("hello"); return "done";', context);

    expect(result.success).toBe(true);
    expect(result.logs).toContain("hello");
  });

  it("truncates console output when over the limit", async () => {
    const executor = new ScriptExecutor({
      timeoutMs: 1000,
      captureConsole: true,
      maxLogBytes: 5,
    });
    const context = {
      registry: createRegistry(),
      toolContext: createContext(),
      variables: {},
    };

    const result = await executor.execute('console.log("abcdef"); return "done";', context);

    expect(result.success).toBe(true);
    expect(result.logs[0]).toBe("abcde");
    expect(result.logs).toContain("[log truncated]");
  });

  it("cleans up timers after execution", async () => {
    const executor = new ScriptExecutor({ timeoutMs: 1000, captureConsole: true });
    const context = {
      registry: createRegistry(),
      toolContext: createContext(),
      variables: {},
    };

    const result = await executor.execute(
      `
setInterval(() => console.log("tick"), 5);
await new Promise((resolve) => setTimeout(resolve, 12));
return "done";
`,
      context
    );

    const logCount = result.logs.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(result.logs.length).toBe(logCount);
  });

  it("times out on synchronous loops", async () => {
    const executor = new ScriptExecutor({ timeoutMs: 20, captureConsole: false });
    const context = {
      registry: createRegistry(),
      toolContext: createContext(),
      variables: {},
    };

    const result = await executor.execute("while (true) {}", context);

    expect(result.success).toBe(false);
    expect(result.error?.toLowerCase()).toContain("timed out");
  });
});
