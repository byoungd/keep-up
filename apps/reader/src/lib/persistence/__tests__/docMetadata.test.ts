import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createImportedDocMetadata, createLocalDocMetadata } from "../docMetadata";

describe("DocMetadata", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createLocalDocMetadata", () => {
    it("creates metadata with default title", () => {
      const meta = createLocalDocMetadata("doc-123");

      expect(meta).toEqual({
        id: "doc-123",
        title: "Untitled",
        sourceType: "local",
        sourceUrl: null,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        importStatus: "imported",
      });
      expect(meta.createdAt).toBe(meta.updatedAt);
    });

    it("creates metadata with custom title", () => {
      const meta = createLocalDocMetadata("doc-456", "My Document");

      expect(meta.title).toBe("My Document");
      expect(meta.sourceType).toBe("local");
    });
  });

  describe("createImportedDocMetadata", () => {
    it("creates metadata for GitHub import", () => {
      const meta = createImportedDocMetadata(
        "doc-gh-1",
        "README.md",
        "github",
        "https://github.com/user/repo/blob/main/README.md"
      );

      expect(meta).toEqual({
        id: "doc-gh-1",
        title: "README.md",
        sourceType: "github",
        sourceUrl: "https://github.com/user/repo/blob/main/README.md",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        importStatus: "pending",
      });
    });

    it("creates metadata for RSS import", () => {
      const meta = createImportedDocMetadata(
        "doc-rss-1",
        "Article Title",
        "rss",
        "https://example.com/feed/article-1"
      );

      expect(meta.sourceType).toBe("rss");
      expect(meta.importStatus).toBe("pending");
    });
  });
});
