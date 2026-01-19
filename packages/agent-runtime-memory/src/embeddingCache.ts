/**
 * Cached embedding provider wrapper.
 */

import { type MemoryCacheConfig, resolveMemoryCacheConfig } from "./cacheTypes";
import { buildCacheKey, normalizeCacheText } from "./cacheUtils";
import type { IEmbeddingProvider } from "./types";
import type { CacheStats } from "./utils/cache";
import { LRUCache } from "./utils/cache";

export class CachedEmbeddingProvider implements IEmbeddingProvider {
  private readonly inner: IEmbeddingProvider;
  private readonly cache?: LRUCache<number[]>;
  private readonly inFlight = new Map<string, Promise<number[]>>();
  private readonly providerId: string;
  private readonly modelId: string;
  private readonly normalizeEmbeddingText: boolean;

  constructor(inner: IEmbeddingProvider, config?: MemoryCacheConfig) {
    this.inner = inner;
    const resolved = resolveMemoryCacheConfig(config);
    if (resolved?.enableEmbeddingCache) {
      this.cache = new LRUCache<number[]>(resolved.embeddingCache);
    }
    this.providerId = resolved?.embeddingProviderId ?? "default";
    this.modelId = resolved?.embeddingModelId ?? "default";
    this.normalizeEmbeddingText = resolved?.normalizeEmbeddingText ?? false;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.cache) {
      return this.inner.embed(text);
    }

    const key = this.buildKey(text);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.inner
      .embed(text)
      .then((embedding) => {
        this.cache?.set(key, embedding);
        return embedding;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.cache) {
      return this.inner.embedBatch(texts);
    }

    if (texts.length === 0) {
      return [];
    }

    const plan = this.prepareBatch(texts);

    await this.resolveMissingBatch(plan);
    await this.resolvePendingBatch(plan);

    return this.finalizeBatch(plan.results);
  }

  getDimension(): number {
    return this.inner.getDimension();
  }

  getCacheStats(): CacheStats | undefined {
    return this.cache?.getStats();
  }

  clearCache(): void {
    this.cache?.clear();
  }

  private buildKey(text: string): string {
    return buildCacheKey("embedding", {
      providerId: this.providerId,
      modelId: this.modelId,
      text: this.normalizeEmbeddingText ? normalizeCacheText(text) : text,
    });
  }

  private prepareBatch(texts: string[]): BatchPlan {
    const results: Array<number[] | undefined> = new Array(texts.length);
    const pending: PendingBatchEntry[] = [];
    const missingKeys: string[] = [];
    const missingTexts: string[] = [];
    const missingIndexMap = new Map<string, number[]>();

    for (const [index, text] of texts.entries()) {
      const key = this.buildKey(text);
      const cached = this.cache?.get(key);
      if (cached) {
        results[index] = cached;
        continue;
      }

      const inFlight = this.inFlight.get(key);
      if (inFlight) {
        pending.push({ indices: [index], promise: inFlight });
        continue;
      }

      const existing = missingIndexMap.get(key);
      if (existing) {
        existing.push(index);
        continue;
      }

      missingKeys.push(key);
      missingTexts.push(text);
      missingIndexMap.set(key, [index]);
    }

    return { results, pending, missingKeys, missingTexts, missingIndexMap };
  }

  private async resolveMissingBatch(plan: BatchPlan): Promise<void> {
    if (plan.missingTexts.length === 0) {
      return;
    }

    const batchPromise = this.inner.embedBatch(plan.missingTexts);

    for (const [idx, key] of plan.missingKeys.entries()) {
      const promise = batchPromise
        .then((embeddings) => embeddings[idx])
        .finally(() => {
          this.inFlight.delete(key);
        });
      this.inFlight.set(key, promise);
    }

    const embeddings = await batchPromise;
    for (const [idx, key] of plan.missingKeys.entries()) {
      const embedding = embeddings[idx];
      this.cache?.set(key, embedding);
      const indices = plan.missingIndexMap.get(key) ?? [];
      for (const index of indices) {
        plan.results[index] = embedding;
      }
    }
  }

  private async resolvePendingBatch(plan: BatchPlan): Promise<void> {
    if (plan.pending.length === 0) {
      return;
    }

    const resolved = await Promise.all(plan.pending.map((entry) => entry.promise));
    for (const [idx, entry] of plan.pending.entries()) {
      for (const index of entry.indices) {
        plan.results[index] = resolved[idx];
      }
    }
  }

  private finalizeBatch(results: Array<number[] | undefined>): number[][] {
    return results.map((embedding) => {
      if (!embedding) {
        throw new Error("Embedding cache missing result");
      }
      return embedding;
    });
  }
}

type PendingBatchEntry = {
  indices: number[];
  promise: Promise<number[]>;
};

type BatchPlan = {
  results: Array<number[] | undefined>;
  pending: PendingBatchEntry[];
  missingKeys: string[];
  missingTexts: string[];
  missingIndexMap: Map<string, number[]>;
};

export function createCachedEmbeddingProvider(
  inner: IEmbeddingProvider,
  config?: MemoryCacheConfig
): CachedEmbeddingProvider {
  return new CachedEmbeddingProvider(inner, config);
}
