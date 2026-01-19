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
});
