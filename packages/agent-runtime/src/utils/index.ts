/**
 * Utilities Module
 *
 * Common utilities for the agent runtime.
 */

// Batch processing
export {
  type BatchConfig,
  BatchProcessor,
  type BatchResult,
  batchToolCalls,
  createBatchProcessor,
  createDebouncedExecutor,
  type DebounceConfig,
  debounce,
  parallelBatch,
  throttle,
} from "./batch";

// Caching utilities
export {
  type CacheEntry,
  type CacheOptions,
  type CacheStats,
  createCache,
  createToolResultCache,
  LRUCache,
  ToolResultCache,
  type ToolResultCacheOptions,
  type ToolResultCachePersistence,
  type ToolResultCacheSnapshot,
  type ToolResultCacheStore,
  type ToolResultTtlContext,
  type ToolResultTtlStrategy,
} from "./cache";
// YAML frontmatter parsing
export {
  extractFrontmatter,
  type FrontmatterResult,
  type GenericSkillMeta,
  grayMatter,
  type PromptTemplateMeta,
  parseFrontmatter,
  parseGenericSkillMeta,
  parsePromptTemplate,
  stringifyWithFrontmatter,
} from "./frontmatter";
// Lazy initialization
export {
  type AsyncLazy,
  asyncLazy,
  type Lazy,
  type LazyOptions,
  lazy,
  lazyWithDisposal,
  memoize,
} from "./lazy";
// LLM response parsing
export { parseJsonFromText } from "./llmJson";
// Pino-based structured logging
export {
  createChildLogger,
  createLogger,
  createRuntimeLogger,
  getLogger,
  type Logger,
  type LoggerConfig,
  type RuntimeLogger,
} from "./logger";
// Parallel execution utilities
export {
  createSemaphore,
  executeBatch,
  executeParallel,
  executeWithDependencies,
  type ParallelExecutionOptions,
  type ParallelExecutionResult,
  type ToolCallWithDeps,
  withTimeout,
} from "./parallel";
// Rate limiting utilities
export {
  createRateLimiter,
  createToolRateLimiter,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitStats,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
  type ToolRateLimitConfig,
  ToolRateLimiter,
} from "./rateLimit";
// Resource pooling
export {
  createResourcePool,
  type HealthCheck,
  type PoolConfig,
  type PoolStats,
  type ResourceCleanup,
  type ResourceFactory,
  ResourcePool,
} from "./resourcePool";
// Retry utilities
export {
  alwaysRetry,
  CircuitBreaker,
  type CircuitBreakerOptions,
  CircuitOpenError,
  type CircuitState,
  createCircuitBreaker,
  isRetryableError,
  neverRetry,
  type RetryOptions,
  type RetryResult,
  retry,
  withRetry,
} from "./retry";
// Tool activity helpers
export {
  formatToolActivityLabel,
  formatToolActivityMessage,
  resolveToolActivity,
  type ToolActivity,
} from "./toolActivity";
export {
  FileToolResultCacheStore,
  type FileToolResultCacheStoreConfig,
} from "./toolResultCacheStore";
