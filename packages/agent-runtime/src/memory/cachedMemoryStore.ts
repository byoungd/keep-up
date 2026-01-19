/**
 * Cached memory store wrapper.
 */

import type { CacheStats } from "../utils/cache";
import { hashStableValue, LRUCache } from "../utils/cache";
import { type MemoryCacheConfig, resolveMemoryCacheConfig } from "./cacheTypes";
import {
  buildCacheKey,
  normalizeCacheText,
  normalizeStringList,
  normalizeTypeList,
} from "./cacheUtils";
import type {
  ConsolidationResult,
  IMemoryStore,
  Memory,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryType,
} from "./types";

type QueryCacheEntry = {
  kind: "query";
  ids: string[];
  scores: number[];
  total: number;
  method: MemorySearchResult["meta"]["method"];
};

type IdListCacheEntry = {
  kind: "ids";
  ids: string[];
};

type MemoryListCacheEntry = {
  kind: "memories";
  memories: Memory[];
};

type MemoryCacheEntry = QueryCacheEntry | IdListCacheEntry | MemoryListCacheEntry;

type ExportableMemoryStore = IMemoryStore & {
  getAll(): Memory[];
  bulkImport(memories: Memory[]): Promise<number>;
};

const DEFAULT_LIMIT = 10;
const DEFAULT_THRESHOLD = 0.7;

export class CachedMemoryStore implements IMemoryStore {
  private readonly inner: IMemoryStore;
  private readonly cache?: LRUCache<MemoryCacheEntry>;

  constructor(inner: IMemoryStore, config?: MemoryCacheConfig) {
    this.inner = inner;
    const resolved = resolveMemoryCacheConfig(config);
    if (resolved?.enableQueryCache) {
      this.cache = new LRUCache<MemoryCacheEntry>(resolved.queryCache);
    }
  }

  async add(memory: Omit<Memory, "id" | "accessCount" | "lastAccessedAt">): Promise<string> {
    const id = await this.inner.add(memory);
    this.invalidateCache();
    return id;
  }

  async get(id: string): Promise<Memory | null> {
    return this.inner.get(id);
  }

  async update(id: string, updates: Partial<Memory>): Promise<void> {
    await this.inner.update(id, updates);
    this.invalidateCache();
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.inner.delete(id);
    if (deleted) {
      this.invalidateCache();
    }
    return deleted;
  }

  async search(
    query: string,
    options?: { limit?: number; types?: MemoryType[] }
  ): Promise<Memory[]> {
    if (!this.cache) {
      return this.inner.search(query, options);
    }

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const key = buildCacheKey("search", {
      text: normalizeCacheText(query),
      types: normalizeTypeList(options?.types),
      limit,
    });

    const cached = this.cache.get(key);
    if (cached?.kind === "ids") {
      const hydrated = await this.hydrateMemories(cached.ids, true);
      if (hydrated) {
        return hydrated;
      }
    }

    const result = await this.inner.search(query, options);
    this.cache.set(key, {
      kind: "ids",
      ids: result.map((memory) => memory.id),
    });
    return result;
  }

