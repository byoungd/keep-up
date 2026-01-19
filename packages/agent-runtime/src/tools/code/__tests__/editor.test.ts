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
});
