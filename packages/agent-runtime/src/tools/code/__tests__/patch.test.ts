import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyPatch } from "../patch";

describe("applyPatch", () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "patch-test-"));
    testFile = path.join(tempDir, "test.txt");
    await fs.writeFile(testFile, "line1\nline2\nline3\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("applies a patch with exact matches", async () => {
    const patch = [
      "diff --git a/test.txt b/test.txt",
      "--- a/test.txt",
      "+++ b/test.txt",
      "@@ -1,3 +1,3 @@",
      "-line1",
      "+line1 updated",
      " line2",
      " line3",
      "",
    ].join("\n");

    const result = await applyPatch(patch, tempDir);
    expect(result.success).toBe(true);
    expect(result.fuzzLevel).toBe(0);

    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("line1 updated\nline2\nline3\n");
  });

  it("falls back to trimEnd fuzz for whitespace mismatches", async () => {
    const whitespaceFile = path.join(tempDir, "whitespace.txt");
    await fs.writeFile(whitespaceFile, "alpha  \nbeta\n");

    const patch = [
      "diff --git a/whitespace.txt b/whitespace.txt",
      "--- a/whitespace.txt",
      "+++ b/whitespace.txt",
      "@@ -1,2 +1,2 @@",
      "-alpha",
      "+alpha updated",
      " beta",
      "",
    ].join("\n");

    const result = await applyPatch(patch, tempDir);
    expect(result.success).toBe(true);
    expect(result.fuzzLevel).toBe(1);

    const content = await fs.readFile(whitespaceFile, "utf-8");
    expect(content).toBe("alpha updated\nbeta\n");
  });
});
