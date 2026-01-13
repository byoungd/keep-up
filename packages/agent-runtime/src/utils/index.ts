/**
 * Utilities Module
 *
 * Common utilities for the agent runtime.
 */

// Retry utilities
export {
  retry,
  withRetry,
  isRetryableError,
  neverRetry,
  alwaysRetry,
  CircuitBreaker,
  CircuitOpenError,
  createCircuitBreaker,
  type RetryOptions,
  type RetryResult,
  type CircuitBreakerOptions,
  type CircuitState,
} from "./retry";

// Caching utilities
export {
  LRUCache,
  ToolResultCache,
  createCache,
  createToolResultCache,
  type CacheEntry,
  type CacheOptions,
  type CacheStats,
} from "./cache";

// Parallel execution utilities
export {
  executeParallel,
  executeWithDependencies,
  executeBatch,
  createSemaphore,
  withTimeout,
  type ParallelExecutionOptions,
  type ParallelExecutionResult,
  type ToolCallWithDeps,
} from "./parallel";

// Rate limiting utilities
export {
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  ToolRateLimiter,
  createRateLimiter,
  createToolRateLimiter,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitStats,
  type ToolRateLimitConfig,
} from "./rateLimit";

// Resource pooling
export {
  ResourcePool,
  createResourcePool,
  type PoolConfig,
  type PoolStats,
  type ResourceFactory,
  type HealthCheck,
  type ResourceCleanup,
} from "./resourcePool";

// Lazy initialization
export {
  lazy,
  asyncLazy,
  lazyWithDisposal,
  memoize,
  type Lazy,
  type AsyncLazy,
  type LazyOptions,
} from "./lazy";

// Batch processing
export {
  BatchProcessor,
  createBatchProcessor,
  createDebouncedExecutor,
  debounce,
  throttle,
  parallelBatch,
  batchToolCalls,
  type BatchConfig,
  type BatchResult,
  type DebounceConfig,
} from "./batch";
