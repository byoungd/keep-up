/**
 * Tool Result Cache Tests
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { ToolResultCache } from "../cache";
import { FileToolResultCacheStore } from "../toolResultCacheStore";

describe("ToolResultCache", () => {
  it("evicts entries using LRU-K", () => {
    const cache = new ToolResultCache({ maxEntries: 2, k: 2, defaultTtlMs: 0 });

    cache.set("tool:read", { id: 1 }, "a");
    cache.set("tool:read", { id: 2 }, "b");

    cache.get("tool:read", { id: 1 });

    cache.set("tool:read", { id: 3 }, "c");

    expect(cache.get("tool:read", { id: 2 })).toBeUndefined();
    expect(cache.get("tool:read", { id: 1 })).toBe("a");
  });

  it("extends TTL on hit when sliding TTL is enabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const cache = new ToolResultCache({
      defaultTtlMs: 1000,
      slidingTtl: true,
      ttlStrategy: () => 1000,
    });

    cache.set("tool:test", {}, "value");

    vi.setSystemTime(900);
    expect(cache.get("tool:test", {})).toBe("value");

    vi.setSystemTime(1700);
    expect(cache.get("tool:test", {})).toBe("value");

    vi.setSystemTime(2100);
    expect(cache.get("tool:test", {})).toBe("value");

    vi.setSystemTime(3200);
    expect(cache.get("tool:test", {})).toBeUndefined();

    vi.useRealTimers();
  });

  it("persists cache entries across sessions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "ku0-tool-cache-"));
    const filePath = join(rootDir, "cache.msgpack");

    const store = new FileToolResultCacheStore({ filePath });
    const cache = new ToolResultCache({
      defaultTtlMs: 0,
      persistence: { store },
    });

    cache.set("tool:read", { id: "abc" }, { ok: true });
    await cache.flush();

    const restored = new ToolResultCache({
      defaultTtlMs: 0,
      persistence: { store },
    });
    await restored.hydrate();

    expect(restored.get("tool:read", { id: "abc" })).toEqual({ ok: true });

    await rm(rootDir, { recursive: true, force: true });
  });
});
