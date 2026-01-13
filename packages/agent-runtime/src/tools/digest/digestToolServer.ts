/**
 * Digest Tool Server
 *
 * Provides specialized tools for the DigestAgent to fetch and process feed items.
 */

import type { DbDriver, FeedItemRow } from "@keepup/db";
import type { MCPTool, MCPToolResult, ToolContext } from "../../types";
import { BaseToolServer, errorResult, textResult } from "../mcp/baseServer";

// ============================================================================
// Digest Provider Interface
// ============================================================================

export interface IDigestProvider {
  /** Fetch unread items for digest generation */
  fetchUnreadItems(limit: number): Promise<FeedItemRow[]>;

  /** Fetch items from a specific time window */
  fetchItemsByWindow(hours: number, limit: number): Promise<FeedItemRow[]>;
}

/**
 * DB-backed Digest Provider
 */
export class DbDigestProvider implements IDigestProvider {
  constructor(private db: DbDriver) {}

  async fetchUnreadItems(limit: number): Promise<FeedItemRow[]> {
    return this.db.listFeedItems({
      readState: "unread",
      limit,
      orderBy: "publishedAt",
      order: "desc",
    });
  }

  async fetchItemsByWindow(hours: number, limit: number): Promise<FeedItemRow[]> {
    const since = Date.now() - hours * 60 * 60 * 1000;
    // Note: DbDriver listFeedItems might not support filtering by time directly in options
    // so we fetch recently added and filter in memory if needed, or rely on limit.
    // Assuming simple fetch for now.
    const items = await this.db.listFeedItems({
      limit: limit * 2, // Fetch more to account for filtering
      orderBy: "publishedAt",
      order: "desc",
    });

    return items.filter((item: FeedItemRow) => (item.publishedAt ?? 0) > since).slice(0, limit);
  }
}

// ============================================================================
// Digest Tool Server
// ============================================================================

export class DigestToolServer extends BaseToolServer {
  readonly name = "digest";
  readonly description = "Tools for generating content digests";

  constructor(private provider: IDigestProvider) {
    super();
    this.registerTool(this.createFetchItemsTool(), this.handleFetchItems.bind(this));
    this.registerTool(this.createClusterItemsTool(), this.handleClusterItems.bind(this));
  }

  private createFetchItemsTool(): MCPTool {
    return {
      name: "fetchItems",
      description: "Fetch unread feed items for digest generation.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of items to fetch (default: 50)",
          },
          timeWindow: {
            type: "string",
            description: "Time window to fetch (e.g. '24h', '48h'). Defaults to 24h.",
          },
          includeRead: {
            type: "boolean",
            description: "Whether to include already read items",
          },
        },
      },
    };
  }

  private createClusterItemsTool(): MCPTool {
    return {
      name: "clusterItems",
      description: "Cluster feed items by semantic similarity (placeholder).",
      inputSchema: {
        type: "object",
        properties: {
          itemIds: {
            type: "array",
            items: { type: "string" },
            description: "List of item IDs to cluster",
          },
        },
        required: ["itemIds"],
      },
    };
  }

  private async handleFetchItems(
    args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    const limit = (args.limit as number) || 50;
    const timeWindow = (args.timeWindow as string) || "24h";
    const hours = Number.parseInt(timeWindow.replace("h", ""), 10) || 24;

    try {
      const items = await this.provider.fetchItemsByWindow(hours, limit);

      // Format as simplified JSON for the agent to consume
      const simplifiedItems = items.map((item) => ({
        id: item.itemId,
        title: item.title,
        source: item.subscriptionId, // In real app, would map to source name
        published: item.publishedAt ? new Date(item.publishedAt).toISOString() : "Unknown",
        snippet: item.excerpt?.slice(0, 200),
      }));

      return textResult(JSON.stringify(simplifiedItems, null, 2));
    } catch (err) {
      return errorResult(
        "EXECUTION_FAILED",
        `Failed to fetch items: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async handleClusterItems(
    _args: Record<string, unknown>,
    _context: ToolContext
  ): Promise<MCPToolResult> {
    // Placeholder implementation
    // In a real implementation, this would call ai-core embedding service
    return textResult(
      JSON.stringify({
        message: "Clustering not yet implemented - returning simple list",
        clusters: [],
      })
    );
  }
}

/**
 * Create a digest tool server.
 */
export function createDigestToolServer(provider: IDigestProvider): DigestToolServer {
  return new DigestToolServer(provider);
}
