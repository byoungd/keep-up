import { describe, expect, it } from "vitest";
import { RSSNormalizer } from "../normalizer";

describe("RSSNormalizer", () => {
  it("normalizes URLs by lowercasing host and removing trailing slashes", () => {
    expect(RSSNormalizer.normalizeUrl("https://Example.com/Path/")).toBe(
      "https://example.com/Path"
    );
  });

  it("preserves query strings during normalization", () => {
    expect(RSSNormalizer.normalizeUrl("https://example.com/path?x=1&y=2")).toBe(
      "https://example.com/path?x=1&y=2"
    );
  });

  it("matches URLs with normalized forms", () => {
    expect(
      RSSNormalizer.isUrlMatch("https://example.com/path/", "https://example.com/path?x=1")
    ).toBe(true);

    // Scheme-insensitive match
    expect(RSSNormalizer.isUrlMatch("http://example.com/path", "https://example.com/path")).toBe(
      true
    );
  });

  it("cleans content by trimming outer whitespace", () => {
    expect(RSSNormalizer.cleanContent("  hello world \n")).toBe("hello world");
  });
});
