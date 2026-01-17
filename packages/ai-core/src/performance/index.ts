/**
 * Performance Module
 *
 * Performance optimization utilities for the AI module.
 */

// Batching
export {
  type BatchConfig,
  batch,
  batchify,
  parallelBatch,
  RequestBatcher,
} from "./batching";
// Cache
export {
  type CacheStats,
  cacheKey,
  LRUCache,
  type LRUCacheConfig,
  memoize,
  memoizeAsync,
} from "./cache";

// Lazy Loading
export {
  Lazy,
  LazyFactory,
  LazySync,
  lazy,
  lazyFactory,
  lazySync,
  ResourcePool,
} from "./lazy";
