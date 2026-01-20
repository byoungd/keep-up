import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { editFile } from "../editor";

describe("editFile", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "line1\nline2\nline3\nline4\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("replaces lines correctly", async () => {
    const result = await editFile(
      testFile,
      [{ startLine: 2, endLine: 3, replacement: "newLine2\nnewLine3" }],
      { validateSyntax: false }
    );

    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("line1\nnewLine2\nnewLine3\nline4\n");
  });

  it("rolls back when new syntax errors are introduced", async () => {
    const jsFile = path.join(tempDir, "syntax.js");
    const original = "const value = 1;\n";
    await fs.writeFile(jsFile, original);

    const result = await editFile(
      jsFile,
      [{ startLine: 1, endLine: 1, replacement: "const = ;" }],
      { validateSyntax: true }
    );

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.syntaxError ?? "").toContain("SyntaxError");
    const content = await fs.readFile(jsFile, "utf-8");
    expect(content).toBe(original);
  });
  it("applies multiple chunks in one call", async () => {
    const result = await editFile(
      testFile,
      [
        { startLine: 1, endLine: 1, replacement: "new1" },
        { startLine: 4, endLine: 4, replacement: "new4" },
      ],
      { validateSyntax: false }
    );

    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("new1\nline2\nline3\nnew4\n");
  });

  it("rolls back all changes if one chunk fails syntax validation", async () => {
    const jsFile = path.join(tempDir, "multi_syntax.js");
    const original = "const a = 1;\nconst b = 2;\n";
    await fs.writeFile(jsFile, original);

    const result = await editFile(
      jsFile,
      [
        { startLine: 1, endLine: 1, replacement: "const a = 10;" },
        { startLine: 2, endLine: 2, replacement: "const b = ;" }, // Error here
      ],
      { validateSyntax: true }
    );

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    const content = await fs.readFile(jsFile, "utf-8");
    expect(content).toBe(original);
  });

  it("handles empty replacement (deletion)", async () => {
    const result = await editFile(testFile, [{ startLine: 2, endLine: 3, replacement: "" }], {
      validateSyntax: false,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("line1\nline4\n");
  });

  describe("boundary conditions", () => {
    it("handles editing an empty file", async () => {
      const emptyFile = path.join(tempDir, "empty.txt");
      await fs.writeFile(emptyFile, "");
      const result = await editFile(
        emptyFile,
        [{ startLine: 1, endLine: 1, replacement: "first line" }],
        {
          validateSyntax: false,
        }
      );
      expect(result.success).toBe(true);
      const content = await fs.readFile(emptyFile, "utf-8");
      expect(content).toBe("first line\n"); // Tool now adds trailing newline
    });

    it("errors on invalid line range (start > end)", async () => {
      const result = await editFile(testFile, [{ startLine: 5, endLine: 2, replacement: "fail" }], {
        validateSyntax: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("End line (2) must be >= start line (5)");
    });

    it("errors on out-of-range lines", async () => {
      const result = await editFile(
        testFile,
        [{ startLine: 100, endLine: 101, replacement: "fail" }],
        {
          validateSyntax: false,
        }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds file length");
    });

    it("handles extremely large files", async () => {
      const largeFile = path.join(tempDir, "large.txt");
      const lines = Array.from({ length: 10000 }, (_, i) => `line${i + 1}`);
      await fs.writeFile(largeFile, `${lines.join("\n")}\n`);

      const result = await editFile(
        largeFile,
        [{ startLine: 5000, endLine: 5000, replacement: "new-middle-line" }],
        { validateSyntax: false }
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(largeFile, "utf-8");
      const readLines = content.split("\n");
      expect(readLines[4999]).toBe("new-middle-line");
    });

    it("handles concurrent edits to the same file (sequential handling)", async () => {
      const promises = [
        editFile(testFile, [{ startLine: 1, endLine: 1, replacement: "a" }], {
          validateSyntax: false,
        }),
        editFile(testFile, [{ startLine: 4, endLine: 4, replacement: "b" }], {
          validateSyntax: false,
        }),
      ];

      const results = await Promise.all(promises);
      expect(results.every((r) => r.success)).toBe(true);

      const content = await fs.readFile(testFile, "utf-8");
      expect(content).toContain("a");
      expect(content).toContain("b");
    });
  });
});
