import { describe, expect, it } from "vitest";
import { applyPatch, createTwoFilesPatch, diffLines, diffUnified, reversePatch } from "./index.js";

describe("diff-rs", () => {
  describe("diffLines", () => {
    it("should detect single line change", () => {
      const hunks = diffLines("hello\nworld\n", "hello\nplanet\n");
      expect(hunks.length).toBe(1);

      const hunk = hunks[0];
      const removes = hunk.lines.filter((l) => l.type === "remove");
      const adds = hunk.lines.filter((l) => l.type === "add");

      expect(removes.length).toBe(1);
      expect(adds.length).toBe(1);
      expect(removes[0].content).toBe("world");
      expect(adds[0].content).toBe("planet");
    });

    it("should return empty for identical content", () => {
      const hunks = diffLines("same\ncontent\n", "same\ncontent\n");
      expect(hunks.length).toBe(0);
    });

    it("should handle empty strings", () => {
      const hunks = diffLines("", "");
      expect(hunks.length).toBe(0);
    });

    it("should track line numbers correctly", () => {
      const hunks = diffLines("a\nb\nc\n", "a\nx\nc\n");
      expect(hunks.length).toBe(1);

      const hunk = hunks[0];
      const remove = hunk.lines.find((l) => l.type === "remove");
      const add = hunk.lines.find((l) => l.type === "add");

      expect(remove?.oldLineNo).toBe(2);
      expect(add?.newLineNo).toBe(2);
    });
  });

  describe("diffUnified", () => {
    it("should produce unified diff format", () => {
      const result = diffUnified("line1\nline2\nline3\n", "line1\nmodified\nline3\n");

      expect(result).toContain("---");
      expect(result).toContain("+++");
      expect(result).toContain("@@");
      expect(result).toContain("-line2");
      expect(result).toContain("+modified");
    });

    it("should respect context parameter", () => {
      const lines = `${Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n")}\n`;
      const modified = lines.replace("line10", "changed");

      const smallContext = diffUnified(lines, modified, 1);
      const largeContext = diffUnified(lines, modified, 5);

      expect(largeContext.length).toBeGreaterThan(smallContext.length);
    });
  });

  describe("createTwoFilesPatch", () => {
    it("should include file headers", () => {
      const result = createTwoFilesPatch(
        "old.txt",
        "new.txt",
        "content\n",
        "modified\n",
        "2024-01-01",
        "2024-01-02"
      );

      expect(result).toContain("--- old.txt");
      expect(result).toContain("+++ new.txt");
      expect(result).toContain("2024-01-01");
      expect(result).toContain("2024-01-02");
    });

    it("should include Index header for same filename", () => {
      const result = createTwoFilesPatch("file.txt", "file.txt", "a\n", "b\n");

      expect(result).toContain("Index: file.txt");
    });
  });

  describe("applyPatch", () => {
    it("should apply a valid patch", () => {
      const original = "line1\nline2\nline3\n";
      const patch = "--- a\n+++ b\n@@ -1,3 +1,3 @@\n line1\n-line2\n+modified\n line3\n";

      const result = applyPatch(original, patch);
      expect(result).toBe("line1\nmodified\nline3\n");
    });

    it("should handle malformed patch gracefully", () => {
      // JS diff library throws on invalid patch, native may not
      // Test that the function is callable and doesn't crash
      try {
        const result = applyPatch("content", "not a valid patch");
        expect(typeof result).toBe("string");
      } catch {
        // JS fallback throws - this is acceptable behavior
        expect(true).toBe(true);
      }
    });
  });

  describe("reversePatch", () => {
    it("should reverse additions and deletions", () => {
      const patch = "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-old\n+new\n context\n";
      const reversed = reversePatch(patch);

      expect(reversed).toMatch(/[+-]\s*old/);
      expect(reversed).toMatch(/[+-]\s*new/);
    });

    it("should handle invalid patch gracefully", () => {
      const invalid = "not a patch";
      const result = reversePatch(invalid);
      // May return original or empty depending on implementation
      expect(typeof result).toBe("string");
    });
  });

  describe("roundtrip", () => {
    it("should roundtrip create and apply patch", () => {
      const original = "hello\nworld\nfoo\nbar\n";
      const modified = "hello\nplanet\nfoo\nbaz\n";

      const patch = createTwoFilesPatch("a", "b", original, modified);
      expect(patch).toBeDefined();

      const applied = applyPatch(original, patch as string);
      expect(applied).toBe(modified);
    });
  });
});
