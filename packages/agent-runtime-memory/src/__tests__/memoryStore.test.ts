/**
 * Memory Store Tests
 *
 * Comprehensive tests for the InMemoryStore including:
 * - CRUD operations (add, get, update, delete)
 * - Text search with scoring
 * - Semantic search with embeddings
 * - Query filtering
 * - Consolidation and decay
 * - Statistics
 * - Bulk operations
 */

import { beforeEach, describe, expect, it } from "vitest";
import { cosineSimilarity, createInMemoryStore, InMemoryStore, type Memory } from "../index";

// ============================================================================
// Test Fixtures
// ============================================================================

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

function createNormalizedEmbedding(seed: number, dimension = 128): number[] {
  // Create a simple deterministic embedding
  const embedding = Array.from(
    { length: dimension },
    (_, i) => Math.sin(seed * (i + 1)) + Math.cos(seed * (i + 2))
  );

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / norm);
}

// ============================================================================
// Tests
// ============================================================================

describe("InMemoryStore", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe("CRUD operations", () => {
    describe("add", () => {
      it("should add a memory and return an ID", async () => {
        const memory = createTestMemory();
        const id = await store.add(memory);

        expect(id).toBeDefined();
        expect(id).toMatch(/^mem-/);
      });

      it("should generate unique IDs for each memory", async () => {
        const memory1 = createTestMemory({ content: "Memory 1" });
        const memory2 = createTestMemory({ content: "Memory 2" });

        const id1 = await store.add(memory1);
        const id2 = await store.add(memory2);

        expect(id1).not.toBe(id2);
      });

      it("should preserve all memory properties", async () => {
        const memory = createTestMemory({
          type: "preference",
          content: "User prefers dark mode",
          importance: 0.9,
          tags: ["ui", "preference"],
          source: "user-settings",
          metadata: { theme: "dark" },
        });

        const id = await store.add(memory);
        const retrieved = await store.get(id);

        expect(retrieved?.type).toBe("preference");
        expect(retrieved?.content).toBe("User prefers dark mode");
        expect(retrieved?.importance).toBe(0.9);
        expect(retrieved?.tags).toEqual(["ui", "preference"]);
        expect(retrieved?.source).toBe("user-settings");
        expect(retrieved?.metadata).toEqual({ theme: "dark" });
      });

      it("should initialize accessCount to 0", async () => {
        const id = await store.add(createTestMemory());
        const retrieved = await store.get(id);

        // Note: get() increments accessCount, so it will be 1 after first get
        expect(retrieved?.accessCount).toBe(1);
      });
    });

    describe("get", () => {
      it("should return memory by ID", async () => {
        const memory = createTestMemory({ content: "Unique content" });
        const id = await store.add(memory);

        const retrieved = await store.get(id);

        expect(retrieved?.id).toBe(id);
        expect(retrieved?.content).toBe("Unique content");
      });

      it("should return null for non-existent ID", async () => {
        const retrieved = await store.get("non-existent-id");
        expect(retrieved).toBeNull();
      });

      it("should increment accessCount on each access", async () => {
        const id = await store.add(createTestMemory());

        await store.get(id);
        await store.get(id);
        const third = await store.get(id);

        expect(third?.accessCount).toBe(3);
      });

      it("should update lastAccessedAt on access", async () => {
        const id = await store.add(createTestMemory());
        const before = Date.now();

        await new Promise((resolve) => setTimeout(resolve, 10));
        const retrieved = await store.get(id);

        expect(retrieved?.lastAccessedAt).toBeGreaterThanOrEqual(before);
      });
    });

    describe("update", () => {
      it("should update memory properties", async () => {
        const id = await store.add(createTestMemory({ content: "Original" }));

        await store.update(id, { content: "Updated" });
        const retrieved = await store.get(id);

        expect(retrieved?.content).toBe("Updated");
      });

      it("should update importance", async () => {
        const id = await store.add(createTestMemory({ importance: 0.3 }));

        await store.update(id, { importance: 0.9 });
        const retrieved = await store.get(id);

        expect(retrieved?.importance).toBe(0.9);
      });

      it("should update tags", async () => {
        const id = await store.add(createTestMemory({ tags: ["old"] }));

        await store.update(id, { tags: ["new", "updated"] });
        const retrieved = await store.get(id);

        expect(retrieved?.tags).toEqual(["new", "updated"]);
      });

      it("should not modify other properties", async () => {
        const id = await store.add(
          createTestMemory({
            content: "Original",
            importance: 0.5,
            source: "test-source",
          })
        );

        await store.update(id, { importance: 0.9 });
        const retrieved = await store.get(id);

        expect(retrieved?.content).toBe("Original");
        expect(retrieved?.source).toBe("test-source");
      });

      it("should do nothing for non-existent ID", async () => {
        // Should not throw
        await expect(store.update("non-existent", { content: "Update" })).resolves.toBeUndefined();
      });
    });

    describe("delete", () => {
      it("should delete existing memory and return true", async () => {
        const id = await store.add(createTestMemory());

        const result = await store.delete(id);

        expect(result).toBe(true);
        expect(await store.get(id)).toBeNull();
      });

      it("should return false for non-existent ID", async () => {
        const result = await store.delete("non-existent-id");
        expect(result).toBe(false);
      });

      it("should not affect other memories", async () => {
        const id1 = await store.add(createTestMemory({ content: "Memory 1" }));
        const id2 = await store.add(createTestMemory({ content: "Memory 2" }));

        await store.delete(id1);

        expect(await store.get(id1)).toBeNull();
        expect(await store.get(id2)).not.toBeNull();
      });
    });
  });

  describe("text search", () => {
    beforeEach(async () => {
      await store.add(
        createTestMemory({ content: "TypeScript is a typed superset of JavaScript" })
      );
      await store.add(
        createTestMemory({ content: "React is a JavaScript library for building UIs" })
      );
      await store.add(createTestMemory({ content: "Node.js runs JavaScript on the server" }));
      await store.add(createTestMemory({ content: "Python is great for data science" }));
    });

    it("should find exact phrase matches", async () => {
      const results = await store.search("JavaScript");

      expect(results.length).toBe(3);
      expect(results.every((r) => r.content.includes("JavaScript"))).toBe(true);
    });

    it("should return results sorted by relevance", async () => {
      const results = await store.search("JavaScript library");

      // React result should be first (has both words)
      expect(results[0].content).toContain("library");
    });

    it("should respect limit option", async () => {
      const results = await store.search("JavaScript", { limit: 2 });
      expect(results.length).toBe(2);
    });

    it("should filter by type", async () => {
      await store.add(
        createTestMemory({
          content: "JavaScript frameworks",
          type: "preference",
        })
      );

      const results = await store.search("JavaScript", { types: ["preference"] });

      expect(results.length).toBe(1);
      expect(results[0].type).toBe("preference");
    });

    it("should return empty array for no matches", async () => {
      const results = await store.search("Rust");
      expect(results.length).toBe(0);
    });

    it("should match tags", async () => {
      await store.add(
        createTestMemory({
          content: "Some content",
          tags: ["javascript", "frontend"],
        })
      );

      const results = await store.search("javascript");

      expect(results.some((r) => r.tags.includes("javascript"))).toBe(true);
    });

    it("should boost results by importance", async () => {
      await store.add(
        createTestMemory({
          content: "JavaScript is important",
          importance: 1.0,
        })
      );
      await store.add(
        createTestMemory({
          content: "JavaScript is not important",
          importance: 0.1,
        })
      );

      const results = await store.search("JavaScript is");

      // Higher importance should be first
      expect(results[0].importance).toBeGreaterThan(results[results.length - 1].importance);
    });
  });

  describe("semantic search", () => {
    it("should find similar embeddings", async () => {
      const baseEmbedding = createNormalizedEmbedding(1);
      // Use same embedding for guaranteed similarity
      const similarEmbedding = createNormalizedEmbedding(1);
      const differentEmbedding = createNormalizedEmbedding(100); // Very different

      await store.add(
        createTestMemory({
          content: "Similar content",
          embedding: similarEmbedding,
        })
      );
      await store.add(
        createTestMemory({
          content: "Different content",
          embedding: differentEmbedding,
        })
      );

      const results = await store.semanticSearch(baseEmbedding, { threshold: 0.5 });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toBe("Similar content");
    });

    it("should respect threshold", async () => {
      const embedding1 = createNormalizedEmbedding(1);
      const embedding2 = createNormalizedEmbedding(50);

      await store.add(
        createTestMemory({
          content: "Content 1",
          embedding: embedding1,
        })
      );

      // With high threshold, should not match
      const results = await store.semanticSearch(embedding2, { threshold: 0.99 });
      expect(results.length).toBe(0);
    });

    it("should respect limit", async () => {
      const baseEmbedding = createNormalizedEmbedding(1);

      // Add many similar memories
      for (let i = 0; i < 10; i++) {
        await store.add(
          createTestMemory({
            content: `Content ${i}`,
            embedding: createNormalizedEmbedding(1 + i * 0.01),
          })
        );
      }

      const results = await store.semanticSearch(baseEmbedding, { limit: 3, threshold: 0.1 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should skip memories without embeddings", async () => {
      await store.add(createTestMemory({ content: "No embedding" }));
      await store.add(
        createTestMemory({
          content: "Has embedding",
          embedding: createNormalizedEmbedding(1),
        })
      );

      const results = await store.semanticSearch(createNormalizedEmbedding(1), { threshold: 0.1 });

      expect(results.length).toBe(1);
      expect(results[0].content).toBe("Has embedding");
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

      await store.add(
        createTestMemory({
          type: "fact",
          content: "TypeScript fact",
          importance: 0.8,
          createdAt: now,
          source: "docs",
          tags: ["typescript", "language"],
          sessionId: "session-1",
        })
      );

      await store.add(
        createTestMemory({
          type: "preference",
          content: "User preference",
          importance: 0.5,
          createdAt: dayAgo,
          source: "user",
          tags: ["settings"],
          sessionId: "session-1",
        })
      );

      await store.add(
        createTestMemory({
          type: "error",
          content: "Old error",
          importance: 0.2,
          createdAt: weekAgo,
          source: "system",
          tags: ["error", "deprecated"],
          sessionId: "session-2",
        })
      );
    });

    it("should filter by type", async () => {
      const result = await store.query({ types: ["fact"] });

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].type).toBe("fact");
    });

    it("should filter by multiple types", async () => {
      const result = await store.query({ types: ["fact", "preference"] });
      expect(result.memories.length).toBe(2);
    });

    it("should filter by tags", async () => {
      const result = await store.query({ tags: ["typescript"] });

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].tags).toContain("typescript");
    });

    it("should filter by source", async () => {
      const result = await store.query({ source: "user" });

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].source).toBe("user");
    });

    it("should filter by sessionId", async () => {
      const result = await store.query({ sessionId: "session-1" });
      expect(result.memories.length).toBe(2);
    });

    it("should filter by minImportance", async () => {
      const result = await store.query({ minImportance: 0.6 });

      expect(result.memories.length).toBe(1);
      expect(result.memories[0].importance).toBeGreaterThanOrEqual(0.6);
    });

    it("should filter by createdAfter", async () => {
      const halfDayAgo = Date.now() - 12 * 60 * 60 * 1000;
      const result = await store.query({ createdAfter: halfDayAgo });

      // Only the memory created with "now" should pass (fact with createdAt: now)
      expect(result.memories.length).toBe(1);
    });

    it("should filter by createdBefore", async () => {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const result = await store.query({ createdBefore: dayAgo });

      expect(result.memories.length).toBe(2);
    });

    it("should perform text search", async () => {
      const result = await store.query({ text: "TypeScript" });

      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.meta.method).toBe("text");
    });

    it("should perform semantic search", async () => {
      const embedding = createNormalizedEmbedding(1);
      await store.add(
        createTestMemory({
          content: "Embedded content",
          embedding,
        })
      );

      const result = await store.query({ embedding });

      expect(result.meta.method).toBe("semantic");
    });

    it("should perform hybrid search", async () => {
      const embedding = createNormalizedEmbedding(1);
      await store.add(
        createTestMemory({
          content: "Hybrid content",
          embedding,
        })
      );

      const result = await store.query({ text: "Hybrid", embedding });

      expect(result.meta.method).toBe("hybrid");
    });

    it("should respect limit", async () => {
      const result = await store.query({ limit: 1 });

      expect(result.memories.length).toBe(1);
      expect(result.total).toBe(3);
    });

    it("should include search metadata", async () => {
      const result = await store.query({ text: "test" });

      expect(result.meta.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.meta.query).toBeDefined();
    });

    it("should strip embeddings by default", async () => {
      const embedding = createNormalizedEmbedding(1);
      await store.add(
        createTestMemory({
          content: "Embedded",
          embedding,
        })
      );

      const result = await store.query({ text: "Embedded" });

      expect(result.memories[0].embedding).toBeUndefined();
    });

    it("should include embeddings when requested", async () => {
      const embedding = createNormalizedEmbedding(1);
      await store.add(
        createTestMemory({
          content: "Embedded",
          embedding,
        })
      );

      const result = await store.query({ text: "Embedded", includeEmbeddings: true });

      expect(result.memories[0].embedding).toBeDefined();
    });
  });

  describe("getRecent", () => {
    it("should return most recent memories", async () => {
      const now = Date.now();
      await store.add(createTestMemory({ content: "Old", createdAt: now - 1000 }));
      await store.add(createTestMemory({ content: "New", createdAt: now }));
      await store.add(createTestMemory({ content: "Oldest", createdAt: now - 2000 }));

      const recent = await store.getRecent(2);

      expect(recent.length).toBe(2);
      expect(recent[0].content).toBe("New");
      expect(recent[1].content).toBe("Old");
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 10; i++) {
        await store.add(createTestMemory({ content: `Memory ${i}` }));
      }

      const recent = await store.getRecent(5);
      expect(recent.length).toBe(5);
    });

    it("should return empty array for empty store", async () => {
      const recent = await store.getRecent();
      expect(recent).toEqual([]);
    });
  });

  describe("getByType", () => {
    beforeEach(async () => {
      await store.add(createTestMemory({ type: "fact", importance: 0.5 }));
      await store.add(createTestMemory({ type: "fact", importance: 0.9 }));
      await store.add(createTestMemory({ type: "preference", importance: 0.7 }));
    });

    it("should filter by type", async () => {
      const facts = await store.getByType("fact");

      expect(facts.length).toBe(2);
      expect(facts.every((m) => m.type === "fact")).toBe(true);
    });

    it("should sort by importance", async () => {
      const facts = await store.getByType("fact");

      expect(facts[0].importance).toBe(0.9);
      expect(facts[1].importance).toBe(0.5);
    });

    it("should respect limit", async () => {
      const facts = await store.getByType("fact", 1);
      expect(facts.length).toBe(1);
    });
  });

  describe("getByTags", () => {
    beforeEach(async () => {
      await store.add(createTestMemory({ tags: ["typescript", "language"], importance: 0.5 }));
      await store.add(createTestMemory({ tags: ["typescript", "react"], importance: 0.9 }));
      await store.add(createTestMemory({ tags: ["python"], importance: 0.7 }));
    });

    it("should find memories with matching tags", async () => {
      const results = await store.getByTags(["typescript"]);

      expect(results.length).toBe(2);
    });

    it("should match any of the provided tags", async () => {
      const results = await store.getByTags(["typescript", "python"]);

      expect(results.length).toBe(3);
    });

    it("should sort by importance", async () => {
      const results = await store.getByTags(["typescript"]);

      expect(results[0].importance).toBe(0.9);
    });

    it("should respect limit", async () => {
      const results = await store.getByTags(["typescript"], 1);
      expect(results.length).toBe(1);
    });
  });

  describe("consolidate", () => {
    it("should delete old low-importance memories", async () => {
      const oldTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      await store.add(
        createTestMemory({
          content: "Old unimportant",
          importance: 0.1,
          createdAt: oldTime,
        })
      );
      await store.add(
        createTestMemory({
          content: "New unimportant",
          importance: 0.1,
          createdAt: Date.now(),
        })
      );
      await store.add(
        createTestMemory({
          content: "Old important",
          importance: 0.9,
          createdAt: oldTime,
        })
      );

      const result = await store.consolidate();

      expect(result.deleted).toBeGreaterThanOrEqual(1);
      expect(result.memoriesAfter).toBeLessThan(result.memoriesBefore);
    });

    it("should summarize excess conversation memories", async () => {
      // Add 60 conversation memories
      for (let i = 0; i < 60; i++) {
        await store.add(
          createTestMemory({
            type: "conversation",
            content: `Conversation message ${i}`,
            createdAt: Date.now() - i * 1000,
          })
        );
      }

      const result = await store.consolidate();

      expect(result.summaries.length).toBeGreaterThan(0);
      expect(result.memoriesAfter).toBeLessThan(60);
    });

    it("should track consolidation metrics", async () => {
      await store.add(createTestMemory());

      const result = await store.consolidate();

      expect(result.memoriesBefore).toBeGreaterThanOrEqual(0);
      expect(result.memoriesAfter).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty store", async () => {
      const result = await store.consolidate();

      expect(result.memoriesBefore).toBe(0);
      expect(result.memoriesAfter).toBe(0);
      expect(result.deleted).toBe(0);
    });
  });

  describe("applyDecay", () => {
    it("should decay old memories", async () => {
      const oldTime = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago

      const id = await store.add(
        createTestMemory({
          importance: 1.0,
          createdAt: oldTime,
        })
      );

      // Manually set lastAccessedAt to old time
      await store.update(id, { lastAccessedAt: oldTime });

      const decayed = await store.applyDecay(0.1);
      const memory = await store.get(id);

      expect(decayed).toBe(1);
      expect(memory?.importance).toBeLessThan(1.0);
    });

    it("should not decay recently accessed memories", async () => {
      const id = await store.add(createTestMemory({ importance: 1.0 }));

      // Access it to update lastAccessedAt
      await store.get(id);

      const decayed = await store.applyDecay(0.1);

      expect(decayed).toBe(0);
    });

    it("should return count of decayed memories", async () => {
      const oldTime = Date.now() - 3 * 24 * 60 * 60 * 1000;

      for (let i = 0; i < 5; i++) {
        const id = await store.add(createTestMemory({ importance: 1.0 }));
        await store.update(id, { lastAccessedAt: oldTime });
      }

      const decayed = await store.applyDecay(0.1);
      expect(decayed).toBe(5);
    });
  });

  describe("getStats", () => {
    it("should return total count", async () => {
      await store.add(createTestMemory());
      await store.add(createTestMemory());

      const stats = await store.getStats();

      expect(stats.total).toBe(2);
    });

    it("should count by type", async () => {
      await store.add(createTestMemory({ type: "fact" }));
      await store.add(createTestMemory({ type: "fact" }));
      await store.add(createTestMemory({ type: "preference" }));

      const stats = await store.getStats();

      expect(stats.byType.fact).toBe(2);
      expect(stats.byType.preference).toBe(1);
      expect(stats.byType.error).toBe(0);
    });

    it("should calculate average importance", async () => {
      await store.add(createTestMemory({ importance: 0.2 }));
      await store.add(createTestMemory({ importance: 0.8 }));

      const stats = await store.getStats();

      expect(stats.averageImportance).toBeCloseTo(0.5, 1);
    });

    it("should estimate size in bytes", async () => {
      await store.add(createTestMemory({ content: "Some content here" }));

      const stats = await store.getStats();

      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it("should track oldest and newest", async () => {
      const oldTime = Date.now() - 1000;
      const newTime = Date.now();

      await store.add(createTestMemory({ createdAt: oldTime }));
      await store.add(createTestMemory({ createdAt: newTime }));

      const stats = await store.getStats();

      expect(stats.oldestAt).toBe(oldTime);
      expect(stats.newestAt).toBe(newTime);
    });

    it("should handle empty store", async () => {
      const stats = await store.getStats();

      expect(stats.total).toBe(0);
      expect(stats.averageImportance).toBe(0);
      expect(stats.oldestAt).toBeUndefined();
      expect(stats.newestAt).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("should remove all memories", async () => {
      await store.add(createTestMemory());
      await store.add(createTestMemory());

      await store.clear();

      const stats = await store.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe("getAll", () => {
    it("should return all memories", async () => {
      await store.add(createTestMemory({ content: "Memory 1" }));
      await store.add(createTestMemory({ content: "Memory 2" }));

      const all = store.getAll();

      expect(all.length).toBe(2);
    });

    it("should return empty array for empty store", () => {
      const all = store.getAll();
      expect(all).toEqual([]);
    });
  });

  describe("bulkImport", () => {
    it("should import multiple memories", async () => {
      const memories: Memory[] = [
        {
          id: "imported-1",
          type: "fact",
          content: "Imported 1",
          importance: 0.5,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          source: "import",
          tags: [],
        },
        {
          id: "imported-2",
          type: "fact",
          content: "Imported 2",
          importance: 0.5,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 0,
          source: "import",
          tags: [],
        },
      ];

      const count = await store.bulkImport(memories);

      expect(count).toBe(2);
      expect(await store.get("imported-1")).not.toBeNull();
      expect(await store.get("imported-2")).not.toBeNull();
    });

    it("should preserve original IDs", async () => {
      const memories: Memory[] = [
        {
          id: "custom-id",
          type: "fact",
          content: "Content",
          importance: 0.5,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          accessCount: 5,
          source: "import",
          tags: [],
        },
      ];

      await store.bulkImport(memories);

      const retrieved = await store.get("custom-id");
      expect(retrieved?.id).toBe("custom-id");
      expect(retrieved?.accessCount).toBe(6); // 5 + 1 from get()
    });
  });

  describe("factory function", () => {
    it("should create InMemoryStore instance", () => {
      const store = createInMemoryStore();
      expect(store).toBeInstanceOf(InMemoryStore);
    });
  });
});

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const v1 = [1, 0];
    const v2 = [0, 1];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const v1 = [1, 0];
    const v2 = [-1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
  });

  it("should throw for different dimensions", () => {
    const v1 = [1, 2, 3];
    const v2 = [1, 2];
    expect(() => cosineSimilarity(v1, v2)).toThrow("Vectors must have same dimension");
  });

  it("should handle zero vectors", () => {
    const v1 = [0, 0, 0];
    const v2 = [1, 2, 3];
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });

  it("should be symmetric", () => {
    const v1 = [1, 2, 3];
    const v2 = [4, 5, 6];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(cosineSimilarity(v2, v1), 10);
  });
});

describe("Edge Cases", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it("should handle very long content", async () => {
    const longContent = "A".repeat(100000);
    const id = await store.add(createTestMemory({ content: longContent }));

    const retrieved = await store.get(id);
    expect(retrieved?.content.length).toBe(100000);
  });

  it("should handle special characters in content", async () => {
    const specialContent = "Special 🎉 émojis & symbols <script>alert('xss')</script>";
    const id = await store.add(createTestMemory({ content: specialContent }));

    const retrieved = await store.get(id);
    expect(retrieved?.content).toBe(specialContent);
  });

  it("should handle unicode in tags", async () => {
    const id = await store.add(createTestMemory({ tags: ["日本語", "한국어", "中文"] }));

    const retrieved = await store.get(id);
    expect(retrieved?.tags).toContain("日本語");
  });

  it("should handle empty tags array", async () => {
    await store.add(createTestMemory({ tags: [] }));

    const results = await store.getByTags([]);
    expect(results.length).toBe(0);
  });

  it("should handle high-dimensional embeddings", async () => {
    const embedding = createNormalizedEmbedding(1, 1536);
    await store.add(createTestMemory({ embedding }));

    const results = await store.semanticSearch(embedding, { threshold: 0.9 });
    expect(results.length).toBe(1);
  });

  it("should handle concurrent operations", async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      store.add(createTestMemory({ content: `Concurrent ${i}` }))
    );

    const ids = await Promise.all(promises);
    const stats = await store.getStats();

    expect(ids.length).toBe(100);
    expect(new Set(ids).size).toBe(100); // All unique
    expect(stats.total).toBe(100);
  });
});
