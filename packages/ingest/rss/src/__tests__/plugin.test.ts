import { describe, expect, it } from "vitest";
import { RSSNormalizer } from "../normalizer";
import { createRssPlugin } from "../plugin";
import type { FeedSource } from "../types";

describe("RSS plugin", () => {
  it("returns ingestion meta via atomic adapter", async () => {
    const plugin = createRssPlugin({
      fetch: async () => "<rss></rss>",
      parse: async () => [
        {
          title: "Hello",
          content: "  First item  ",
          guid: "guid-1",
        },
        {
          title: "Second",
          content: "Second item",
          link: "https://example.com/second",
        },
      ],
    });

    const source: FeedSource = { url: "https://example.com/feed" };
    const metas = await plugin.fetch(source);

    const expectedGuidId = RSSNormalizer.generateStableId("", "guid-1");
    const expectedLinkId = RSSNormalizer.generateStableId("https://example.com/second");

    expect(metas).toEqual([
      { title: "Hello", content: "First item", sourceId: expectedGuidId },
      { title: "Second", content: "Second item", sourceId: expectedLinkId },
    ]);
  });
});
