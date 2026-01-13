import type { DbDriver, FeedItemRow } from "@keepup/db/types";
/**
 * Digest Tool Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbDigestProvider, DigestToolServer } from "../tools/digest/digestToolServer";
import type { ToolContext } from "../types";

// Mock DbDriver
const mockDb = {
  listFeedItems: vi.fn(),
} as unknown as DbDriver;

describe("DigestToolServer", () => {
  let server: DigestToolServer;
  let provider: DbDigestProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DbDigestProvider(mockDb);
    server = new DigestToolServer(provider);
  });

  describe("fetchItems", () => {
    it("should fetch unread items within time window", async () => {
      const mockItems: FeedItemRow[] = [
        {
          itemId: "1",
          subscriptionId: "sub1",
          title: "Test Item 1",
          readState: "unread",
          publishedAt: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
          contentHtml: "Context",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as FeedItemRow,
        {
          itemId: "2",
          subscriptionId: "sub1",
          title: "Test Item 2",
          readState: "unread",
          publishedAt: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
          contentHtml: "Context",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as FeedItemRow,
      ];

      vi.mocked(mockDb.listFeedItems).mockResolvedValue(mockItems);

      const result = await server.callTool(
        { name: "fetchItems", arguments: { timeWindow: "24h", limit: 10 } },
        {
          security: { permissions: { network: "full" } },
        } as unknown as ToolContext
      );

      expect(mockDb.listFeedItems).toHaveBeenCalled();
      const contentItem = result.content[0];
      if (contentItem.type !== "text") {
        throw new Error("Expected text result");
      }
      const content = JSON.parse(contentItem.text);

      expect(content).toHaveLength(1);
      expect(content[0].id).toBe("1");
    });

    it("should handle empty results", async () => {
      vi.mocked(mockDb.listFeedItems).mockResolvedValue([]);

      const result = await server.callTool(
        { name: "fetchItems", arguments: { timeWindow: "24h" } },
        {
          security: { permissions: { network: "full" } },
        } as unknown as ToolContext
      );

      const contentItem = result.content[0];
      if (contentItem.type !== "text") {
        throw new Error("Expected text result");
      }
      const content = JSON.parse(contentItem.text);
      expect(content).toEqual([]);
    });
  });

  describe("clusterItems", () => {
    it("should return placeholder message", async () => {
      const result = await server.callTool(
        { name: "clusterItems", arguments: { itemIds: ["1", "2"] } },
        {} as unknown as ToolContext
      );
      const contentItem = result.content[0];
      if (contentItem.type !== "text") {
        throw new Error("Expected text result");
      }
      const content = JSON.parse(contentItem.text);
      expect(content.message).toContain("not yet implemented");
    });
  });
});
