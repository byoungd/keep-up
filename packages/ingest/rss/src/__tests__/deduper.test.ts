import { describe, expect, it, vi } from "vitest";
import { dedupeRssItems } from "../deduper";
import { RSSIngestor } from "../index";
import type { RSSItem } from "../types";

const SAMPLE_XML = `
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>First Post</title>
      <link>http://example.com/one</link>
      <guid>abc</guid>
      <description>short</description>
    </item>
    <item>
      <title>First Post</title>
      <link>http://example.com/one</link>
      <guid>abc</guid>
      <description>This is the longer body that should win.</description>
    </item>
  </channel>
</rss>
`;

vi.mock("../fetcher", () => {
  return {
    RSSFetcher: {
      fetchWithConditional: vi.fn(async () => ({
        content: SAMPLE_XML,
        modified: true,
        etag: "etag-1",
        lastModified: "Fri, 01 Jan 2021 00:00:00 GMT",
        durationMs: 42,
      })),
    },
  };
});

describe("dedupeRssItems", () => {
  it("prefers longer content when stable id duplicates", () => {
    const items: RSSItem[] = [
      { guid: "g1", link: "http://x.com/a", title: "Hello", description: "short" },
      {
        guid: "g1",
        link: "http://x.com/a",
        title: "Hello",
        description: "much longer content body here",
      },
    ];

    const result = dedupeRssItems(items);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toContain("longer");
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toBe("stable_id");
  });

  it("dedupes by normalized title + content hash when no stable id", () => {
    const items: RSSItem[] = [
      { title: "Same Title!", description: "Alpha body" },
      { title: "same   title", description: "Alpha body" },
      { title: "Different", description: "Beta" },
    ];

    const result = dedupeRssItems(items);
    expect(result.items).toHaveLength(2);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toBe("title_content");
  });
});

describe("RSSIngestor.fetchFeedWithStats", () => {
  it("returns stats, deduped metas, mapped items, and fetch metadata", async () => {
    const ingestor = new RSSIngestor();
    const report = await ingestor.fetchFeedWithStats({ url: "http://example.com/feed" });

    expect(report.fetch.modified).toBe(true);
    expect(report.fetch.etag).toBe("etag-1");
    expect(report.fetch.durationMs).toBe(42);

    expect(report.stats.raw.totalItems).toBe(2);
    expect(report.stats.deduped.totalItems).toBe(1);
    expect(report.metas).toHaveLength(1);
    expect(report.items).toHaveLength(1);
    expect(report.duplicates).toHaveLength(1);
    expect(report.quality.passed).toBe(false);
    expect(report.quality.reasons).toEqual(["snippet_ratio_exceeded"]);
  });
});
