import type { MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
import { SECURITY_PRESETS } from "@ku0/agent-runtime-core";
import { describe, expect, it } from "vitest";
import type { IWebSearchProvider, WebSearchOptions, WebSearchResult } from "../webSearchServer";
import { WebSearchToolServer } from "../webSearchServer";

const allowContext: ToolContext = { security: SECURITY_PRESETS.balanced };
const denyContext: ToolContext = { security: SECURITY_PRESETS.safe };

class CapturingProvider implements IWebSearchProvider {
  readonly name = "capture";
  lastQuery?: string;
  lastOptions?: WebSearchOptions;

  constructor(private readonly results: WebSearchResult[]) {}

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    this.lastQuery = query;
    this.lastOptions = options;
    return this.results;
  }
}

class FetchProvider extends CapturingProvider {
  async fetch(
    url: string
  ): Promise<{ url: string; title: string; content: string; contentType: string }> {
    return {
      url,
      title: "Example Title",
      content: "Example content",
      contentType: "text/plain",
    };
  }
}

function extractText(result: MCPToolResult): string {
  const content = result.content[0];
  return content?.type === "text" ? content.text : "";
}

describe("WebSearchToolServer", () => {
  it("blocks search when network access is disabled", async () => {
    const server = new WebSearchToolServer(new CapturingProvider([]));
    const result = await server.callTool(
      { name: "search", arguments: { query: "test" } },
      denyContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("normalizes search options and filters invalid results", async () => {
    const provider = new CapturingProvider([
      { title: "Valid", url: "https://example.com", snippet: "ok" },
      { title: "BadUrl", url: "file:///etc/passwd", snippet: "skip" },
      { title: "", url: "https://ignored.com", snippet: "skip" },
    ]);
    const server = new WebSearchToolServer(provider);

    const result = await server.callTool(
      {
        name: "search",
        arguments: {
          query: "  test query  ",
          maxResults: 200,
          freshness: "week",
          allowedDomains: [" example.com ", ""],
          blockedDomains: ["blocked.com"],
        },
      },
      allowContext
    );

    expect(result.success).toBe(true);
    expect(provider.lastQuery).toBe("test query");
    expect(provider.lastOptions).toEqual({
      maxResults: 10,
      freshness: "week",
      allowedDomains: ["example.com"],
      blockedDomains: ["blocked.com"],
    });

    const text = extractText(result);
    expect(text).toContain("https://example.com");
    expect(text).not.toContain("file:///etc/passwd");
    expect(text).not.toContain("ignored.com");
  });

  it("defaults maxResults when provided with invalid numbers", async () => {
    const provider = new CapturingProvider([
      { title: "Valid", url: "https://example.com", snippet: "ok" },
    ]);
    const server = new WebSearchToolServer(provider);

    await server.callTool(
      { name: "search", arguments: { query: "test", maxResults: 0 } },
      allowContext
    );

    expect(provider.lastOptions?.maxResults).toBe(5);
  });

  it("rejects invalid freshness values", async () => {
    const server = new WebSearchToolServer(new CapturingProvider([]));
    const result = await server.callTool(
      { name: "search", arguments: { query: "test", freshness: "hour" } },
      allowContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects invalid domain filters", async () => {
    const server = new WebSearchToolServer(new CapturingProvider([]));
    const result = await server.callTool(
      { name: "search", arguments: { query: "test", allowedDomains: [1] } },
      allowContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("blocks fetch when network access is disabled", async () => {
    const server = new WebSearchToolServer(new FetchProvider([]));
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "https://example.com" } },
      denyContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("PERMISSION_DENIED");
  });

  it("rejects non-http urls for fetch", async () => {
    const server = new WebSearchToolServer(new FetchProvider([]));
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "file:///etc/passwd" } },
      allowContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("returns an error when provider does not support fetch", async () => {
    const server = new WebSearchToolServer(new CapturingProvider([]));
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "https://example.com" } },
      allowContext
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("EXECUTION_FAILED");
  });

  it("returns fetched content when provider supports fetch", async () => {
    const server = new WebSearchToolServer(new FetchProvider([]));
    const result = await server.callTool(
      { name: "fetch", arguments: { url: "https://example.com" } },
      allowContext
    );

    expect(result.success).toBe(true);
    const text = extractText(result);
    expect(text).toContain("Example Title");
    expect(text).toContain("Example content");
  });
});
