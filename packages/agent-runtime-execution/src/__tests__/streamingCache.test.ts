/**
 * @file streamingCache.test.ts
 * @description Tests for the StreamingCache
 */

import { describe, expect, it } from "vitest";
import { createStreamingCache } from "../streaming/streamingCache";

describe("StreamingCache", () => {
  // Helper to create async iterable from array
  async function* fromArray<T>(items: T[]): AsyncIterable<T> {
    for (const item of items) {
      yield item;
    }
  }

  // Helper to collect async iterable to array
  async function toArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result: T[] = [];
    for await (const item of iterable) {
      result.push(item);
    }
    return result;
  }

  describe("recordStream", () => {
    it("passes through chunks and caches them", async () => {
      const cache = createStreamingCache<string>();
      const chunks = ["hello", " ", "world"];
      const stream = fromArray(chunks);

      const recorded = cache.recordStream("key1", stream);
      const result = await toArray(recorded);

      expect(result).toEqual(chunks);
      expect(cache.hasStream("key1")).toBe(true);
    });

    it("handles empty streams", async () => {
      const cache = createStreamingCache<string>();
      const stream = fromArray<string>([]);

      const recorded = cache.recordStream("empty", stream);
      const result = await toArray(recorded);

      expect(result).toEqual([]);
      expect(cache.hasStream("empty")).toBe(true);
    });
  });

  describe("replayStream", () => {
    it("replays cached chunks in order", async () => {
      const cache = createStreamingCache<string>();
      const chunks = ["a", "b", "c"];

      // Record
      await toArray(cache.recordStream("key", fromArray(chunks)));

      // Replay
      const replay = cache.replayStream("key");
      expect(replay).toBeDefined();
      if (!replay) {
        throw new Error("Expected replay to be defined");
      }
      const result = await toArray(replay);

      expect(result).toEqual(chunks);
    });

    it("returns undefined for missing keys", () => {
      const cache = createStreamingCache<string>();
      expect(cache.replayStream("nonexistent")).toBeUndefined();
    });

    it("can replay multiple times", async () => {
      const cache = createStreamingCache<string>();
      const chunks = ["x", "y", "z"];

      await toArray(cache.recordStream("multi", fromArray(chunks)));

      const replay1Stream = cache.replayStream("multi");
      const replay2Stream = cache.replayStream("multi");
      if (!replay1Stream || !replay2Stream) {
        throw new Error("Expected replay streams");
      }
      const replay1 = await toArray(replay1Stream);
      const replay2 = await toArray(replay2Stream);

      expect(replay1).toEqual(chunks);
      expect(replay2).toEqual(chunks);
    });
  });

  describe("hasStream", () => {
    it("returns false for non-existent keys", () => {
      const cache = createStreamingCache<string>();
      expect(cache.hasStream("missing")).toBe(false);
    });

    it("returns false for incomplete streams", async () => {
      const cache = createStreamingCache<string>();

      // Create a stream that we won't fully consume
      async function* slowStream(): AsyncIterable<string> {
        yield "first";
        yield "second";
      }

      const iterator = cache.recordStream("incomplete", slowStream())[Symbol.asyncIterator]();
      await iterator.next(); // Only consume first chunk

      expect(cache.hasStream("incomplete")).toBe(false);
    });
  });

  describe("LRU eviction", () => {
    it("evicts least recently accessed entry when maxEntries exceeded", async () => {
      const cache = createStreamingCache<string>({ maxEntries: 2 });

      await toArray(cache.recordStream("a", fromArray(["1"])));
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await toArray(cache.recordStream("b", fromArray(["2"])));

      // Access "a" to make it more recent (replayStream updates lastAccessedAt)
      await new Promise((r) => setTimeout(r, 10));
      const replay = cache.replayStream("a");
      if (replay) {
        await toArray(replay);
      }

      // Add "c", should evict "b" (LRU) because "a" was accessed more recently
      await toArray(cache.recordStream("c", fromArray(["3"])));

      expect(cache.hasStream("a")).toBe(true);
      expect(cache.hasStream("b")).toBe(false);
      expect(cache.hasStream("c")).toBe(true);
    });
  });

  describe("TTL expiration", () => {
    it("expires entries after ttlMs", async () => {
      // Use a very short TTL
      const cache = createStreamingCache<string>({ ttlMs: 50 });

      await toArray(cache.recordStream("expires", fromArray(["x"])));
      expect(cache.hasStream("expires")).toBe(true);

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.hasStream("expires")).toBe(false);
    });
  });

  describe("stats", () => {
    it("tracks hits and misses", async () => {
      const cache = createStreamingCache<string>();

      await toArray(cache.recordStream("key", fromArray(["data"])));

      cache.replayStream("key"); // hit
      cache.replayStream("key"); // hit
      cache.replayStream("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBeCloseTo(2 / 3);
    });

    it("tracks evictions", async () => {
      const cache = createStreamingCache<string>({ maxEntries: 1 });

      await toArray(cache.recordStream("a", fromArray(["1"])));
      await toArray(cache.recordStream("b", fromArray(["2"])));

      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe("clear and invalidate", () => {
    it("clear removes all entries", async () => {
      const cache = createStreamingCache<string>();

      await toArray(cache.recordStream("a", fromArray(["1"])));
      await toArray(cache.recordStream("b", fromArray(["2"])));

      cache.clear();

      expect(cache.hasStream("a")).toBe(false);
      expect(cache.hasStream("b")).toBe(false);
      expect(cache.getStats().entryCount).toBe(0);
    });

    it("invalidate removes specific entry", async () => {
      const cache = createStreamingCache<string>();

      await toArray(cache.recordStream("a", fromArray(["1"])));
      await toArray(cache.recordStream("b", fromArray(["2"])));

      const invalidated = cache.invalidate("a");

      expect(invalidated).toBe(true);
      expect(cache.hasStream("a")).toBe(false);
      expect(cache.hasStream("b")).toBe(true);
    });
  });

  describe("disabled cache", () => {
    it("passes through without caching when disabled", async () => {
      const cache = createStreamingCache<string>({ enabled: false });
      const chunks = ["x", "y"];

      const recorded = cache.recordStream("key", fromArray(chunks));
      const result = await toArray(recorded);

      expect(result).toEqual(chunks);
      expect(cache.hasStream("key")).toBe(false);
    });
  });
});
