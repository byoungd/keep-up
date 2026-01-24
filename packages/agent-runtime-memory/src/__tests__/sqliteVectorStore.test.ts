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
});
