import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileExists, getFileStats, listFiles, readFile } from "../fileSystem";

describe("code file system", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ku0-fs-"));
    filePath = join(dir, "notes.txt");
    await writeFile(filePath, ["alpha", "beta", "gamma"].join("\n"), "utf-8");
    await writeFile(join(dir, ".hidden.txt"), "secret", "utf-8");
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "inner.txt"), "inner", "utf-8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a line range with line numbers", async () => {
    const result = await readFile(filePath, { startLine: 2, endLine: 3 });

    expect(result.range).toEqual([2, 3]);
    expect(result.content).toContain("2: beta");
    expect(result.content).toContain("3: gamma");
  });

  it("reads a line range without line numbers", async () => {
    const result = await readFile(filePath, {
      startLine: 1,
      endLine: 2,
      withLineNumbers: false,
    });

    expect(result.content).toBe(["alpha", "beta"].join("\n"));
  });

  it("lists files with depth and hidden filters", async () => {
    const entries = await listFiles(dir, {
      maxDepth: 1,
      includeHidden: false,
      respectGitignore: false,
    });

    const paths = entries.map((entry) => entry.path).sort();
    expect(paths).toContain("notes.txt");
    expect(paths).toContain("nested");
    expect(paths).not.toContain(".hidden.txt");
    expect(paths).not.toContain(join("nested", "inner.txt"));
  });

  it("reports file existence and stats", async () => {
    expect(await fileExists(filePath)).toBe(true);
    expect(await fileExists(join(dir, "missing.txt"))).toBe(false);

    const stats = await getFileStats(filePath);
    expect(stats.lines).toBe(3);
    expect(stats.size).toBeGreaterThan(0);
  });
});
