/**
 * MessageToolServer tests
 */

import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import { MessageToolServer } from "../tools/core/message";

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

describe("MessageToolServer", () => {
  it("rejects invalid message types", async () => {
    const server = new MessageToolServer();
    const context = createContext();

    const result = await server.callTool(
      { name: "send", arguments: { type: "unknown", message: "Hello" } },
      context
    );

    expect(result.success).toBe(false);
    expect(getText(result)).toContain("Message type must be one of");
  });

  it("rejects empty messages", async () => {
    const server = new MessageToolServer();
    const context = createContext();

    const result = await server.callTool(
      { name: "send", arguments: { type: "info", message: "   " } },
      context
    );

    expect(result.success).toBe(false);
    expect(getText(result)).toContain("Message content must be a non-empty string");
  });

  it("normalizes ask metadata and excludes UI action when none", async () => {
    const server = new MessageToolServer();
    const context = createContext();

    const result = await server.callTool(
      { name: "send", arguments: { type: "ask", message: "Proceed?" } },
      context
    );

    const text = getText(result);
    const last = server.getLastMessage();

    expect(result.success).toBe(true);
    expect(text).toContain("Waiting for user response");
    expect(text).not.toContain("UI Action:");
    expect(last?.metadata.suggested_action).toBe("none");
  });

  it("drops result-only metadata for info messages", async () => {
    const server = new MessageToolServer();
    const context = createContext();

    const result = await server.callTool(
      {
        name: "send",
        arguments: {
          type: "info",
          message: "Working",
          attachments: ["a.txt"],
          summary: "done",
        },
      },
      context
    );

    const text = getText(result);
    const last = server.getLastMessage();

    expect(result.success).toBe(true);
    expect(text).not.toContain("Summary:");
    expect(text).not.toContain("Attachments");
    expect(last?.metadata.attachments).toBeUndefined();
    expect(last?.metadata.summary).toBeUndefined();
  });

  it("truncates large outputs", async () => {
    const server = new MessageToolServer();
    const context = createContext(60);

    const result = await server.callTool(
      { name: "send", arguments: { type: "result", message: "x".repeat(200) } },
      context
    );

    const text = getText(result);
    expect(text).toContain("Output truncated");
  });
});
