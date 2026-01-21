import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { createMcpTransport, resolveMcpTransportUrl } from "../transport";

describe("mcp transport factory", () => {
  const getStdioEnv = (transport: StdioClientTransport): Record<string, string> | undefined => {
    return (transport as unknown as { _serverParams?: { env?: Record<string, string> } })
      ._serverParams?.env;
  };

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

  it("passes through stdio env overrides only when provided", () => {
    const { transport } = createMcpTransport({
      type: "stdio",
      command: "node",
    });
    expect(getStdioEnv(transport as StdioClientTransport)).toBeUndefined();

    const { transport: withEnv } = createMcpTransport({
      type: "stdio",
      command: "node",
      env: { KEEPUP_ENV: "true" },
    });
    expect(getStdioEnv(withEnv as StdioClientTransport)).toEqual({ KEEPUP_ENV: "true" });
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

  it("rejects non-http SSE URLs", () => {
    expect(() =>
      createMcpTransport({
        type: "sse",
        url: "file:///tmp/mcp",
      })
    ).toThrow("http(s)");
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

  it("rejects non-http streamable HTTP URLs", () => {
    expect(() =>
      createMcpTransport({
        type: "streamableHttp",
        url: "ftp://example.com/mcp",
      })
    ).toThrow("http(s)");
  });

  it("resolves transport URLs", () => {
    expect(resolveMcpTransportUrl({ type: "stdio", command: "node" })).toBeUndefined();
    expect(
      resolveMcpTransportUrl({ type: "sse", url: "https://example.com/mcp" })?.toString()
    ).toBe("https://example.com/mcp");
  });

  it("rejects non-http URLs when resolving", () => {
    expect(() => resolveMcpTransportUrl({ type: "sse", url: "file:///tmp/mcp" })).toThrow(
      "http(s)"
    );
  });
});
