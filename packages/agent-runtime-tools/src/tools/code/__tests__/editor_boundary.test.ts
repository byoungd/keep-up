import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editFile } from "../editor";

describe("editFile Boundary Conditions", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "editor-boundary-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "line1\nline2\nline3\nline4\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should handle invalid start line (< 1)", async () => {
    const result = await editFile(testFile, [{ startLine: 0, endLine: 1, replacement: "new" }], {
      validateSyntax: false,
    });
    expect(result.success).toBe(false);
    expect(result.syntaxError).toContain("Invalid start line");
  });

  it("should handle end line < start line", async () => {
    const result = await editFile(testFile, [{ startLine: 2, endLine: 1, replacement: "new" }], {
      validateSyntax: false,
    });
    expect(result.success).toBe(false);
    expect(result.syntaxError).toContain("End line (1) must be >= start line (2)");
  });

  it("should handle start line > total lines", async () => {
    const result = await editFile(testFile, [{ startLine: 10, endLine: 10, replacement: "new" }], {
      validateSyntax: false,
    });
    expect(result.success).toBe(false);
    expect(result.syntaxError).toContain("exceeds file length");
  });

  it("should handle end line > total lines", async () => {
    // Current implementation doesn't explicitly check endLine > totalLines in validateEditRanges
    // Let's see how it behaves.
    const result = await editFile(testFile, [{ startLine: 2, endLine: 10, replacement: "new" }], {
      validateSyntax: false,
    });
    // splice handles this by deleting until end of array.
    // If the tool is intended to be strict, this should perhaps fail.
    // But let's see current behavior.
    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("line1\nnew");
    // Wait, if it replaces line 2-10 (but only has 4 lines), it replaces 2, 3, 4.
    // So line1 + new.
  });

  it("should handle editing an empty file", async () => {
    const emptyFile = path.join(tempDir, "empty.txt");
    await fs.writeFile(emptyFile, "");

    // If file is empty, totalLines is 1 (after split('\n') on empty string)
    // Actually, "".split('\n') is ['']. So 1 line.
    const result = await editFile(
      emptyFile,
      [{ startLine: 1, endLine: 1, replacement: "first line" }],
      { validateSyntax: false }
    );
    expect(result.success).toBe(true);
    const content = await fs.readFile(emptyFile, "utf-8");
    expect(content).toBe("first line");
  });

  it("should handle large number of line insertions", async () => {
    const largeReplacement = Array.from({ length: 1000 }, (_, i) => `new line ${i}`).join("\n");
    const result = await editFile(
      testFile,
      [{ startLine: 2, endLine: 2, replacement: largeReplacement }],
      { validateSyntax: false }
    );
    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    const lines = content.split("\n");
    expect(lines.length).toBe(1004); // original 4 lines + trailing empty = 5. 5 - 1 + 1000 = 1004
  });

  it("should handle special characters in replacement", async () => {
    const special = "  const x = `hello ${name}`; // \"quote\" 'single' \n  \t tabs";
    const result = await editFile(testFile, [{ startLine: 2, endLine: 2, replacement: special }], {
      validateSyntax: false,
    });
    expect(result.success).toBe(true);
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toContain(special);
  });
});
