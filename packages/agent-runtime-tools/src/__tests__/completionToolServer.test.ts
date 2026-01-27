/**
 * CompletionToolServer tests
 */

import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { CompletionToolServer } from "../tools/core/completion";

function createContext(maxOutputBytes?: number): ToolContext {
  const base = SECURITY_PRESETS.balanced;
  return {
    security: {
      sandbox: { ...base.sandbox },
      permissions: { ...base.permissions },
      limits: { ...base.limits, maxOutputBytes: maxOutputBytes ?? base.limits.maxOutputBytes },
    },
  };
}

function getText(result: MCPToolResult): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

describe("CompletionToolServer", () => {
  it("rejects missing summaries", async () => {
    const server = new CompletionToolServer();
    const context = createContext();

    const result = await server.callTool({ name: "complete_task", arguments: {} }, context);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("truncates large outputs", async () => {
    const server = new CompletionToolServer();
    const context = createContext(60);

    const result = await server.callTool(
      { name: "complete_task", arguments: { summary: "x".repeat(200) } },
      context
    );

    const text = getText(result);
    expect(result.success).toBe(true);
    expect(text).toContain("Output truncated");
  });

  it("deduplicates artifacts", async () => {
    const server = new CompletionToolServer();
    const context = createContext();

    const result = await server.callTool(
      {
        name: "complete_task",
        arguments: {
          summary: "Done",
          artifacts: ["a.txt", "a.txt", "b.txt"],
        },
      },
      context
    );

    const text = getText(result);
    expect(result.success).toBe(true);
    expect(text).toContain("Artifacts: a.txt, b.txt");
  });
});
