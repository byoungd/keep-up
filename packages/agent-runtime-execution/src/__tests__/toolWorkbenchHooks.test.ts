import type { HookConfig } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { ToolWorkbench } from "../tools/workbench/toolWorkbench";
import type { MCPTool, MCPToolCall, MCPToolResult, MCPToolServer, ToolContext } from "../types";
import { SECURITY_PRESETS } from "../types";

const noopServer: MCPToolServer = {
  name: "dummy",
  description: "Dummy server",
  listTools: (): MCPTool[] => [
    {
      name: "noop",
      description: "No-op tool",
      inputSchema: { type: "object", properties: {} },
      annotations: { policyAction: "connector.read" },
    },
  ],
  async callTool(_call: MCPToolCall, _context: ToolContext): Promise<MCPToolResult> {
    return { success: true, content: [{ type: "text", text: "ok" }] };
  },
};

const baseContext: ToolContext = { security: { ...SECURITY_PRESETS.power } };

const denyPreHookPolicy = {
  rules: [
    {
      id: "deny-pre",
      target: "hook" as const,
      action: "deny" as const,
      hooks: ["PreToolUse"],
    },
  ],
  defaultAction: "allow" as const,
  hookDefaultAction: "allow" as const,
};

const failingHookCommand = `${JSON.stringify(process.execPath)} -e "process.stderr.write('hook-failed'); process.exit(1)"`;

function createHook(isCancellable: boolean): HookConfig {
  return {
    name: "guard",
    type: "PreToolUse",
    toolPatterns: ["dummy:noop"],
    command: failingHookCommand,
    timeoutMs: 1000,
    isCancellable,
  };
}

describe("ToolWorkbench hook gating", () => {
  it("cancels tool execution when hook is denied and cancellable", async () => {
    const workbench = new ToolWorkbench({
      toolServers: [noopServer],
      hooks: [createHook(true)],
      policy: denyPreHookPolicy,
      securityPolicy: { ...SECURITY_PRESETS.power },
    });

    const result = await workbench.callTool("dummy:noop", {}, { context: baseContext });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("skips non-cancellable hooks when denied", async () => {
    const workbench = new ToolWorkbench({
      toolServers: [noopServer],
      hooks: [createHook(false)],
      policy: denyPreHookPolicy,
      securityPolicy: { ...SECURITY_PRESETS.power },
    });

    const result = await workbench.callTool("dummy:noop", {}, { context: baseContext });
    expect(result.success).toBe(true);
    expect(result.content[0]?.text).toBe("ok");
  });
});
