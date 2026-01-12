import { LoroDoc, getMetaMap, readBlockTree } from "@keepup/lfcc-bridge";
import { describe, expect, it } from "vitest";
import { NormalizationService } from "../import/normalization";
import type { IngestResult } from "../import/types";

describe("NormalizationService", () => {
  it("should normalize ingest result to content result with CRDT update", () => {
    const service = new NormalizationService();
    const result: IngestResult = {
      title: "Test Page",
      contentMarkdown: "# Hello World",
      contentHash: "abc12345",
      canonicalUrl: "https://example.com/test",
      author: "Test Author",
      publishedAt: 1234567890,
      rawMetadata: { foo: "bar" },
    };

    const contentResult = service.normalize(result);

    expect(contentResult.title).toBe("Test Page");
    expect(contentResult.textContent).toBe("# Hello World");
    expect(contentResult.metadata.author).toBe("Test Author");
    expect(contentResult.metadata.sourceUrl).toBe("https://example.com/test");
    expect(contentResult.crdtUpdate).toBeInstanceOf(Uint8Array);

    // Verify CRDT snapshot content
    const doc = new LoroDoc();
    doc.import(contentResult.crdtUpdate);
    const blocks = readBlockTree(doc);
    expect(blocks[0]?.text).toBe("Hello World");

    const meta = getMetaMap(doc);
    expect(meta.get("title")).toBe("Test Page");
    expect(meta.get("author")).toBe("Test Author");
  });

  it("should fallback to html content if markdown is missing", () => {
    const service = new NormalizationService();
    const result: IngestResult = {
      title: "HTML Page",
      contentHtml: "<p>Hello HTML</p>",
      contentHash: "xyz789",
    };

    const contentResult = service.normalize(result);
    expect(contentResult.textContent).toBe("<p>Hello HTML</p>");
  });
});
