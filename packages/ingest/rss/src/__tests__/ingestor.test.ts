import { afterEach, describe, expect, it, vi } from "vitest";
import { RSSFetcher } from "../fetcher";
import { RSSIngestor } from "../index";
import { RSSParser } from "../parser";

describe("RSSIngestor.fetchFeedItems", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes by stable id before returning items", async () => {
    vi.spyOn(RSSFetcher, "fetchWithConditional").mockResolvedValue({
      content: "<rss></rss>",
      modified: true,
      etag: "etag-1",
      lastModified: "Tue, 01 Jan 2024 00:00:00 GMT",
      durationMs: 12,
    });
    vi.spyOn(RSSParser.prototype, "parse").mockResolvedValue([
      { guid: "g-1", link: "https://example.com/1", title: "One" },
      { guid: "g-1", link: "https://example.com/1", title: "One (dupe)" },
    ]);

    const ingestor = new RSSIngestor();
    const result = await ingestor.fetchFeedItems({ url: "https://example.com/feed" });

    expect(result.modified).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it("skips parsing when feed is not modified", async () => {
    vi.spyOn(RSSFetcher, "fetchWithConditional").mockResolvedValue({
      content: "",
      modified: false,
      etag: "etag-2",
      lastModified: "Tue, 01 Jan 2024 00:00:00 GMT",
      durationMs: 4,
    });
    const parseSpy = vi.spyOn(RSSParser.prototype, "parse");

    const ingestor = new RSSIngestor();
    const result = await ingestor.fetchFeedItems({ url: "https://example.com/feed" });

    expect(result.modified).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(parseSpy).not.toHaveBeenCalled();
  });
});