  async semanticSearch(
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Promise<Memory[]> {
    if (!this.cache) {
      return this.inner.semanticSearch(embedding, options);
    }

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
    const key = buildCacheKey("semantic", {
      embeddingKey: hashStableValue(embedding),
      limit,
      threshold,
    });

    const cached = this.cache.get(key);
    if (cached?.kind === "ids") {
      const hydrated = await this.hydrateMemories(cached.ids, true);
      if (hydrated) {
        return hydrated;
      }
    }

    const result = await this.inner.semanticSearch(embedding, options);
    this.cache.set(key, {
      kind: "ids",
      ids: result.map((memory) => memory.id),
    });
    return result;
  }

  async query(query: MemoryQuery): Promise<MemorySearchResult> {
    if (!this.cache) {
      return this.inner.query(query);
    }

    const startTime = Date.now();
    const limit = query.limit ?? DEFAULT_LIMIT;
    const includeEmbeddings = query.includeEmbeddings ?? false;
    const key = this.buildQueryKey(query, limit, includeEmbeddings);

    const cached = this.cache.get(key);
    if (cached?.kind === "query") {
      const hydrated = await this.hydrateMemories(cached.ids, includeEmbeddings);
      if (hydrated) {
        return {
          memories: hydrated,
          scores: cached.scores,
          total: cached.total,
          meta: {
            query,
            searchTimeMs: Date.now() - startTime,
            method: cached.method,
          },
        };
      }
    }

    const result = await this.inner.query(query);
    this.cache.set(key, {
      kind: "query",
      ids: result.memories.map((memory) => memory.id),
      scores: result.scores,
      total: result.total,
      method: result.meta.method,
    });
    return result;
  }

  async getRecent(limit = DEFAULT_LIMIT): Promise<Memory[]> {
    if (!this.cache) {
      return this.inner.getRecent(limit);
    }

    const key = buildCacheKey("recent", { limit });
    const cached = this.cache.get(key);
    if (cached?.kind === "memories") {
      return cached.memories.slice();
    }

    const result = await this.inner.getRecent(limit);
    this.cache.set(key, {
      kind: "memories",
      memories: result,
    });
    return result;
  }

  async getByType(type: MemoryType, limit = DEFAULT_LIMIT): Promise<Memory[]> {
    if (!this.cache) {
      return this.inner.getByType(type, limit);
    }

    const key = buildCacheKey("type", { type, limit });
    const cached = this.cache.get(key);
    if (cached?.kind === "memories") {
      return cached.memories.slice();
    }

    const result = await this.inner.getByType(type, limit);
    this.cache.set(key, {
      kind: "memories",
      memories: result,
    });
    return result;
  }

  async getByTags(tags: string[], limit = DEFAULT_LIMIT): Promise<Memory[]> {
    if (!this.cache) {
      return this.inner.getByTags(tags, limit);
    }

    const key = buildCacheKey("tags", {
      tags: normalizeStringList(tags),
      limit,
    });
    const cached = this.cache.get(key);
    if (cached?.kind === "memories") {
      return cached.memories.slice();
    }

    const result = await this.inner.getByTags(tags, limit);
    this.cache.set(key, {
      kind: "memories",
      memories: result,
    });
    return result;
  }

  async consolidate(): Promise<ConsolidationResult> {
    const result = await this.inner.consolidate();
    this.invalidateCache();
    return result;
  }

  async applyDecay(decayRate: number): Promise<number> {
    const result = await this.inner.applyDecay(decayRate);
    if (result > 0) {
      this.invalidateCache();
    }
    return result;
  }

  async getStats(): Promise<MemoryStats> {
    return this.inner.getStats();
  }

  async clear(): Promise<void> {
    await this.inner.clear();
    this.invalidateCache();
  }

  getCacheStats(): CacheStats | undefined {
    return this.cache?.getStats();
  }

  clearCache(): void {
    this.cache?.clear();
  }

  hasExportableInner(): boolean {
    return this.getExportableInner() !== null;
  }

  getAll(): Memory[] {
    const exportable = this.getExportableInner();
    if (!exportable) {
      throw new Error("Export not supported for this store type");
    }
    return exportable.getAll();
  }

  async bulkImport(memories: Memory[]): Promise<number> {
    const exportable = this.getExportableInner();
    if (!exportable) {
      throw new Error("Import not supported for this store type");
    }
    const imported = await exportable.bulkImport(memories);
    if (imported > 0) {
      this.invalidateCache();
    }
    return imported;
  }

  private invalidateCache(): void {
    this.cache?.clear();
  }

  private buildQueryKey(query: MemoryQuery, limit: number, includeEmbeddings: boolean): string {
    return buildCacheKey("query", {
      text: query.text ? normalizeCacheText(query.text) : undefined,
      embeddingKey: query.embedding ? hashStableValue(query.embedding) : undefined,
      types: normalizeTypeList(query.types),
      tags: normalizeStringList(query.tags),
      source: query.source ?? undefined,
      sessionId: query.sessionId ?? undefined,
      minImportance: query.minImportance ?? undefined,
      createdAfter: query.createdAfter ?? undefined,
      createdBefore: query.createdBefore ?? undefined,
      limit,
      includeEmbeddings,
    });
  }

  private async hydrateMemories(
    ids: string[],
    includeEmbeddings: boolean
  ): Promise<Memory[] | null> {
    const memories: Memory[] = [];

    for (const id of ids) {
      const memory = await this.inner.get(id);
      if (!memory) {
        return null;
      }
      memories.push(this.formatMemory(memory, includeEmbeddings));
    }

    return memories;
  }

  private formatMemory(memory: Memory, includeEmbeddings: boolean): Memory {
    if (includeEmbeddings) {
      return memory;
    }
    const { embedding, ...rest } = memory;
    return rest as Memory;
  }

  private getExportableInner(): ExportableMemoryStore | null {
    const inner = this.inner as ExportableMemoryStore;
    if (typeof inner.getAll === "function" && typeof inner.bulkImport === "function") {
      return inner;
    }
    return null;
  }
}

export function createCachedMemoryStore(
  inner: IMemoryStore,
  config?: MemoryCacheConfig
): CachedMemoryStore {
  return new CachedMemoryStore(inner, config);
}
