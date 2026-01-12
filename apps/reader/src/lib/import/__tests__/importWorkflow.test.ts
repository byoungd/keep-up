import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock DOMParser for RSS tests (since environment is node)
class MockDOMParser {
  parseFromString(str: string, _type: string) {
    // Simple mock to return traversable XML-like structure
    return new MockDocument(str);
  }
}

class MockElement {
  constructor(
    public tagName: string,
    public textContent = ""
  ) {}

  querySelector(selector: string): MockElement | null {
    if (selector === "title" && this.tagName === "channel") {
      return new MockElement("title", "Test Feed");
    }
    if (selector === "title" && this.tagName === "item") {
      return new MockElement("title", "Test Item");
    }
    if (selector === "link") {
      return new MockElement("link", "https://example.com/item");
    }
    if (selector === "guid") {
      return new MockElement("guid", "https://example.com/item");
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    if (selector === "item" && this.tagName === "channel") {
      return [new MockElement("item")];
    }
    return [];
  }
}

class MockDocument {
  constructor(private content: string) {}

  querySelector(selector: string): MockElement | null {
    if (selector === "parsererror" && this.content.includes("error")) {
      return new MockElement("parsererror");
    }
    if (selector === "channel" && this.content.includes("<rss")) {
      return new MockElement("channel");
    }
    return null;
  }
}

global.DOMParser = MockDOMParser as unknown as typeof DOMParser;

// Mock dependencies
vi.mock("loro-crdt", () => ({
  LoroDoc: class {
    export() {
      return new Uint8Array([]);
    }
  },
}));

vi.mock("@/lib/persistence/docPersistence", () => ({
  docPersistence: {
    saveDoc: vi.fn(),
    saveMetadata: vi.fn(),
  },
}));

import { importRssFeed } from "../importFromRss";
// Import modules under test
import { importFromUrl } from "../importFromUrl";

describe("Import Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("importFromUrl", () => {
    it("successfully imports content from URL", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "Test content",
        headers: new Headers(),
      });

      const result = await importFromUrl("https://example.com/test.md", "url");

      expect(fetchMock).toHaveBeenCalledWith("https://example.com/test.md", expect.any(Object));
      expect(result.metadata.title).toBe("test");
      expect(result.metadata.sourceUrl).toBe("https://example.com/test.md");
      expect(result.docId).toBeDefined();
    });

    it("throws error on network failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(importFromUrl("https://example.com/missing", "url")).rejects.toThrow(
        "Failed to fetch: 404 Not Found"
      );
    });
  });

  describe("importRssFeed", () => {
    it("successfully parses and imports RSS feed", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "<rss><channel><item><title>Test</title></item></channel></rss>",
        headers: new Headers(),
      });

      const results = await importRssFeed("https://example.com/feed.xml");

      expect(results).toHaveLength(1);
      expect(results[0].metadata.title).toBe("Test Item");
      expect(results[0].metadata.sourceType).toBe("rss");
    });

    it("handles invalid XML", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => "<error>",
        headers: new Headers(),
      });

      // The mock DOMParser is set to return parsererror if content includes "error"
      await expect(importRssFeed("https://example.com/feed.xml")).rejects.toThrow(
        "Invalid XML feed"
      );
    });
  });
});
