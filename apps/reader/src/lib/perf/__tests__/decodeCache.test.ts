/**
 * Decode Cache Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { DecodeCache } from "../decodeCache";

describe("DecodeCache", () => {
  let cache: DecodeCache<string>;

  beforeEach(() => {
    cache = new DecodeCache<string>({
      maxEntries: 5,
      maxBytes: 1000,
      ttlMs: 60000,
    });
  });

  describe("basic operations", () => {
    it("should store and retrieve values", () => {
      cache.set("key1", "value1", "v1", 100);
      const result = cache.get("key1", "v1");
      expect(result).toBe("value1");
    });

    it("should return undefined for missing keys", () => {
      const result = cache.get("missing", "v1");
      expect(result).toBeUndefined();
    });

    it("should delete entries", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.delete("key1");
      const result = cache.get("key1", "v1");
      expect(result).toBeUndefined();
    });
  });

  describe("version invalidation", () => {
    it("should return undefined for stale version", () => {
      cache.set("key1", "value1", "v1", 100);
      const result = cache.get("key1", "v2");
      expect(result).toBeUndefined();
    });

    it("should invalidate all entries for a version", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.set("key2", "value2", "v1", 100);
      cache.set("key3", "value3", "v2", 100);

      const count = cache.invalidateVersion("v1");

      expect(count).toBe(2);
      expect(cache.get("key1", "v1")).toBeUndefined();
      expect(cache.get("key2", "v1")).toBeUndefined();
      expect(cache.get("key3", "v2")).toBe("value3");
    });

    it("should invalidate all entries", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.set("key2", "value2", "v2", 100);

      cache.invalidateAll();

      expect(cache.get("key1", "v1")).toBeUndefined();
      expect(cache.get("key2", "v2")).toBeUndefined();
    });
  });

  describe("LRU eviction", () => {
    it("should evict entries when max entries exceeded", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.set("key2", "value2", "v1", 100);
      cache.set("key3", "value3", "v1", 100);
      cache.set("key4", "value4", "v1", 100);
      cache.set("key5", "value5", "v1", 100);

      // Add new entry - should trigger eviction
      cache.set("key6", "value6", "v1", 100);

      // Should have evicted one entry
      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(5);
      expect(metrics.evictions).toBe(1);

      // key6 should be present
      expect(cache.get("key6", "v1")).toBe("value6");
    });

    it("should evict when max bytes exceeded", () => {
      cache.set("key1", "value1", "v1", 400);
      cache.set("key2", "value2", "v1", 400);

      // This should trigger eviction
      cache.set("key3", "value3", "v1", 400);

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBeGreaterThan(0);
    });
  });

  describe("metrics", () => {
    it("should track hits and misses", () => {
      cache.set("key1", "value1", "v1", 100);

      cache.get("key1", "v1"); // hit
      cache.get("key1", "v1"); // hit
      cache.get("missing", "v1"); // miss

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it("should track size", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.set("key2", "value2", "v1", 200);

      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.bytesEstimate).toBe(300);
    });

    it("should reset metrics", () => {
      cache.set("key1", "value1", "v1", 100);
      cache.get("key1", "v1");
      cache.get("missing", "v1");

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      // Size should still be tracked
      expect(metrics.size).toBe(1);
    });
  });
});
