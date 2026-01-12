import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../markdownToHtml";

describe("markdownToHtml", () => {
  describe("multi-line list items", () => {
    it("should handle ordered list with multi-line items", () => {
      const markdown = `## Steps
1. Added \`ResiliencePipeline\` and \`ResilientProvider\` in \`@keepup/ai-core\`, with request
   signals and embedding cache support.
2. Refactored OpenAI/Anthropic providers to use shared timeout/signal helpers and
   removed internal retry coupling.
3. Updated \`ProviderRouter\` to accept injectable logger/selector and fixed queue pause handling.
4. Updated the collab-server AI gateway to build per-provider pipelines with defaults
   and enable embedding cache and queue backpressure.`;

      const html = markdownToHtml(markdown);

      // Should have exactly one <ol> with 4 <li> items
      expect(html).toContain("<h2>Steps</h2>");
      expect(html).toContain("<ol>");
      expect(html).toContain("</ol>");

      // Count list items - should be exactly 4
      const liCount = (html.match(/<li>/g) || []).length;
      expect(liCount).toBe(4);

      // Each list item should contain the full content including continuation
      expect(html).toContain("signals and embedding cache support");
      expect(html).toContain("removed internal retry coupling");
      expect(html).toContain("enable embedding cache and queue backpressure");

      // Should NOT have continuation lines as separate paragraphs
      expect(html).not.toMatch(/<p>\s*signals and embedding cache support/);
      expect(html).not.toMatch(/<p>\s*removed internal retry coupling/);
    });

    it("should handle unordered list with multi-line items", () => {
      const markdown = `- First item that spans
  multiple lines here
- Second item also
  continues on next line`;

      const html = markdownToHtml(markdown);

      const liCount = (html.match(/<li>/g) || []).length;
      expect(liCount).toBe(2);

      // Continuation should be part of the list item
      expect(html).toContain("multiple lines here");
      expect(html).toContain("continues on next line");
    });

    it("should handle single-line list items correctly", () => {
      const markdown = `1. First item
2. Second item
3. Third item`;

      const html = markdownToHtml(markdown);

      expect(html).toContain("<ol>");
      const liCount = (html.match(/<li>/g) || []).length;
      expect(liCount).toBe(3);
    });

    it("should preserve inline code in multi-line list items", () => {
      const markdown = `1. Added \`ResiliencePipeline\` and \`ResilientProvider\` in \`@keepup/ai-core\`, with request
   signals and embedding cache support.`;

      const html = markdownToHtml(markdown);

      expect(html).toContain("<code>ResiliencePipeline</code>");
      expect(html).toContain("<code>ResilientProvider</code>");
      expect(html).toContain("<code>@keepup/ai-core</code>");
      expect(html).toContain("signals and embedding cache support");
    });
  });

  describe("basic markdown", () => {
    it("should convert headings", () => {
      expect(markdownToHtml("# H1")).toContain("<h1>H1</h1>");
      expect(markdownToHtml("## H2")).toContain("<h2>H2</h2>");
      expect(markdownToHtml("### H3")).toContain("<h3>H3</h3>");
    });

    it("should convert inline code", () => {
      const html = markdownToHtml("Use `const` instead of `var`");
      expect(html).toContain("<code>const</code>");
      expect(html).toContain("<code>var</code>");
    });

    it("should convert bold and italic", () => {
      expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
      expect(markdownToHtml("*italic*")).toContain("<em>italic</em>");
    });
  });
});
