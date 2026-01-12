import { describe, expect, it, vi } from "vitest";
import { createYouTubeIngestor } from "../import/ingestors/youtubeIngestor";

// Mock @packages/ingest-youtube
vi.mock("@packages/ingest-youtube", () => {
  return {
    YouTubeIngestor: class {
      getTranscript() {
        return Promise.resolve({
          metadata: {
            videoId: "VIDEO_ID",
            title: "Test Video",
            author: "Test Channel",
            thumbnails: { maxres: { url: "thumb.jpg" } },
            viewCount: 1000,
          },
          paragraphs: [
            { text: "Hello world", startTime: 0, endTime: 2 },
            { text: "This is a test", startTime: 2, endTime: 5 },
          ],
          totalDuration: 5,
          wordCount: 50,
        });
      }
    },
  };
});

describe("YouTube Ingestor", () => {
  it("should ingest transcript", async () => {
    const ingestor = createYouTubeIngestor();
    const onProgress = vi.fn();

    const result = await ingestor("https://youtu.be/VIDEO_ID", onProgress);

    expect(result.title).toBe("Test Video");
    expect(result.author).toBe("Test Channel");
    expect(result.contentHtml).toContain('<p data-start="0" data-duration="2">Hello world</p>');
    expect(result.contentMarkdown).toContain("> Hello world");
    expect(result.rawMetadata?.youtubeId).toBe("VIDEO_ID");
    expect(result.contentHash).toBe("yt_VIDEO_ID");
    expect(onProgress).toHaveBeenCalledWith(100);
  });
});
