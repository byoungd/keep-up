import { describe, expect, it } from "vitest";
import { NodeResultCache } from "../orchestrator/nodeResultCache";
import type { MCPToolCall, MCPToolResult, ToolContext } from "../types";

describe("NodeResultCache", () => {
  it("caches results per task node", () => {
    const cache = new NodeResultCache({ ttlMs: 1000, includePolicyContext: true });
    const call: MCPToolCall = { name: "file:read", arguments: { path: "a.txt" } };
    const result: MCPToolResult = { success: true, content: [{ type: "text", text: "ok" }] };

    const context: ToolContext = {
      taskNodeId: "node-1",
      security: {
        sandbox: { type: "none", networkAccess: "none", fsIsolation: "none" },
        permissions: {
          bash: "disabled",
          file: "read",
          code: "disabled",
          computer: "disabled",
          network: "none",
          lfcc: "read",
        },
        limits: {
          maxExecutionTimeMs: 1,
          maxMemoryBytes: 1,
          maxOutputBytes: 1,
          maxConcurrentCalls: 1,
        },
      },
      toolExecution: {
        policy: "batch",
        allowedTools: ["*"],
        requiresApproval: [],
        maxParallel: 1,
      },
    };

    cache.set(call, context, result);
    expect(cache.get(call, context)).toEqual(result);
  });

  it("separates cache entries by policy context", () => {
    const cache = new NodeResultCache({ ttlMs: 1000, includePolicyContext: true });
    const call: MCPToolCall = { name: "file:read", arguments: { path: "a.txt" } };
    const result: MCPToolResult = { success: true, content: [{ type: "text", text: "ok" }] };

    const baseContext: ToolContext = {
      taskNodeId: "node-1",
      security: {
        sandbox: { type: "none", networkAccess: "none", fsIsolation: "none" },
        permissions: {
          bash: "disabled",
          file: "read",
          code: "disabled",
          computer: "disabled",
          network: "none",
          lfcc: "read",
        },
        limits: {
          maxExecutionTimeMs: 1,
          maxMemoryBytes: 1,
          maxOutputBytes: 1,
          maxConcurrentCalls: 1,
        },
      },
      toolExecution: {
        policy: "batch",
        allowedTools: ["*"],
        requiresApproval: [],
        maxParallel: 1,
      },
    };

    const differentPolicy: ToolContext = {
      ...baseContext,
      toolExecution: {
        policy: "interactive",
        allowedTools: ["file:read"],
        requiresApproval: ["file:read"],
        maxParallel: 1,
      },
    };

    cache.set(call, baseContext, result);
    expect(cache.get(call, differentPolicy)).toBeUndefined();
  });
});
