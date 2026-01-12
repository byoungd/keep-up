/**
 * URL Parser Unit Tests
 */

import { describe, expect, it } from "vitest";
import { buildTimestampedUrl, buildWatchUrl, extractVideoId, isValidVideoId } from "../urlParser";

describe("extractVideoId", () => {
  it("extracts ID from standard watch URL", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from watch URL without www", () => {
    expect(extractVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from short youtu.be URL", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from embed URL", () => {
    expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from shorts URL", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from plain video ID", () => {
    expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("handles URL with extra parameters", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("handles URL with whitespace", () => {
    expect(extractVideoId("  https://youtu.be/dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for invalid URLs", () => {
    expect(extractVideoId("https://example.com")).toBeNull();
    expect(extractVideoId("not-a-url")).toBeNull();
    expect(extractVideoId("")).toBeNull();
  });

  it("returns null for invalid video ID length", () => {
    expect(extractVideoId("https://youtu.be/short")).toBeNull();
    expect(extractVideoId("https://youtu.be/wayTooLongVideoId")).toBeNull();
  });
});

describe("isValidVideoId", () => {
  it("returns true for valid video IDs", () => {
    expect(isValidVideoId("dQw4w9WgXcQ")).toBe(true);
    expect(isValidVideoId("abcdefghijk")).toBe(true);
    expect(isValidVideoId("123456789ab")).toBe(true);
    expect(isValidVideoId("a_b-c_d-e_f")).toBe(true);
  });

  it("returns false for invalid video IDs", () => {
    expect(isValidVideoId("")).toBe(false);
    expect(isValidVideoId("short")).toBe(false);
    expect(isValidVideoId("wayTooLongVideoId")).toBe(false);
    expect(isValidVideoId("invalid!char")).toBe(false);
  });
});

describe("buildWatchUrl", () => {
  it("builds correct watch URL", () => {
    expect(buildWatchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});

describe("buildTimestampedUrl", () => {
  it("builds URL with timestamp", () => {
    expect(buildTimestampedUrl("dQw4w9WgXcQ", 120)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s"
    );
  });

  it("floors fractional seconds", () => {
    expect(buildTimestampedUrl("dQw4w9WgXcQ", 120.7)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s"
    );
  });
});
