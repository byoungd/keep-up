import { describe, expect, it } from "vitest";
import { sanitizeMarkdown } from "../useChatPersistence";

// applyRetention test removed as retention is temporarily disabled during migration
// describe("applyRetention", () => {
//   it("trims blocks when exceeding retention limits", () => {
//     // Legacy test removed
//   });
// });

describe("sanitizeMarkdown", () => {
  it("strips script tags and unsafe links", () => {
    const input = "<script>alert(1)</script> [x](javascript:alert(1))";
    const output = sanitizeMarkdown(input);
    expect(output).not.toContain("script");
    expect(output).toContain("(#)");
  });
});
