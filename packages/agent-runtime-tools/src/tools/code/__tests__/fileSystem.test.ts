import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

import { listFiles, readFile } from "../fileSystem";

describe("fileSystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-test-"));

    // Initialize git repo for gitignore testing
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tempDir });

    // Create a mock project structure
    await fs.mkdir(path.join(tempDir, "src"));
    await fs.mkdir(path.join(tempDir, "node_modules"));
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");
    await fs.writeFile(path.join(tempDir, "src/index.ts"), "console.log('hello');");
    await fs.writeFile(path.join(tempDir, "src/utils.ts"), "export const x = 1;");
    await fs.writeFile(path.join(tempDir, "node_modules/dep.js"), "module.exports = {};");
    await fs.writeFile(path.join(tempDir, ".gitignore"), "node_modules/\n.tmp/");

    // Add to git to satisfy git ls-files
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("readFile", () => {
    it("reads a file with line numbers", async () => {
      const filePath = path.join(tempDir, "src/index.ts");
      const result = await readFile(filePath);
      expect(result.content).toContain("1: console.log('hello');");
      expect(result.totalLines).toBe(1);
    });

    it("reads a specific range of lines", async () => {
      const filePath = path.join(tempDir, "src/index.ts");
      await fs.writeFile(filePath, "line1\nline2\nline3\nline4\n");
      const result = await readFile(filePath, { startLine: 2, endLine: 3 });
      expect(result.content).toContain("2: line2");
      expect(result.content).toContain("3: line3");
      expect(result.content).not.toContain("1: line1");
      expect(result.range).toEqual([2, 3]);
    });
  });

  describe("listFiles", () => {
    it("lists files recursively by default", async () => {
      const files = await listFiles(tempDir);
      const paths = files.map((f) => f.path);
      expect(paths).toContain("package.json");
      expect(paths).toContain("src/index.ts");
      expect(paths).toContain("src/utils.ts");
    });

    it("respects .gitignore by default", async () => {
      const files = await listFiles(tempDir);
      const paths = files.map((f) => f.path);
      expect(paths).not.toContain("node_modules/dep.js");
    });

    it("can ignore .gitignore if requested", async () => {
      const files = await listFiles(tempDir, { respectGitignore: false });
      const paths = files.map((f) => f.path);
      expect(paths).toContain("node_modules/dep.js");
    });

    it("respects maxDepth", async () => {
      const files = await listFiles(tempDir, { maxDepth: 1 });
      const paths = files.map((f) => f.path);
      expect(paths).toContain("package.json");
      expect(paths).not.toContain("src/index.ts");
    });
  });
});
