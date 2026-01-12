import { describe, expect, it, vi } from "vitest";
import type { DbDriver } from "../driver/types";
import {
  createFileIngestor,
  createRssIngestor,
  createRssSourceRef,
  createUrlIngestor,
} from "../import/ingestors";

describe("Ingestors", () => {
  describe("URL Ingestor", () => {
    it("should ingest HTML content", async () => {
      const htmlContent = `
        <html>
          <head><title>Test Page</title></head>
          <body><p>Hello World</p></body>
        </html>
      `;
      // Mock fetch with arrayBuffer
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        arrayBuffer: async () => new TextEncoder().encode(htmlContent).buffer,
      });
      global.fetch = mockFetch;

      const ingestor = createUrlIngestor({ storeAsset: false });
      const onProgress = vi.fn();

      const result = await ingestor("https://example.com", onProgress);

      expect(result.title).toBe("Test Page");
      expect(result.contentHtml).toContain("Hello World");
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com", expect.any(Object));
    });

    it("should ingest Markdown content", async () => {
      const mdContent = "---\ntitle: MD Page\n---\n# Hello Markdown";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/markdown" },
        arrayBuffer: async () => new TextEncoder().encode(mdContent).buffer,
      });
      global.fetch = mockFetch;

      const ingestor = createUrlIngestor({ storeAsset: false });
      const onProgress = vi.fn();

      const result = await ingestor("https://example.com/test.md", onProgress);

      expect(result.title).toBe("MD Page");
      expect(result.contentMarkdown).toBe("# Hello Markdown");
      expect(onProgress).toHaveBeenCalledWith(100);
    });
  });

  describe("File Ingestor", () => {
    it("should ingest text file", async () => {
      // Use actual file ingestor - will use in-memory fallback in Node.js
      const { createFileIngestor, registerFile } = await import("../import/ingestors/fileIngestor");

      const file = new File(["# Test File Content"], "test.md", {
        type: "text/markdown",
        lastModified: 1234567890,
      });
      const sourceRef = await registerFile(file);

      const ingestor = createFileIngestor({ storeAsset: false });
      const onProgress = vi.fn();

      const result = await ingestor(sourceRef, onProgress);

      expect(result.title).toBe("test");
      expect(result.contentMarkdown).toBe("# Test File Content");
      expect(result.publishedAt).toBe(1234567890);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it("should throw for unknown file sourceRef", async () => {
      const ingestor = createFileIngestor({ storeAsset: false });
      await expect(ingestor("unknown-ref", vi.fn())).rejects.toThrow("File not found");
    });
  });

  describe("RSS Ingestor", () => {
    it("should ingest RSS item and fetch content URL", async () => {
      const mockDb = {} as DbDriver;
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        arrayBuffer: async () =>
          new TextEncoder().encode(`
          <html>
            <head><title>RSS Article</title></head>
            <body><p>Content from RSS</p></body>
          </html>
        `).buffer,
      });
      global.fetch = mockFetch;

      const ingestor = createRssIngestor({ db: mockDb, storeAsset: false });
      const onProgress = vi.fn();
      const sourceRef = createRssSourceRef("item-123", "feed-456", "https://example.com/article");

      const result = await ingestor(sourceRef, onProgress);

      expect(result.title).toBe("RSS Article");
      expect(result.contentHtml).toContain("Content from RSS");
      expect(result.canonicalUrl).toBe("https://example.com/article");
      expect(result.rawMetadata).toEqual({
        rssItemGuid: "item-123",
        rssFeedId: "feed-456",
        rssSourceRef: sourceRef,
      });
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/article", expect.any(Object));
    });
  });
});
