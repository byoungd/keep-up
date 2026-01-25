import { describe, expect, it } from "vitest";
import { SqliteVectorStore } from "../semantic/sqliteVectorStore";
import { MockEmbeddingProvider } from "../vectorIndex";

describe("SqliteVectorStore", () => {
  it("persists and searches by embedding", async () => {
    const provider = new MockEmbeddingProvider(8);
    const store = new SqliteVectorStore({
      filePath: ":memory:",
      dimension: 8,
      embeddingProvider: {
        embed: (text: string) => provider.embed(text),
        dimension: provider.getDimension(),
      },
    });

    await store.upsert({ id: "a", content: "alpha" });
    await store.upsert({ id: "b", content: "beta" });

    const results = await store.search("alpha", { limit: 1 });
    expect(results[0]?.entry.id).toBe("a");

    await store.delete("a");
    const remaining = await store.search("alpha", { limit: 5 });
    expect(remaining.some((result) => result.entry.id === "a")).toBe(false);
  });

  it("loads sqlite extensions when provided", async () => {
    let loaded = false;
    const store = new SqliteVectorStore({
      filePath: ":memory:",
      dimension: 4,
      extensions: [
        {
          name: "test-extension",
          load: () => {
            loaded = true;
          },
        },
      ],
    });

    await store.upsert({ id: "a", content: "alpha", embedding: [0.1, 0.2, 0.3, 0.4] });
    expect(loaded).toBe(true);
  });

  it("falls back when vec search is enabled but extension is unavailable", async () => {
    const store = new SqliteVectorStore({
      filePath: ":memory:",
      dimension: 3,
      enableVecSearch: true,
      ignoreExtensionErrors: true,
    });

    await store.upsert({ id: "a", content: "alpha", embedding: [0.1, 0.1, 0.1] });
    const results = await store.searchByEmbedding([0.1, 0.1, 0.1], { limit: 1 });
    expect(results[0]?.entry.id).toBe("a");
  });
});
