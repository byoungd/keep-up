import type { DbDriver, FeedItemRow } from "@keepup/db";
import { z } from "zod";
import type { ITool, ToolCallResponse } from "../../mcp/registry";

/**
 * Tool for fetching unread items for digest generation.
 */
export const fetchItemsTool: ITool = {
  name: "digest:fetch_items",
  description:
    "Fetch unread feed items for a user within a specific time window. Use this to gather content for generating a digest.",
  inputSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "The ID of the user to fetch items for",
      },
      timeWindow: {
        type: "string",
        description: "Time window ISO string (e.g. '24h', '7d', or specific date)",
        // Note: simplified for this implementation, ideally supports '24h' etc.
        // For now let's assume the caller handles date parsing or we add it later.
        // Actually, let's keep it simple: DbDriver.listFeedItems just takes filters.
        // We'll map 'limit' and 'readState' mostly.
      },
      limit: {
        type: "number",
        description: "Maximum number of items to fetch",
        default: 50,
      },
    },
    required: ["userId"],
  },
  execute: async (input: unknown, { context }): Promise<ToolCallResponse> => {
    const schema = z.object({
      userId: z.string(),
      timeWindow: z.string().optional(),
      limit: z.number().optional().default(50),
    });

    const { limit } = schema.parse(input);
    const db = context.services.get<DbDriver>("db");

    if (!db) {
      return {
        success: false,
        content: [{ type: "text", text: "Database service not available" }],
        error: { code: "SERVICE_UNAVAILABLE", message: "Database service not available" },
      };
    }

    // Fetch unread items
    const items = await db.listFeedItems({
      readState: "unread",
      limit,
    });

    // Format for the agent
    const formattedItems = items.map((item: FeedItemRow) => ({
      guid: item.guid,
      title: item.title,
      // We limit content size to avoid context overflow, or maybe we just return snippets?
      // For a digest, we probably want the content or at least a good chunk.
      // Let's truncate contentHtml if it's huge, or strip tags.
      content: item.contentHtml
        ? item.contentHtml.slice(0, 5000) // Rough cap
        : item.excerpt || "",
      source: item.subscriptionId,
      publishedAt: item.publishedAt,
    }));

    return {
      success: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(formattedItems, null, 2),
        },
      ],
    };
  },
};

/**
 * Server definition for Digest tools.
 */
export const DigestToolServer = {
  name: "digest-tools",
  version: "1.0.0",
  tools: [fetchItemsTool],
};

export function createDigestToolServer() {
  return DigestToolServer;
}
