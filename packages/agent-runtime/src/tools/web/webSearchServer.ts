/**
 * Web Search Tool Server
 *
 * Provides web search capabilities for the agent runtime.
 * Supports multiple search providers through a pluggable interface.
 */

import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Web Search Provider Interface
// ============================================================================

/**
 * Search result from a web search.
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

/**
 * Interface for web search providers.
 * Implement this to connect to different search backends.
 */
export interface IWebSearchProvider {
  /** Search the web with a query */
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]>;

  /** Fetch and extract content from a URL */
  fetch?(url: string): Promise<WebFetchResult>;

  /** Provider name for telemetry */
  readonly name: string;
}

export interface WebSearchOptions {
  /** Maximum number of results */
  maxResults?: number;
  /** Filter by domain (include only) */
  allowedDomains?: string[];
  /** Filter by domain (exclude) */
  blockedDomains?: string[];
  /** Search recency (e.g., "day", "week", "month") */
  freshness?: "day" | "week" | "month" | "year";
}

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  contentType: string;
}

// ============================================================================
// Mock Web Search Provider (for testing)
// ============================================================================

/**
 * Mock web search provider for testing.
 */
export class MockWebSearchProvider implements IWebSearchProvider {
  readonly name = "mock";
  private mockResults: WebSearchResult[] = [];

  setMockResults(results: WebSearchResult[]): void {
    this.mockResults = results;
  }

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    const maxResults = options?.maxResults ?? 10;

    // Return mock results or generate placeholder results
    if (this.mockResults.length > 0) {
      return this.mockResults.slice(0, maxResults);
    }

    // Generate placeholder results based on query
    return [
      {
        title: `Search result for: ${query}`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        snippet: `This is a mock search result for the query "${query}".`,
      },
    ];
  }

  async fetch(url: string): Promise<WebFetchResult> {
    return {
      url,
      title: "Mock Page",
      content: `Mock content fetched from ${url}`,
      contentType: "text/plain",
    };
  }
}

// ============================================================================
// Web Search Tool Server
// ============================================================================

export class WebSearchToolServer extends BaseToolServer {
  readonly name = "web";
  readonly description = "Web search and content fetching tools";
  private readonly provider: IWebSearchProvider;

  constructor(provider?: IWebSearchProvider) {
    super();
    this.provider = provider ?? new MockWebSearchProvider();

    // Register tools with handlers
    this.registerTool(this.createSearchToolDef(), this.handleSearch.bind(this));
    this.registerTool(this.createFetchToolDef(), this.handleFetch.bind(this));
  }

  private createSearchToolDef(): MCPTool {
    return {
      name: "search",
      description:
        "Search the web for information. Returns a list of relevant results with titles, URLs, and snippets.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results (default: 5)",
          },
          freshness: {
            type: "string",
            enum: ["day", "week", "month", "year"],
            description: "Filter by recency",
          },
        },
        required: ["query"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
      },
    };
  }

  private createFetchToolDef(): MCPTool {
    return {
      name: "fetch",
      description:
        "Fetch and extract the main content from a URL. Use this after search to get detailed information from a specific page.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
          prompt: {
            type: "string",
            description: "Optional prompt to guide content extraction",
          },
        },
        required: ["url"],
      },
      annotations: {
        requiresConfirmation: false,
        readOnly: true,
      },
    };
  }

  private async handleSearch(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    // Check network permission
    const networkPermission = context.security?.permissions?.network;
    if (networkPermission === "none") {
      return errorResult("PERMISSION_DENIED", "Network access is disabled");
    }

    const query = args.query as string | undefined;
    const maxResults = (args.maxResults as number | undefined) ?? 5;
    const freshness = args.freshness as "day" | "week" | "month" | "year" | undefined;

    if (!query || typeof query !== "string") {
      return errorResult("INVALID_ARGUMENTS", "Query is required");
    }

    try {
      const results = await this.provider.search(query, {
        maxResults,
        freshness,
      });

      if (results.length === 0) {
        return textResult(`No results found for: ${query}`);
      }

      // Format results as markdown
      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}${r.publishedDate ? `\n   _${r.publishedDate}_` : ""}`
        )
        .join("\n\n");

      return textResult(`## Search Results for "${query}"\n\n${formatted}`);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Search failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleFetch(
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<MCPToolResult> {
    // Check network permission
    const networkPermission = context.security?.permissions?.network;
    if (networkPermission === "none") {
      return errorResult("PERMISSION_DENIED", "Network access is disabled");
    }

    const url = args.url as string | undefined;

    if (!url || typeof url !== "string") {
      return errorResult("INVALID_ARGUMENTS", "URL is required");
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return errorResult("INVALID_ARGUMENTS", "Invalid URL format");
    }

    // Check if provider supports fetch
    if (!this.provider.fetch) {
      return errorResult("EXECUTION_FAILED", "This search provider does not support URL fetching");
    }

    try {
      const result = await this.provider.fetch(url);

      return textResult(`## ${result.title}\n\n**Source:** ${result.url}\n\n${result.content}`);
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Fetch failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a web search tool server.
 *
 * @param provider - Optional search provider. Uses mock provider if not specified.
 *
 * @example
 * ```typescript
 * // With mock provider (for testing)
 * const webServer = createWebSearchToolServer();
 *
 * // With custom provider
 * const webServer = createWebSearchToolServer(mySearchProvider);
 * ```
 */
export function createWebSearchToolServer(provider?: IWebSearchProvider): WebSearchToolServer {
  return new WebSearchToolServer(provider);
}
