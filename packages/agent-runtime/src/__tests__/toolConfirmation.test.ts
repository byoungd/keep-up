/**
 * Tool Confirmation Resolution Tests
 */

import { createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { ToolExecutionPipeline } from "../executor";
import { createPermissionChecker, type ToolPolicyEngine } from "../security";
import type { MCPToolServer, ToolContext } from "../types";
import { SECURITY_PRESETS } from "../types";

function createFileServer(): MCPToolServer {
  return {
    name: "file",
    description: "File tools",
    listTools: () => [
      {
        name: "write",
        description: "Write file",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { requiresConfirmation: false, readOnly: false, policyAction: "file.write" },
      },
    ],
    callTool: async () => ({ success: true, content: [] }),
  };
}

describe("ToolExecutionPipeline requiresConfirmation", () => {
  it("uses policy confirmation for file writes", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createFileServer());

    const policy = createPermissionChecker({ ...SECURITY_PRESETS.balanced });
    const executor = new ToolExecutionPipeline({ registry, policy });

    const context: ToolContext = {
      security: { ...SECURITY_PRESETS.balanced },
    };

    const requiresConfirmation = executor.requiresConfirmation(
      { name: "file:write", arguments: { path: "/workspace/output.txt" } },
      context
    );

    expect(requiresConfirmation).toBe(true);
  });

  it("surfaces confirmation details from policy", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createFileServer());

    const policy = {
      check: () => ({
        allowed: true,
        requiresConfirmation: true,
        reason: "cowork-policy",
        riskTags: ["overwrite"],
      }),
      getPolicy: () => ({ ...SECURITY_PRESETS.safe }),
    };

    const executor = new ToolExecutionPipeline({ registry, policy });

    const details = executor.getConfirmationDetails(
      { name: "file:write", arguments: { path: "/workspace/output.txt" } },
      { security: { ...SECURITY_PRESETS.safe } }
    );

    expect(details.requiresConfirmation).toBe(true);
    expect(details.reason).toBe("cowork-policy");
    expect(details.riskTags).toEqual(["overwrite"]);
  });

  it("prefers policy engine decisions when provided", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createFileServer());

    const policy = createPermissionChecker({ ...SECURITY_PRESETS.balanced });
    const policyEngine: ToolPolicyEngine = {
      evaluate: () => ({
        allowed: false,
        requiresConfirmation: false,
        reason: "blocked",
      }),
    };

    const executor = new ToolExecutionPipeline({ registry, policy, policyEngine });
    const result = await executor.execute(
      { name: "file:write", arguments: { path: "/workspace/output.txt" } },
      { security: { ...SECURITY_PRESETS.balanced } }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });
});
