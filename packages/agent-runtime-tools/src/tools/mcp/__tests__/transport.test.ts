import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { createMcpTransport, resolveMcpTransportUrl } from "../transport";

describe("mcp transport factory", () => {
  it("creates stdio transport", () => {
    const { transport, type, serverUrl } = createMcpTransport({
      type: "stdio",
      command: "node",
      args: ["-v"],
    });

    expect(type).toBe("stdio");
    expect(transport).toBeInstanceOf(StdioClientTransport);
    expect(serverUrl).toBeUndefined();
  });

  it("creates SSE transport", () => {
    const { transport, type, serverUrl } = createMcpTransport({
      type: "sse",
      url: "https://example.com/mcp",
    });

    expect(type).toBe("sse");
    expect(transport).toBeInstanceOf(SSEClientTransport);
    expect(serverUrl?.toString()).toBe("https://example.com/mcp");
  });

  it("creates streamable HTTP transport", () => {
    const { transport, type, serverUrl } = createMcpTransport({
      type: "streamableHttp",
      url: "https://example.com/mcp",
    });

    expect(type).toBe("streamableHttp");
    expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
    expect(serverUrl?.toString()).toBe("https://example.com/mcp");
  });

  it("resolves transport URLs", () => {
    expect(resolveMcpTransportUrl({ type: "stdio", command: "node" })).toBeUndefined();
    expect(
      resolveMcpTransportUrl({ type: "sse", url: "https://example.com/mcp" })?.toString()
    ).toBe("https://example.com/mcp");
  });
});
