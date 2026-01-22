import { fromSdkResult, fromSdkTool, toSdkResult, toSdkTool } from "@ku0/agent-runtime-tools";
import { describe, expect, it } from "vitest";
import type { MCPTool, MCPToolResult } from "../types";

describe("mcpSdkAdapter", () => {
  it("round-trips MCP tool metadata", () => {
    const tool: MCPTool = {
      name: "remote:search",
      description: "Search a remote index",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      annotations: {
        category: "external",
        requiresConfirmation: true,
        readOnly: true,
        requiredScopes: ["search:read"],
      },
      metadata: {
        provider: "remote",
      },
    };

    const sdkTool = toSdkTool(tool);
    const roundtrip = fromSdkTool(sdkTool);

    expect(roundtrip.name).toBe(tool.name);
    expect(roundtrip.annotations?.category).toBe("external");
    expect(roundtrip.annotations?.requiresConfirmation).toBe(true);
    expect(roundtrip.annotations?.readOnly).toBe(true);
    expect(roundtrip.annotations?.requiredScopes).toEqual(["search:read"]);
  });

  it("maps tool results to SDK format", () => {
    const result: MCPToolResult = {
      success: true,
      content: [{ type: "text", text: "ok" }],
    };

    const sdkResult = toSdkResult(result);
    expect(sdkResult.isError).toBe(false);
    expect(sdkResult.content[0]).toEqual({ type: "text", text: "ok" });
  });

  it("maps SDK errors to MCP result", () => {
    const sdkResult = {
      content: [{ type: "text", text: "failure" }],
      isError: true,
    };

    const result = fromSdkResult(sdkResult);
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("failure");
  });
});
