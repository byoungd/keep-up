/**
 * Paragraph Grouper Unit Tests
 */

import { describe, expect, it } from "vitest";
import { countWords, formatTimestamp, groupIntoParagraphs } from "../paragraphGrouper";
import type { TranscriptSegment } from "../types";

describe("groupIntoParagraphs", () => {
  it("returns empty array for empty input", () => {
    expect(groupIntoParagraphs([])).toEqual([]);
  });

  it("groups segments into single paragraph when no gaps", () => {
    const segments: TranscriptSegment[] = [
      { text: "Hello", offset: 0, duration: 1 },
      { text: "world", offset: 1, duration: 1 },
      { text: "test", offset: 2, duration: 1 },
    ];

    const result = groupIntoParagraphs(segments);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello world test");
    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(3);
  });

  it("splits paragraphs on time gaps > 2 seconds", () => {
    const segments: TranscriptSegment[] = [
      {
        text: "First sentence that is definitely long enough to meet the minimum paragraph length threshold",
        offset: 0,
        duration: 2,
      },
      {
        text: "Second sentence after a long pause should be in separate paragraph",
        offset: 5,
        duration: 2,
      },
    ];

    const result = groupIntoParagraphs(segments);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe(
      "First sentence that is definitely long enough to meet the minimum paragraph length threshold"
    );
    expect(result[1].text).toBe(
      "Second sentence after a long pause should be in separate paragraph"
    );
  });

  it("does not split on small gaps when paragraph is short", () => {
    const segments: TranscriptSegment[] = [
      { text: "Short", offset: 0, duration: 1 },
      { text: "text", offset: 4, duration: 1 }, // 3 second gap but short text
    ];

    const result = groupIntoParagraphs(segments);

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Short text");
  });

  it("splits paragraphs when text exceeds max length", () => {
    const longText = "word ".repeat(150).trim(); // ~750 chars
    const segments: TranscriptSegment[] = [
      { text: longText, offset: 0, duration: 60 },
      { text: "next", offset: 60, duration: 1 },
    ];

    const result = groupIntoParagraphs(segments);

    expect(result).toHaveLength(2);
  });

  it("preserves timing across multiple paragraphs", () => {
    const segments: TranscriptSegment[] = [
      { text: "First paragraph with enough content to meet minimum", offset: 0, duration: 5 },
      { text: "Second paragraph after gap", offset: 10, duration: 5 },
    ];

    const result = groupIntoParagraphs(segments);

    expect(result[0].startTime).toBe(0);
    expect(result[0].endTime).toBe(5);
    expect(result[1].startTime).toBe(10);
    expect(result[1].endTime).toBe(15);
  });
});

describe("formatTimestamp", () => {
  it("formats seconds as M:SS", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(599)).toBe("9:59");
  });

  it("formats hours as H:MM:SS", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3665)).toBe("1:01:05");
    expect(formatTimestamp(7265)).toBe("2:01:05");
  });

  it("handles fractional seconds", () => {
    expect(formatTimestamp(65.7)).toBe("1:05");
  });
});

describe("countWords", () => {
  it("counts words correctly", () => {
    const paragraphs = [
      { text: "Hello world", startTime: 0, endTime: 1 },
      { text: "This is a test", startTime: 1, endTime: 2 },
    ];

    expect(countWords(paragraphs)).toBe(6);
  });

  it("returns 0 for empty input", () => {
    expect(countWords([])).toBe(0);
  });

  it("handles multiple spaces", () => {
    const paragraphs = [{ text: "Hello   world", startTime: 0, endTime: 1 }];

    expect(countWords(paragraphs)).toBe(2);
  });
});
