import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createContextIndex,
  createHashEmbeddingProvider,
  InMemoryContextIndexStore,
} from "@ku0/context-index";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContextRoutes } from "../routes/context";
import type { ContextIndexManager } from "../services/contextIndexManager";

describe("Context routes", () => {
  let rootPath: string;
  let app: Hono;
  let store: InMemoryContextIndexStore;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), "cowork-context-"));
    await writeFile(join(rootPath, "alpha.txt"), "alpha", "utf-8");

    store = new InMemoryContextIndexStore();
    const index = createContextIndex({
      rootPath,
      store,
      embeddingProvider: createHashEmbeddingProvider(16),
    });
    await index.indexProject();

    const contextIndexManager = {
      getIndex: () => index,
    } as ContextIndexManager;

    app = createContextRoutes({
      basePath: rootPath,
      contextIndexManager,
    });
  });

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true });
  });

  it("searches indexed chunks", async () => {
    const res = await app.request("/context/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "alpha", minScore: 0.99 }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      results: Array<{ score: number; chunk: { sourcePath: string } }>;
    };
    expect(data.results).toHaveLength(1);
    expect(data.results[0]?.chunk.sourcePath).toBe("alpha.txt");
  });

  it("creates packs and manages pins", async () => {
    const [chunk] = await store.listChunks();
    if (!chunk) {
      throw new Error("Expected a chunk to be indexed");
    }

    const createRes = await app.request("/context/packs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alpha Pack",
        chunkIds: [chunk.id],
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as { pack: { id: string; name: string } };
    expect(createData.pack.name).toBe("Alpha Pack");

    const pinRes = await app.request("/context/pins/session-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packIds: [createData.pack.id] }),
    });
    expect(pinRes.status).toBe(200);

    const deleteRes = await app.request(`/context/packs/${createData.pack.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const pinsRes = await app.request("/context/pins/session-1");
    const pinsData = (await pinsRes.json()) as { pins: { packIds: string[] } | null };
    expect(pinsData.pins).toBeNull();
  });
});
