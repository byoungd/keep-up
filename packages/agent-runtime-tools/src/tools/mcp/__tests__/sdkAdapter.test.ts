import type { Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { fromSdkTool, normalizeSdkTool } from "../sdkAdapter";

describe("mcp sdk adapter normalization", () => {
  it("returns null for invalid tool names", () => {
    const invalid = normalizeSdkTool({
      name: " ",
      description: "bad",
      inputSchema: { type: "object" },
    } as SdkTool);

    expect(invalid).toBeNull();
  });

  it("normalizes input schema types", () => {
    const normalized = normalizeSdkTool({
      name: "tool",
      description: "ok",
      inputSchema: { type: "null" },
    } as SdkTool);

    expect(normalized?.inputSchema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("extracts required scopes from metadata when annotations are missing", () => {
    const tool = {
      name: "scoped-tool",
      description: "scope metadata",
      inputSchema: { type: "object" },
      _meta: {
        oauth: {
          scopes: "read write",
        },
      },
    } as SdkTool;

    const mapped = fromSdkTool(tool);

    expect(mapped.annotations?.requiredScopes).toEqual(["read", "write"]);
  });
});
