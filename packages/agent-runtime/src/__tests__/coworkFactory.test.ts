/**
 * Cowork Factory Tests
 */

import { describe, expect, it } from "vitest";
import { createCoworkToolExecutor } from "../cowork/factory";
import type { CoworkSession } from "../cowork/types";
import { createToolRegistry } from "../tools/mcp/registry";
import type { MCPToolServer } from "../types";

function createFileServer(): MCPToolServer {
  return {
    name: "file",
    description: "File tools",
    listTools: () => [
      {
        name: "write",
        description: "Write file",
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { requiresConfirmation: false, readOnly: false },
      },
    ],
    callTool: async () => ({ success: true, content: [] }),
  };
}

describe("Cowork factories", () => {
  it("uses Cowork policy to require confirmation", async () => {
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

    const executor = createCoworkToolExecutor(registry, { session });
    const resolver = executor as unknown as {
      requiresConfirmation: (call: { name: string; arguments: Record<string, unknown> }) => boolean;
    };

    const requiresConfirmation = resolver.requiresConfirmation({
      name: "file:write",
      arguments: { path: "/workspace/docs/readme.md" },
    });

    expect(requiresConfirmation).toBe(true);
  });
});
