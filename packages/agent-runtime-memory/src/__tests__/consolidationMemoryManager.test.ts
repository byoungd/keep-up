import { describe, expect, it } from "vitest";
import { ConsolidationMemoryManager } from "../consolidation/memoryManager";
import type { EmbeddingProvider } from "../semantic/vectorStore";
import { InMemoryVectorStore } from "../semantic/vectorStore";

const embeddingProvider: EmbeddingProvider = {
  dimension: 3,
  embed: async (text: string) => [text.length / 10, text.length / 20, text.length / 30],
};

describe("ConsolidationMemoryManager", () => {
  it("promotes entries to vector store", async () => {
    const vectorStore = new InMemoryVectorStore({
      dimension: embeddingProvider.dimension,
      embeddingProvider,
    });

    const manager = new ConsolidationMemoryManager({
      workingMemoryLimit: 5,
      vectorStore,
      consolidationIntervalMs: 1000,
      promotionThreshold: 0.1,
      embeddingProvider,
    });

    await manager.remember("Remember this", "semantic");
    const result = await manager.consolidate();

    expect(result.promoted).toBeGreaterThan(0);

    const recall = await manager.recall("Remember", 3);
    expect(recall.length).toBeGreaterThan(0);
  });
});
