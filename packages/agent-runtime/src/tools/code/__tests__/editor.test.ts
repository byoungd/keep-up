import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteLines, editFile, insertAfterLine } from "../editor";

describe("code editor", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ku0-editor-"));
    filePath = join(dir, "sample.txt");
    await writeFile(filePath, ["line1", "line2", "line3"].join("\n"), "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("applies edits and returns diff", async () => {
    const result = await editFile(filePath, [{ startLine: 2, endLine: 2, replacement: "middle" }], {
      validateSyntax: false,
    });

    expect(result.success).toBe(true);
    const updated = await readFile(filePath, "utf-8");
    expect(updated).toBe(["line1", "middle", "line3"].join("\n"));
    expect(result.diff).toContain("-line2");
    expect(result.diff).toContain("+middle");
  });

  it("keeps file unchanged on dry run", async () => {
    const result = await editFile(filePath, [{ startLine: 1, endLine: 1, replacement: "first" }], {
      dryRun: true,
      validateSyntax: false,
    });

    expect(result.success).toBe(true);
    const updated = await readFile(filePath, "utf-8");
    expect(updated).toBe(["line1", "line2", "line3"].join("\n"));
  });

  it("rejects edits outside the file range", async () => {
    const result = await editFile(filePath, [{ startLine: 5, endLine: 5, replacement: "oops" }], {
      validateSyntax: false,
    });

    expect(result.success).toBe(false);
    expect(result.syntaxError).toMatch(/exceeds file length/i);
  });

  it("supports insert and delete helpers", async () => {
    const insertResult = await insertAfterLine(filePath, 0, "intro", {
      validateSyntax: false,
    });
    expect(insertResult.success).toBe(true);

    let updated = await readFile(filePath, "utf-8");
    expect(updated.split("\n")[0]).toBe("intro");

    const deleteResult = await deleteLines(filePath, 2, 2, { validateSyntax: false });
    expect(deleteResult.success).toBe(true);

    updated = await readFile(filePath, "utf-8");
    expect(updated).toBe(["intro", "line2", "line3"].join("\n"));
  });
});
