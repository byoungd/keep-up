/**
 * Memory cache configuration types.
 */

import type { CacheOptions } from "../utils/cache";

export interface MemoryCacheConfig {
  enableQueryCache?: boolean;
  enableEmbeddingCache?: boolean;
  queryCache?: CacheOptions;
  embeddingCache?: CacheOptions;
  embeddingProviderId?: string;
  embeddingModelId?: string;
  normalizeEmbeddingText?: boolean;
}

export interface ResolvedMemoryCacheConfig {
  enableQueryCache: boolean;
  enableEmbeddingCache: boolean;
  queryCache: CacheOptions;
  embeddingCache: CacheOptions;
  embeddingProviderId: string;
  embeddingModelId: string;
  normalizeEmbeddingText: boolean;
}

const DEFAULT_QUERY_CACHE: CacheOptions = {
  maxEntries: 500,
  defaultTtlMs: 5_000,
};

const DEFAULT_EMBEDDING_CACHE: CacheOptions = {
  maxEntries: 2_000,
  defaultTtlMs: 60 * 60_000,
};

export function resolveMemoryCacheConfig(
  config?: MemoryCacheConfig
): ResolvedMemoryCacheConfig | undefined {
  if (!config) {
    return undefined;
  }

  return {
    enableQueryCache: config.enableQueryCache ?? true,
    enableEmbeddingCache: config.enableEmbeddingCache ?? true,
    queryCache: { ...DEFAULT_QUERY_CACHE, ...config.queryCache },
    embeddingCache: { ...DEFAULT_EMBEDDING_CACHE, ...config.embeddingCache },
    embeddingProviderId: config.embeddingProviderId ?? "default",
    embeddingModelId: config.embeddingModelId ?? "default",
    normalizeEmbeddingText: config.normalizeEmbeddingText ?? false,
  };
}
