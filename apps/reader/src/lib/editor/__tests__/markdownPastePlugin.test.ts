import { describe, expect, it } from "vitest";

import { looksLikeMarkdown } from "../markdownPastePlugin";

describe("looksLikeMarkdown", () => {
  it("detects single-line task lists", () => {
    expect(looksLikeMarkdown("- [ ] Buy milk")).toBe(true);
    expect(looksLikeMarkdown("- [x] Done")).toBe(true);
  });

  it("detects single-line list patterns", () => {
    expect(looksLikeMarkdown("- Item")).toBe(true);
    expect(looksLikeMarkdown("1. Item")).toBe(true);
  });

  it("detects single-line code fences", () => {
    expect(looksLikeMarkdown("```ts")).toBe(true);
  });

  it("detects multi-line lists with multiple markers", () => {
    const text = "- First\n- Second";
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it("does not over-detect inline formatting alone", () => {
    expect(looksLikeMarkdown("*italic*")).toBe(false);
    expect(looksLikeMarkdown("plain text only")).toBe(false);
  });
});
