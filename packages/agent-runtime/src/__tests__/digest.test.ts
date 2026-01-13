import type { DbDriver, FeedItemRow } from "@keepup/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types";
import { fetchItemsTool } from "../tools/digest";

// Mock ToolContext
function createMockContext(db: Partial<DbDriver>): ToolContext {
  return {
    services: {
      get: (name: string) => {
        if (name === "db") {
          return db;
        }
        return undefined;
      },
    } as unknown as ToolContext["services"],
    // Other context fields not needed for this tool
    security: {} as ToolContext["security"],
    permissions: {},
    traceId: "test-trace",
    agentId: "test-agent",
  };
}

describe("Digest Tools", () => {
  describe("fetchItemsTool", () => {
    let mockDb: Partial<DbDriver>;
    let context: ToolContext;

    beforeEach(() => {
      mockDb = {
        listFeedItems: vi.fn(),
      };
      context = createMockContext(mockDb);
    });

    it("should fetch unread items with default limit", async () => {
      const mockItems: FeedItemRow[] = [
        {
          id: "1",
          guid: "guid-1",
          title: "Test Item 1",
          contentHtml: "<p>Content 1</p>",
          subscriptionId: "sub-1",
          readState: "unread",
          createdAt: new Date(),
          updatedAt: new Date(),
          publishedAt: new Date(),
          saved: false,
        } as FeedItemRow,
      ];

      (mockDb.listFeedItems as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);

      const result = await fetchItemsTool.execute({ userId: "user-123" }, { context });

      expect(result.success).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content).toHaveLength(1);
      expect(content[0].title).toBe("Test Item 1");
      expect(content[0].guid).toBe("guid-1");

      expect(mockDb.listFeedItems).toHaveBeenCalledWith({
        readState: "unread",
        limit: 50, // Default
      });
    });

    it("should respect limit argument", async () => {
      (mockDb.listFeedItems as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await fetchItemsTool.execute({ userId: "user-123", limit: 10 }, { context });

      expect(mockDb.listFeedItems).toHaveBeenCalledWith({
        readState: "unread",
        limit: 10,
      });
    });

    it("should handle missing database service", async () => {
      const noDbContext = createMockContext(null as unknown as DbDriver);
      // Override get to return null for db
      // biome-ignore lint/suspicious/noExplicitAny: mocking private property in test
      (noDbContext.services.get as any) = () => null;

      const result = await fetchItemsTool.execute({ userId: "user-123" }, { context: noDbContext });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("should truncate long content", async () => {
      const longContent = "a".repeat(6000);
      const mockItems = [
        {
          id: "1",
          title: "Long Item",
          contentHtml: longContent,
          readState: "unread",
        },
      ] as FeedItemRow[];

      (mockDb.listFeedItems as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);

      const result = await fetchItemsTool.execute({ userId: "user-123" }, { context });

      const content = JSON.parse(result.content[0].text);
      expect(content[0].content.length).toBe(5000);
    });
  });
});
