/**
 * Web Search Tool Server
 *
 * Provides web search capabilities for the agent runtime.
 * Supports multiple search providers through a pluggable interface.
 */

import type { MCPTool, MCPToolResult, ToolContext } from "@ku0/agent-runtime-core";
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
  content?: string; // Full or partial content if available
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
// Real Web Search Providers
// ============================================================================

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilySearchResult[];
}

interface TavilyRequestBody {
  api_key: string;
  query: string;
  search_depth: "basic" | "advanced";
  max_results: number;
  include_answer: boolean;
  include_images: boolean;
  include_raw_content: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
  days?: number;
}

/**
 * Tavily Search Provider
 * API Docs: https://docs.tavily.com/docs/tavily-api/rest_api
 */
export class TavilyWebSearchProvider implements IWebSearchProvider {
  readonly name = "tavily";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    const body: TavilyRequestBody = {
      api_key: this.apiKey,
      query,
      search_depth: "basic",
      max_results: options?.maxResults ?? 5,
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    };

    if (options?.allowedDomains && options.allowedDomains.length > 0) {
      body.include_domains = options.allowedDomains;
    }

    if (options?.blockedDomains && options.blockedDomains.length > 0) {
      body.exclude_domains = options.blockedDomains;
    }

    // Tavily 'days' parameter fits freshness roughly
    if (options?.freshness) {
      // Basic mapping: day -> 1, week -> 7, month -> 30, year -> 365
      // The API takes 'days' as number of days back
      switch (options.freshness) {
        case "day":
          body.days = 1;
          break;
        case "week":
          body.days = 7;
          break;
        case "month":
          body.days = 30;
          break;
        case "year":
          body.days = 365;
          break;
      }
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as TavilyResponse;
    const results = data.results || [];

    return results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content, // Tavily 'content' is often a good snippet
      content: r.raw_content,
      publishedDate: r.published_date,
    }));
  }
}

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic: SerperOrganicResult[];
}

interface SerperRequestBody {
  q: string;
  num: number;
  tbs?: string;
}

/**
 * Serper (Google) Search Provider
 * API Docs: https://serper.dev/playground
 */
export class SerperWebSearchProvider implements IWebSearchProvider {
  readonly name = "serper";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    const body: SerperRequestBody = {
      q: query,
      num: options?.maxResults ?? 5,
    };

    if (options?.freshness) {
      // Serper uses 'tbs' parameter for time range usually, but the documented JSON API
      // supports a simplified 'date' or similar? Actually Serper API is simple.
      // Checking docs: "tbs": "qdr:h" (hour), "qdr:d" (day), "qdr:w" (week), "qdr:m" (month), "qdr:y" (year)
      switch (options.freshness) {
        case "day":
          body.tbs = "qdr:d";
          break;
        case "week":
          body.tbs = "qdr:w";
          break;
        case "month":
          body.tbs = "qdr:m";
          break;
        case "year":
          body.tbs = "qdr:y";
          break;
      }
    }

    // Apply domain filtering via query modification
    // Note: Serper doesn't strictly support domain filtering in the JSON body for all endpoints easily,
    // usually handled via query "site:example.com".
    let finalQuery = body.q;
    if (options?.allowedDomains && options.allowedDomains.length > 0) {
      finalQuery += ` site:${options.allowedDomains.join(" OR site:")}`;
    }
    if (options?.blockedDomains && options.blockedDomains.length > 0) {
      finalQuery += ` -site:${options.blockedDomains.join(" -site:")}`;
    }

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, q: finalQuery }),
    });

    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as SerperResponse;
    const organic = data.organic || [];

    return organic.map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      publishedDate: r.date,
    }));
  }
}

// ============================================================================
// Jina Web Search Provider (Free, No API Key Required)
// ============================================================================

interface JinaSearchResult {
  title: string;
  url: string;
  description: string;
  content?: string;
}

interface JinaSearchResponse {
  code: number;
  data: JinaSearchResult[];
}

interface JinaReaderResponse {
  code: number;
  data: {
    title: string;
    url: string;
    content: string;
  };
}

/**
 * Jina Web Search Provider
 *
 * A free, keyless search provider using Jina AI's public APIs:
 * - Search: https://s.jina.ai/{query}
 * - Reader: https://r.jina.ai/{url}
 *
 * Docs: https://jina.ai/reader/
 */
export class JinaWebSearchProvider implements IWebSearchProvider {
  readonly name = "jina";

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResult[]> {
    const maxResults = options?.maxResults ?? 5;
    const encodedQuery = encodeURIComponent(query);

    const response = await fetch(`https://s.jina.ai/${encodedQuery}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Return-Format": "json",
      },
    });

    if (!response.ok) {
      throw new Error(`Jina Search API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JinaSearchResponse;

    if (data.code !== 200 || !data.data) {
      throw new Error(`Jina Search returned error code: ${data.code}`);
    }

    return data.data.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      content: r.content,
    }));
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const encodedUrl = encodeURIComponent(url);

    const response = await fetch(`https://r.jina.ai/${encodedUrl}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Return-Format": "json",
      },
    });

    if (!response.ok) {
      throw new Error(`Jina Reader API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as JinaReaderResponse;

    if (data.code !== 200 || !data.data) {
      throw new Error(`Jina Reader returned error code: ${data.code}`);
    }

    return {
      url: data.data.url,
      title: data.data.title,
      content: data.data.content,
      contentType: "text/markdown",
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
  if (provider) {
    return new WebSearchToolServer(provider);
  }

  // Try to detect provider from environment variables (priority order)
  if (process.env.TAVILY_API_KEY) {
    return new WebSearchToolServer(new TavilyWebSearchProvider(process.env.TAVILY_API_KEY));
  }

  if (process.env.SERPER_API_KEY) {
    return new WebSearchToolServer(new SerperWebSearchProvider(process.env.SERPER_API_KEY));
  }

  // Fallback to Jina (free, no API key required)
  return new WebSearchToolServer(new JinaWebSearchProvider());
}
