import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createContextIndex,
  createHashEmbeddingProvider,
  InMemoryContextIndexStore,
} from "@ku0/context-index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ContextIndex", () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), "context-index-"));
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("indexes and searches deterministically", async () => {
    await writeFile(join(rootPath, "alpha.txt"), "alpha", "utf-8");
    await writeFile(join(rootPath, "bravo.txt"), "bravo", "utf-8");

    const store = new InMemoryContextIndexStore();
    const index = createContextIndex({
      rootPath,
      store,
      embeddingProvider: createHashEmbeddingProvider(16),
    });

    await index.indexProject();

    const results = await index.search("alpha", { minScore: 0.99, limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.sourcePath).toBe("alpha.txt");
    expect(results[0]?.score).toBeGreaterThan(0.99);
  });

  it("builds pack prompts within budget and manages pins", async () => {
    await writeFile(join(rootPath, "alpha.txt"), "alpha", "utf-8");
    await writeFile(join(rootPath, "bravo.txt"), "bravo", "utf-8");

    const store = new InMemoryContextIndexStore();
    const index = createContextIndex({
      rootPath,
      store,
      embeddingProvider: createHashEmbeddingProvider(16),
    });

    await index.indexProject();

    const chunks = (await store.listChunks()).sort((a, b) =>
      a.sourcePath.localeCompare(b.sourcePath)
    );
    expect(chunks).toHaveLength(2);

    const pack = await index.createPack("Core Pack", [chunks[0].id, chunks[0].id, chunks[1].id]);
    expect(pack.chunkIds).toEqual([chunks[0].id, chunks[1].id]);

    const pins = await index.setPins("session-1", [pack.id]);
    expect(pins?.packIds).toEqual([pack.id]);

    const prompt = await index.buildPackPrompt([pack.id], {
      tokenBudget: chunks[0].tokenCount,
    });
    expect(prompt).toBeTypeOf("string");
    expect(prompt).toContain(`source="${chunks[0].sourcePath}"`);
    expect(prompt).not.toContain(`source="${chunks[1].sourcePath}"`);

    const cleared = await index.setPins("session-1", []);
    expect(cleared).toBeNull();
  });
});
