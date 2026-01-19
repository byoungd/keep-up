/**
 * CachedMemoryStore tests.
 */

import { CachedMemoryStore, createInMemoryStore, type Memory } from "@ku0/agent-runtime-memory";
import { describe, expect, it, vi } from "vitest";

function createTestMemory(
  overrides?: Partial<Memory>
): Omit<Memory, "id" | "accessCount" | "lastAccessedAt"> {
  return {
    type: "fact",
    content: "Test memory content",
    importance: 0.5,
    createdAt: Date.now(),
    source: "test",
    tags: ["test"],
    ...overrides,
  };
}

describe("CachedMemoryStore", () => {
  it("caches query results and updates access stats on cache hits", async () => {
    const inner = createInMemoryStore();
    await inner.add(createTestMemory({ content: "cache hit content" }));

    const store = new CachedMemoryStore(inner, {
      enableQueryCache: true,
      queryCache: { maxEntries: 10, defaultTtlMs: 0 },
    });

    const spy = vi.spyOn(inner, "query");

    const first = await store.query({ text: "cache hit" });
    const second = await store.query({ text: "cache hit" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first.memories).toHaveLength(1);
    expect(second.memories).toHaveLength(1);

    const stored = inner.getAll();
    expect(stored[0]?.accessCount).toBe(2);
  });

  it("invalidates cache on write operations", async () => {
    const inner = createInMemoryStore();
    await inner.add(createTestMemory({ content: "invalidate content" }));

    const store = new CachedMemoryStore(inner, {
      enableQueryCache: true,
      queryCache: { maxEntries: 10, defaultTtlMs: 0 },
    });

    const spy = vi.spyOn(inner, "query");

    await store.query({ text: "invalidate" });
    await store.query({ text: "invalidate" });
    expect(spy).toHaveBeenCalledTimes(1);

    await store.add(createTestMemory({ content: "new memory" }));
    await store.query({ text: "invalidate" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("respects includeEmbeddings without mutating stored memories", async () => {
    const inner = createInMemoryStore();
    await inner.add(
      createTestMemory({
        content: "embedded content",
        embedding: [0.1, 0.2, 0.3],
      })
    );

    const store = new CachedMemoryStore(inner, {
      enableQueryCache: true,
      queryCache: { maxEntries: 10, defaultTtlMs: 0 },
    });

    const result = await store.query({ text: "embedded", includeEmbeddings: false });
    expect(result.memories[0]?.embedding).toBeUndefined();

    const stored = inner.getAll();
    expect(stored[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
  });
});
