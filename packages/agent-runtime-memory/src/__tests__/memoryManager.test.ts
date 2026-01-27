/**
 * MemoryManager tests.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryStore,
  type IEmbeddingProvider,
  type MemoryEvent,
  MemoryManager,
} from "../index";

vi.mock("../utils/tokenCounter", () => ({
  countTokens: (text: string) => text.length,
}));

function createFailingEmbeddingProvider(): IEmbeddingProvider {
  return {
    embed: vi.fn(async () => {
      throw new Error("embedding failed");
    }),
    embedBatch: vi.fn(async () => {
      throw new Error("embedding failed");
    }),
    getDimension: () => 3,
  };
}

describe("MemoryManager", () => {
  it("stores memories and emits memory:added", async () => {
    const store = createInMemoryStore();
    const manager = new MemoryManager({}, store);
    const events: MemoryEvent[] = [];

    manager.on((event) => events.push(event));

    const id = await manager.remember("Remember this");
    const stored = await store.get(id);

    expect(stored?.content).toBe("Remember this");
    expect(events.some((event) => event.type === "memory:added")).toBe(true);
  });

  it("continues when embeddings fail", async () => {
    const store = createInMemoryStore();
    const embeddingProvider = createFailingEmbeddingProvider();
    const manager = new MemoryManager({ vectorSearchEnabled: true }, store, embeddingProvider);

    const id = await manager.remember("Embedding should fail");
    const stored = await store.get(id);

    expect(stored?.embedding).toBeUndefined();
  });

  it("trims context and persists overflow as conversation memory", async () => {
    const store = createInMemoryStore();
    const manager = new MemoryManager(
      {
        shortTermLimit: 3,
        longTermEnabled: true,
        consolidationInterval: 1000,
      },
      store
    );

    await manager.addToContext("one", "user");
    await manager.addToContext("two", "user");

    const context = await manager.getContext();
    const memories = store.getAll();

    expect(context).toContain("[user]: two");
    expect(context).not.toContain("[user]: one");
    expect(memories.some((memory) => memory.type === "conversation")).toBe(true);
  });

  it("injects relevant long-term memories into context", async () => {
    const store = createInMemoryStore();
    const manager = new MemoryManager({ longTermEnabled: true }, store);

    await manager.remember("Open Wrap uses LFCC");
    await manager.addToContext("Open Wrap uses LFCC", "user");
    await manager.addToContext("ok", "assistant");

    const context = await manager.getContext();

    expect(context).toContain("--- Relevant memories ---");
    expect(context).toContain("[fact]: Open Wrap uses LFCC");
  });

  it("triggers consolidation when over max memories", async () => {
    const store = createInMemoryStore();
    const consolidateSpy = vi.spyOn(store, "consolidate");
    const manager = new MemoryManager(
      {
        consolidationInterval: 1,
        maxMemories: 0,
      },
      store
    );

    await manager.remember("trigger consolidation");

    expect(consolidateSpy).toHaveBeenCalledTimes(1);
  });
});
