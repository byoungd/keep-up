/**
 * Graph Node Cache
 */

import type { GraphNodeCache, GraphNodeCacheEntry } from "./types";

export class InMemoryGraphNodeCache implements GraphNodeCache {
  private readonly entries = new Map<string, GraphNodeCacheEntry>();

  get(key: string): GraphNodeCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.ttlMs !== undefined && Date.now() - entry.storedAt > entry.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, entry: GraphNodeCacheEntry): void {
    this.entries.set(key, entry);
  }
}

export function createGraphNodeCache(): GraphNodeCache {
  return new InMemoryGraphNodeCache();
}
