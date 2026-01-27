import type { Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { fromSdkTool, normalizeSdkTool, toSdkTool } from "../sdkAdapter";

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

  it("maps MCP app UI metadata in both directions", () => {
    const tool = {
      name: "ui-tool",
      description: "UI tool",
      inputSchema: { type: "object" },
      _meta: {
        ui: {
          resourceUri: "ui://example/app",
          label: "Open App",
          icon: "app",
          visibility: "always",
        },
      },
    } as SdkTool;

    const mapped = fromSdkTool(tool);
    expect(mapped.ui?.resourceUri).toBe("ui://example/app");
    expect(mapped.ui?.label).toBe("Open App");

    const roundtrip = toSdkTool(mapped);
    expect(roundtrip._meta).toMatchObject({
      ui: {
        resourceUri: "ui://example/app",
        label: "Open App",
        icon: "app",
        visibility: "always",
      },
    });
  });
});
