/**
 * Performance Module
 *
 * Performance optimization utilities for the AI module.
 */

// Cache
export {
  LRUCache,
  type LRUCacheConfig,
  type CacheStats,
  cacheKey,
  memoize,
  memoizeAsync,
} from "./cache";

// Batching
export {
  RequestBatcher,
  type BatchConfig,
  batchify,
  batch,
  parallelBatch,
} from "./batching";

// Lazy Loading
export {
  Lazy,
  LazySync,
  LazyFactory,
  ResourcePool,
  lazy,
  lazySync,
  lazyFactory,
} from "./lazy";
