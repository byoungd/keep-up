/**
 * Atomic Adapter Unit Tests
 */

import { describe, expect, it } from "vitest";
import { YouTubeAtomicAdapter } from "../atomicAdapter";
import type { YouTubeSource, YouTubeTranscriptResult } from "../types";

const mockResult: YouTubeTranscriptResult = {
  metadata: {
    videoId: "dQw4w9WgXcQ",
    title: "Test Video Title",
    author: "Test Author",
    thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  },
  fullText: "First paragraph.\n\nSecond paragraph.",
  paragraphs: [
    { text: "First paragraph.", startTime: 0, endTime: 5 },
    { text: "Second paragraph.", startTime: 5, endTime: 10 },
  ],
  segments: [
    { text: "First paragraph.", offset: 0, duration: 5 },
    { text: "Second paragraph.", offset: 5, duration: 5 },
  ],
  language: "en",
  totalDuration: 10,
  wordCount: 4,
};

const mockSource: YouTubeSource = {
  url: "https://youtu.be/dQw4w9WgXcQ",
};

describe("YouTubeAtomicAdapter", () => {
  describe("toIngestionMeta", () => {
    it("creates IngestionMeta with correct title", () => {
      const meta = YouTubeAtomicAdapter.toIngestionMeta(mockResult, mockSource);

      expect(meta.title).toBe("Test Video Title");
    });

    it("creates IngestionMeta with full text as content", () => {
      const meta = YouTubeAtomicAdapter.toIngestionMeta(mockResult, mockSource);

      expect(meta.content).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("creates IngestionMeta with youtube sourceId", () => {
      const meta = YouTubeAtomicAdapter.toIngestionMeta(mockResult, mockSource);

      expect(meta.sourceId).toBe("youtube:dQw4w9WgXcQ");
    });

    it("handles missing title gracefully", () => {
      const resultWithoutTitle: YouTubeTranscriptResult = {
        ...mockResult,
        metadata: {
          ...mockResult.metadata,
          title: "",
        },
      };

      const meta = YouTubeAtomicAdapter.toIngestionMeta(resultWithoutTitle, mockSource);

      expect(meta.title).toBe("YouTube Video");
    });
  });

  describe("toIngestionMetaWithAuthor", () => {
    it("includes author in title", () => {
      const meta = YouTubeAtomicAdapter.toIngestionMetaWithAuthor(mockResult, mockSource);

      expect(meta.title).toBe("Test Video Title — Test Author");
    });

    it("skips author if Unknown", () => {
      const resultWithUnknownAuthor: YouTubeTranscriptResult = {
        ...mockResult,
        metadata: {
          ...mockResult.metadata,
          author: "Unknown",
        },
      };

      const meta = YouTubeAtomicAdapter.toIngestionMetaWithAuthor(
        resultWithUnknownAuthor,
        mockSource
      );

      expect(meta.title).toBe("Test Video Title");
    });
  });
});
