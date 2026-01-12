/**
 * LRU Cache with TTL
 *
 * High-performance cache for AI operations with:
 * - Least Recently Used (LRU) eviction
 * - Time-To-Live (TTL) expiration
 * - Size-based limits
 * - Hit/miss statistics
 */

/** Cache entry with metadata */
interface CacheEntry<T> {
  value: T;
  createdAt: number;
  lastAccess: number;
  size: number;
}

/** Cache configuration */
export interface LRUCacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** Time-to-live in milliseconds (0 = no expiry) */
  ttlMs: number;
  /** Maximum total size in bytes (0 = no limit) */
  maxSizeBytes: number;
  /** Function to estimate entry size */
  sizeEstimator?: (value: unknown) => number;
}

/** Cache statistics */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  currentEntries: number;
  currentSizeBytes: number;
  hitRate: number;
}

const DEFAULT_CONFIG: LRUCacheConfig = {
  maxEntries: 1000,
  ttlMs: 300000, // 5 minutes
  maxSizeBytes: 0,
  sizeEstimator: undefined,
};

/**
 * LRU Cache with TTL support.
 */
export class LRUCache<K, V> {
  private readonly cache = new Map<K, CacheEntry<V>>();
  private readonly config: LRUCacheConfig;
  private totalSize = 0;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private expirations = 0;

  constructor(config: Partial<LRUCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a value from the cache.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      this.expirations++;
      this.misses++;
      return undefined;
    }

    // Update access time (LRU)
    entry.lastAccess = Date.now();

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache.
   */
  set(key: K, value: V): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Estimate size
    const size = this.estimateSize(value);

    // Evict if necessary
    this.evictIfNeeded(size);

    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      size,
    };

    this.cache.set(key, entry);
    this.totalSize += size;
  }

  /**
   * Check if key exists (without updating LRU).
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(entry)) {
      this.delete(key);
      this.expirations++;
      return false;
    }
    return true;
  }

  /**
   * Delete a key from the cache.
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.totalSize -= entry.size;
    return this.cache.delete(key);
  }

  /**
   * Get or compute a value.
   */
  async getOrCompute(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value);
    return value;
  }

  /**
   * Get or compute synchronously.
   */
  getOrComputeSync(key: K, compute: () => V): V {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value);
    return value;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      expirations: this.expirations,
      currentEntries: this.cache.size,
      currentSizeBytes: this.totalSize,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expirations = 0;
  }

  /**
   * Get all keys.
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Prune expired entries.
   */
  prune(): number {
    let pruned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (this.config.ttlMs > 0 && now - entry.createdAt > this.config.ttlMs) {
        this.delete(key);
        this.expirations++;
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Check if entry is expired.
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    if (this.config.ttlMs === 0) {
      return false;
    }
    return Date.now() - entry.createdAt > this.config.ttlMs;
  }

  /**
   * Estimate size of a value.
   */
  private estimateSize(value: V): number {
    if (this.config.sizeEstimator) {
      return this.config.sizeEstimator(value);
    }

    // Default: rough JSON size estimation
    if (typeof value === "string") {
      return value.length * 2; // UTF-16
    }
    if (typeof value === "number") {
      return 8;
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value).length;
    }
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value).length;
    }
    return 64; // Default size
  }

  /**
   * Evict entries if needed.
   */
  private evictIfNeeded(newEntrySize: number): void {
    // Evict by count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Evict by size
    if (this.config.maxSizeBytes > 0) {
      while (this.totalSize + newEntrySize > this.config.maxSizeBytes && this.cache.size > 0) {
        this.evictLRU();
      }
    }
  }

  /**
   * Evict least recently used entry.
   */
  private evictLRU(): void {
    // Map maintains insertion order, first key is LRU
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      this.evictions++;
    }
  }
}

/**
 * Create a cache key from multiple values.
 */
export function cacheKey(...parts: unknown[]): string {
  return parts
    .map((p) => {
      if (typeof p === "string") {
        return p;
      }
      if (typeof p === "number") {
        return String(p);
      }
      if (typeof p === "boolean") {
        return p ? "1" : "0";
      }
      return JSON.stringify(p);
    })
    .join(":");
}

/**
 * Create a memoized function with LRU cache.
 */
export function memoize<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  options: {
    maxEntries?: number;
    ttlMs?: number;
    keyFn?: (...args: Args) => string;
  } = {}
): (...args: Args) => R {
  const cache = new LRUCache<string, R>({
    maxEntries: options.maxEntries ?? 100,
    ttlMs: options.ttlMs ?? 0,
  });

  const keyFn = options.keyFn ?? ((...args: Args) => cacheKey(...args));

  return (...args: Args): R => {
    const key = keyFn(...args);
    return cache.getOrComputeSync(key, () => fn(...args));
  };
}

/**
 * Create an async memoized function.
 */
export function memoizeAsync<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: {
    maxEntries?: number;
    ttlMs?: number;
    keyFn?: (...args: Args) => string;
  } = {}
): (...args: Args) => Promise<R> {
  const cache = new LRUCache<string, R>({
    maxEntries: options.maxEntries ?? 100,
    ttlMs: options.ttlMs ?? 0,
  });

  // Track in-flight requests to prevent duplicate calls
  const inFlight = new Map<string, Promise<R>>();

  const keyFn = options.keyFn ?? ((...args: Args) => cacheKey(...args));

  return async (...args: Args): Promise<R> => {
    const key = keyFn(...args);

    // Check cache first
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Check if request is already in flight
    const existing = inFlight.get(key);
    if (existing) {
      return existing;
    }

    // Execute and cache
    const promise = fn(...args)
      .then((result) => {
        cache.set(key, result);
        inFlight.delete(key);
        return result;
      })
      .catch((error) => {
        inFlight.delete(key);
        throw error;
      });

    inFlight.set(key, promise);
    return promise;
  };
}
