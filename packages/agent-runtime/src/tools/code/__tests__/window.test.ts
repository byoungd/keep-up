import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createWindowViewer } from "../window";

describe("createWindowViewer", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("opens, scrolls, and jumps within a file", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "window-viewer-"));
    const filePath = join(tempDir, "sample.txt");
    const content = Array.from({ length: 200 }, (_, idx) => `Line ${idx + 1}`).join("\n");
    await writeFile(filePath, content, "utf-8");

    const viewer = createWindowViewer(100);
    const firstView = await viewer.open(filePath);

    expect(firstView.viewportStart).toBe(1);
    expect(firstView.viewportEnd).toBe(100);
    expect(firstView.linesAbove).toBe(0);
    expect(firstView.linesBelow).toBe(100);

    const downView = await viewer.scrollDown();
    expect(downView.viewportStart).toBe(80);
    expect(downView.viewportEnd).toBe(179);

    const endView = await viewer.goto(200);
    expect(endView.viewportEnd).toBe(200);
    expect(endView.viewportStart).toBe(101);
  });
});
