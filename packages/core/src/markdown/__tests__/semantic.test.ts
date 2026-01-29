import { describe, expect, it } from "vitest";
import {
  buildMarkdownSemanticIndex,
  type MarkdownPreconditionV1,
  resolveMarkdownSemanticTarget,
} from "../index.js";

function resolveSemantic(
  content: string,
  semantic: MarkdownPreconditionV1["semantic"],
  maxLines?: number
) {
  const lines = content.split("\n");
  const index = buildMarkdownSemanticIndex(lines);
  return resolveMarkdownSemanticTarget(
    semantic,
    index,
    maxLines ? { max_semantic_search_lines: maxLines } : undefined
  );
}

describe("Markdown semantic targeting", () => {
  it("resolves headings by exact text and prefix", () => {
    const content = "# Getting Started\n\nInstall\n-----";
    const index = buildMarkdownSemanticIndex(content.split("\n"));

    const exact = resolveMarkdownSemanticTarget(
      { kind: "heading", heading_text: "Getting Started" },
      index
    );
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.range).toEqual({ start: 1, end: 1 });
    }

    const prefix = resolveMarkdownSemanticTarget(
      { kind: "heading", heading_text: "Install", heading_text_mode: "prefix" },
      index
    );
    expect(prefix.ok).toBe(true);
    if (prefix.ok) {
      expect(prefix.range).toEqual({ start: 3, end: 4 });
    }
  });

  it("resolves code fences scoped by after_heading", () => {
    const content = [
      "## Examples",
      "```ts",
      "const a = 1",
      "```",
      "",
      "## Other",
      "```js",
      "console.log(1)",
      "```",
    ].join("\n");

    const result = resolveSemantic(content, {
      kind: "code_fence",
      language: "ts",
      after_heading: "Examples",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range).toEqual({ start: 2, end: 4 });
    }
  });

  it("resolves inner line ranges inside code fences", () => {
    const content = ["```ts", "const a = 1", "const b = 2", "```"].join("\n");
    const result = resolveSemantic(content, {
      kind: "code_fence",
      language: "ts",
      inner_target: { kind: "line_range", line_offset: { start: 2, end: 2 } },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range).toEqual({ start: 3, end: 3 });
    }
  });

  it("rejects inner targets on non-code fences", () => {
    const content = "# Title\nBody";
    const result = resolveSemantic(content, {
      kind: "heading",
      heading_text: "Title",
      inner_target: { kind: "line_range", line_offset: { start: 1, end: 1 } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_TARGET");
    }
  });

  it("fails when inner target is out of bounds", () => {
    const content = ["```ts", "const a = 1", "```"].join("\n");
    const result = resolveSemantic(content, {
      kind: "code_fence",
      language: "ts",
      inner_target: { kind: "line_range", line_offset: { start: 2, end: 2 } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_INVALID_RANGE");
    }
  });

  it("resolves frontmatter key paths", () => {
    const content = ["---", "title: Example", "nested:", "  value: ok", "---", "Body"].join("\n");

    const result = resolveSemantic(content, {
      kind: "frontmatter_key",
      key_path: ["nested", "value"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range).toEqual({ start: 1, end: 5 });
    }
  });

  it("fails on invalid frontmatter in key targeting", () => {
    const content = ["---", "title: [", "---", "Body"].join("\n");
    const result = resolveSemantic(content, { kind: "frontmatter_key", key_path: ["title"] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_FRONTMATTER_INVALID");
    }
  });

  it("fails on ambiguous heading matches", () => {
    const content = "# Intro\ntext\n# Intro";
    const result = resolveSemantic(content, { kind: "heading", heading_text: "Intro" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_TARGETING_AMBIGUOUS");
    }
  });

  it("enforces semantic search limits", () => {
    const content = "# One\n# Two\n# Three\n# Four";
    const result = resolveSemantic(content, { kind: "heading", heading_text: "One" }, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCM_TARGETING_SCOPE_EXCEEDED");
    }
  });
});
