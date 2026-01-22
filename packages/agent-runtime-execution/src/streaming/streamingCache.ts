/**
 * Streaming LLM Cache
 *
 * Caches streaming LLM responses for instant replay of repeated queries.
 * Features:
 * - Chunk-based caching for streaming responses
 * - LRU eviction when cache size is exceeded
 * - Replay functionality for cached streams
 * - TTL-based expiration
 *
 * @example
 * ```typescript
 * const cache = createStreamingCache({ maxEntries: 100, ttlMs: 60000 });
 *
 * // Record a stream
 * const stream = llm.streamComplete(request);
 * const cachedStream = cache.recordStream(cacheKey, stream);
 *
 * // Later, replay if cached
 * if (cache.hasStream(cacheKey)) {
 *   const replayStream = cache.replayStream(cacheKey);
 *   // Use replayStream instead of calling LLM again
 * }
 * ```
 *
 * @module streaming/streamingCache
 */

// ============================================================================
// Types
// ============================================================================

/** Configuration for the streaming cache */
export interface StreamingCacheConfig {
  /** Maximum number of entries in the cache (default: 100) */
  readonly maxEntries?: number;
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  readonly ttlMs?: number;
  /** Whether to enable cache (default: true) */
  readonly enabled?: boolean;
}

/** Statistics about the streaming cache */
export interface StreamingCacheStats {
  /** Number of entries currently in the cache */
  readonly entryCount: number;
  /** Total number of cache hits */
  readonly hits: number;
  /** Total number of cache misses */
  readonly misses: number;
  /** Total number of entries evicted */
  readonly evictions: number;
  /** Total number of entries expired */
  readonly expirations: number;
  /** Hit ratio (hits / (hits + misses)) */
  readonly hitRatio: number;
}

/** A cached streaming entry */
interface CacheEntry<T> {
  chunks: T[];
  createdAt: number;
  lastAccessedAt: number;
  complete: boolean;
}

/** Interface for streaming cache operations */
export interface IStreamingCache<T> {
  /** Check if a stream is cached (and not expired) */
  hasStream(key: string): boolean;
  /** Replay a cached stream as an async iterable */
  replayStream(key: string): AsyncIterable<T> | undefined;
  /** Record a stream while passing through chunks */
  recordStream(key: string, stream: AsyncIterable<T>): AsyncIterable<T>;
  /** Get cache statistics */
  getStats(): StreamingCacheStats;
  /** Clear all cache entries */
  clear(): void;
  /** Invalidate a specific cache entry */
  invalidate(key: string): boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Implementation
// ============================================================================

/**
 * LRU cache for streaming LLM responses.
 *
 * Records streams as they are consumed, then replays them
 * synchronously for subsequent requests with the same key.
 */
export class StreamingCache<T> implements IStreamingCache<T> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly enabled: boolean;
  private readonly cache = new Map<string, CacheEntry<T>>();

  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(config: StreamingCacheConfig = {}) {
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Check if a stream is cached and not expired.
   */
  hasStream(key: string): boolean {
    if (!this.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.expirations++;
      return false;
    }

    // Must be complete to be replayable
    return entry.complete;
  }

  /**
   * Replay a cached stream.
   * Returns undefined if not cached or expired.
   */
  replayStream(key: string): AsyncIterable<T> | undefined {
    if (!this.enabled) {
      this.misses++;
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry || !entry.complete) {
      this.misses++;
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }

    // Update LRU
    entry.lastAccessedAt = Date.now();
    this.hits++;

    // Return async iterable that replays chunks
    const chunks = entry.chunks;
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        let index = 0;
        return {
          async next(): Promise<IteratorResult<T>> {
            if (index < chunks.length) {
              return { value: chunks[index++], done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    };
  }

  /**
   * Record a stream while passing through chunks.
   * If caching is disabled, just returns the original stream.
   */
  recordStream(key: string, stream: AsyncIterable<T>): AsyncIterable<T> {
    if (!this.enabled) {
      return stream;
    }

    // Check for existing incomplete entry
    if (this.cache.has(key)) {
      const existing = this.cache.get(key);
      if (existing?.complete) {
        // Already cached, just return replay stream
        return this.replayStream(key) ?? stream;
      }
      // Incomplete entry, delete and re-record
      this.cache.delete(key);
    }

    // Ensure space for new entry
    this.maybeEvict();

    // Create new entry
    const entry: CacheEntry<T> = {
      chunks: [],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      complete: false,
    };
    this.cache.set(key, entry);

    // Return a passthrough stream that records chunks
    const cache = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        const iterator = stream[Symbol.asyncIterator]();
        return {
          async next(): Promise<IteratorResult<T>> {
            try {
              const result = await iterator.next();
              if (result.done) {
                entry.complete = true;
                return { value: undefined, done: true };
              }
              entry.chunks.push(result.value);
              entry.lastAccessedAt = Date.now();
              return { value: result.value, done: false };
            } catch (error) {
              // Remove incomplete entry on error
              cache.cache.delete(key);
              throw error;
            }
          },
          async return(value?: T): Promise<IteratorResult<T>> {
            // Stream was terminated early, mark as complete anyway
            entry.complete = true;
            if (iterator.return) {
              return iterator.return(value);
            }
            return { value: undefined as T, done: true };
          },
          async throw(error?: unknown): Promise<IteratorResult<T>> {
            // Remove incomplete entry on error
            cache.cache.delete(key);
            if (iterator.throw) {
              return iterator.throw(error);
            }
            throw error;
          },
        };
      },
    };
  }

  /**
   * Get cache statistics.
   */
  getStats(): StreamingCacheStats {
    const total = this.hits + this.misses;
    return {
      entryCount: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      hitRatio: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > this.ttlMs;
  }

  private maybeEvict(): void {
    if (this.cache.size < this.maxEntries) {
      return;
    }

    // Find LRU entry
    let lruKey: string | undefined;
    let lruTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < lruTime) {
        lruKey = key;
        lruTime = entry.lastAccessedAt;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.evictions++;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new StreamingCache instance.
 *
 * @param config - Configuration options
 * @returns IStreamingCache instance
 */
export function createStreamingCache<T>(config?: StreamingCacheConfig): IStreamingCache<T> {
  return new StreamingCache<T>(config);
}
