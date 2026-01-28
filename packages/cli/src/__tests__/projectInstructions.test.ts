import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectInstructions } from "../utils/projectInstructions";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("loadProjectInstructions", () => {
  const tempDirs: string[] = [];

  async function tempDir(prefix: string) {
    const dir = await createTempDir(prefix);
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("returns override when provided", async () => {
    const cwd = await tempDir("instructions-override-");
    await writeFile(join(cwd, "AGENTS.md"), "ignored", "utf8");

    const result = await loadProjectInstructions({
      cwd,
      override: "  Use this instead  ",
    });

    expect(result).toBe("Use this instead");
  });

  it("loads AGENTS.md and CLAUDE.md from cwd in order", async () => {
    const cwd = await tempDir("instructions-root-");
    await writeFile(join(cwd, "AGENTS.md"), "Agent rules", "utf8");
    await writeFile(join(cwd, "CLAUDE.md"), "Claude rules", "utf8");

    const result = await loadProjectInstructions({ cwd });

    expect(result).toContain("AGENTS.md\n\nAgent rules");
    expect(result).toContain("CLAUDE.md\n\nClaude rules");
    expect(result).toContain("\n\n---\n\n");
    expect(result?.indexOf("AGENTS.md")).toBeLessThan(result?.indexOf("CLAUDE.md") ?? 0);
  });

  it("includes additional directories with relative labels", async () => {
    const cwd = await tempDir("instructions-cwd-");
    const extra = await tempDir("instructions-extra-");

    await writeFile(join(cwd, "AGENTS.md"), "Root rules", "utf8");
    await writeFile(join(extra, "AGENTS.md"), "Extra rules", "utf8");

    const result = await loadProjectInstructions({
      cwd,
      additionalDirs: [extra],
    });

    const extraLabel = relative(cwd, join(extra, "AGENTS.md"));
    expect(result).toContain(`AGENTS.md\n\nRoot rules`);
    expect(result).toContain(`${extraLabel}\n\nExtra rules`);
  });

  it("deduplicates repeated roots", async () => {
    const cwd = await tempDir("instructions-dedupe-");
    await writeFile(join(cwd, "AGENTS.md"), "Only once", "utf8");

    const result = await loadProjectInstructions({
      cwd,
      additionalDirs: [cwd, "", "  "],
    });

    const matches = result?.match(/AGENTS\.md/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
