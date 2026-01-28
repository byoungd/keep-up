import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCodebaseResearchEngine, type ResearchStrategy } from "../codebaseResearchEngine";

describe("CodebaseResearchEngine", () => {
  let workspaceRoot = "";

  beforeAll(async () => {
    workspaceRoot = await fsMkdirTemp();
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "node_modules"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "src", "foo.ts"),
      "export function Foo() { return 42; }\n",
      "utf8"
    );
    await writeFile(
      join(workspaceRoot, "node_modules", "ignored.ts"),
      "export const Foo = 1;\n",
      "utf8"
    );
  });

  afterAll(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("finds matching terms in the workspace and respects excludes", async () => {
    const engine = createCodebaseResearchEngine({
      workspaceRoot,
      maxFindings: 5,
      maxFileSize: 100_000,
      timeoutMs: 5_000,
      includeDocs: false,
      includeTests: false,
    });

    const strategy: ResearchStrategy = {
      searchQueries: ["foo"],
      filePatterns: ["*.ts"],
      symbolNames: [],
      priorityDirs: ["src"],
      excludeDirs: ["node_modules"],
      maxFiles: 10,
      focusAreas: ["code"],
    };

    const findings = await engine.executeResearch(strategy);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((finding) => finding.path.includes("src/foo.ts"))).toBe(true);
    expect(findings.some((finding) => finding.path.includes("node_modules"))).toBe(false);
  });
});

async function fsMkdirTemp(): Promise<string> {
  return mkdtemp(join(tmpdir(), "ku0-research-"));
}
