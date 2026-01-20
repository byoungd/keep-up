/**
 * Cowork Factory Tests
 */

import { createToolRegistry } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import { createCoworkToolExecutor } from "../cowork/factory";
import type { CoworkPolicyConfig } from "../cowork/policy";
import type { CoworkSession } from "../cowork/types";
import { createSecurityPolicy } from "../security";
import type { MCPToolServer, ToolContext } from "../types";

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
      {
        name: "delete",
        description: "Delete file",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { requiresConfirmation: false, readOnly: false, policyAction: "file.write" },
      },
    ],
    callTool: async () => ({ success: true, content: [] }),
  };
}

describe("Cowork factories", () => {
  it("applies Cowork policy confirmation rules", async () => {
    const registry = createToolRegistry({ enforceQualifiedNames: false });
    await registry.register(createFileServer());

    const session: CoworkSession = {
      sessionId: "session-1",
      userId: "user-1",
      deviceId: "device-1",
      platform: "macos",
      mode: "cowork",
      grants: [
        {
          id: "grant-1",
          rootPath: "/workspace",
          allowWrite: true,
          allowDelete: true,
          allowCreate: true,
          outputRoots: ["/workspace/output"],
        },
      ],
      connectors: [],
      createdAt: Date.now(),
    };

    const policy: CoworkPolicyConfig = {
      version: "1.0",
      defaults: { fallback: "deny" },
      rules: [
        {
          id: "allow-write-with-confirm",
          action: "file.write",
          when: { pathWithinGrant: true },
          decision: "allow_with_confirm",
        },
      ],
    };
    const executor = createCoworkToolExecutor(registry, { session, policy });
    const resolver = executor as unknown as {
      requiresConfirmation: (
        call: { name: string; arguments: Record<string, unknown> },
        context: ToolContext
      ) => boolean;
    };

    const writeRequiresConfirmation = resolver.requiresConfirmation(
      {
        name: "file:write",
        arguments: { path: "/workspace/docs/readme.md" },
      },
      { security: createSecurityPolicy("balanced") }
    );
    const deleteRequiresConfirmation = resolver.requiresConfirmation(
      {
        name: "file:delete",
        arguments: { path: "/workspace/docs/readme.md" },
      },
      { security: createSecurityPolicy("balanced") }
    );

    expect(writeRequiresConfirmation).toBe(true);
    expect(deleteRequiresConfirmation).toBe(true);
  });
});
