/**
 * Caching Utilities
 *
 * Provides caching mechanisms for tool results and LLM responses.
 */

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
  /** The cached value */
  value: T;

  /** When the entry was created */
  createdAt: number;

  /** When the entry expires (0 = never) */
  expiresAt: number;

  /** Number of times this entry was accessed */
  hits: number;

  /** Size estimate in bytes (for memory management) */
  sizeBytes: number;
}

export interface CacheOptions {
  /** Maximum number of entries */
  maxEntries?: number;

  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTtlMs?: number;

  /** Maximum total size in bytes (approximate) */
  maxSizeBytes?: number;

  /** Eviction policy */
  evictionPolicy?: "lru" | "lfu" | "fifo";

  /**
   * Auto-cleanup interval in milliseconds.
   * When set, automatically prunes expired entries on this interval.
   * @default 0 (disabled)
   */
  autoCleanupIntervalMs?: number;
}

export interface CacheStats {
  /** Total number of entries */
  entries: number;

  /** Number of cache hits */
  hits: number;

  /** Number of cache misses */
  misses: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Approximate size in bytes */
  sizeBytes: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * LRU (Least Recently Used) cache with TTL support.
 */
export class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly maxSizeBytes: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  private totalHits = 0;
  private totalMisses = 0;
  private currentSizeBytes = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 0;
    this.maxSizeBytes = options.maxSizeBytes ?? 50 * 1024 * 1024; // 50MB default

    // Start auto-cleanup if configured
    const autoCleanupIntervalMs = options.autoCleanupIntervalMs ?? 0;
    if (autoCleanupIntervalMs > 0) {
      this.startAutoCleanup(autoCleanupIntervalMs);
    }
  }

  /**
   * Start automatic cleanup of expired entries.
   */
  startAutoCleanup(intervalMs: number): void {
    this.stopAutoCleanup();
    this.cleanupTimer = setInterval(() => {
      this.prune();
    }, intervalMs);

    // Don't prevent process exit
    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop automatic cleanup.
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Dispose the cache and stop all timers.
   */
  dispose(): void {
    this.stopAutoCleanup();
    this.clear();
  }

  /**
   * Get a value from cache.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return undefined;
    }

    // Check expiration
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.delete(key);
      this.totalMisses++;
      return undefined;
    }

    // Update access order (move to end for LRU)
    this.cache.delete(key);
    entry.hits++;
    this.cache.set(key, entry);

    this.totalHits++;
    return entry.value;
  }

  /**
   * Set a value in cache.
   */
  set(key: string, value: T, ttlMs?: number): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const sizeBytes = this.estimateSize(value);
    const actualTtl = ttlMs ?? this.defaultTtlMs;

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: actualTtl > 0 ? Date.now() + actualTtl : 0,
      hits: 0,
      sizeBytes,
    };

    // Evict if necessary
    this.evictIfNeeded(sizeBytes);

    this.cache.set(key, entry);
    this.currentSizeBytes += sizeBytes;
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.sizeBytes;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.totalHits + this.totalMisses;
    return {
      entries: this.cache.size,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: total > 0 ? this.totalHits / total : 0,
      sizeBytes: this.currentSizeBytes,
    };
  }

  /**
   * Get or compute a value (cache-aside pattern).
   */
  async getOrCompute(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Remove expired entries.
   */
  prune(): number {
    let pruned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  private evictIfNeeded(incomingSizeBytes: number): void {
    // Evict while over limits
    while (
      this.cache.size >= this.maxEntries ||
      this.currentSizeBytes + incomingSizeBytes > this.maxSizeBytes
    ) {
      // LRU: remove first (oldest) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.delete(firstKey);
      } else {
        break;
      }
    }
  }

  private estimateSize(value: unknown): number {
    // Rough size estimation
    if (value === null || value === undefined) {
      return 8;
    }

    if (typeof value === "string") {
      return value.length * 2; // UTF-16
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return 8;
    }

    if (Array.isArray(value)) {
      return value.reduce((acc, item) => acc + this.estimateSize(item), 64);
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024; // Default estimate for non-serializable objects
      }
    }

    return 64;
  }
}

// ============================================================================
// Tool Result Cache
// ============================================================================

/**
 * Specialized cache for tool results with content-based keys.
 */
export class ToolResultCache {
  private readonly cache: LRUCache<unknown>;

  constructor(options: CacheOptions = {}) {
    this.cache = new LRUCache({
      maxEntries: options.maxEntries ?? 500,
      defaultTtlMs: options.defaultTtlMs ?? 60_000, // 1 minute default
      maxSizeBytes: options.maxSizeBytes ?? 10 * 1024 * 1024, // 10MB default
    });
  }

  /**
   * Generate cache key for a tool call.
   */
  makeKey(toolName: string, args: Record<string, unknown>): string {
    const argsHash = this.hashArgs(args);
    return `${toolName}:${argsHash}`;
  }

  /**
   * Get cached result for a tool call.
   */
  get(toolName: string, args: Record<string, unknown>): unknown | undefined {
    const key = this.makeKey(toolName, args);
    return this.cache.get(key);
  }

  /**
   * Cache a tool result.
   */
  set(toolName: string, args: Record<string, unknown>, result: unknown, ttlMs?: number): void {
    const key = this.makeKey(toolName, args);
    this.cache.set(key, result, ttlMs);
  }

  /**
   * Get or execute tool (cache-aside pattern).
   */
  async getOrExecute<T>(
    toolName: string,
    args: Record<string, unknown>,
    execute: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const key = this.makeKey(toolName, args);
    return this.cache.getOrCompute(key, execute, ttlMs) as Promise<T>;
  }

  /**
   * Invalidate cache for a tool.
   */
  invalidate(toolName: string, args?: Record<string, unknown>): void {
    if (args) {
      const key = this.makeKey(toolName, args);
      this.cache.delete(key);
    }
    // Note: full tool invalidation would require tracking all keys per tool
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Clear all cached results.
   */
  clear(): void {
    this.cache.clear();
  }

  private hashArgs(args: Record<string, unknown>): string {
    // Simple hash based on JSON representation
    const json = JSON.stringify(args, Object.keys(args).sort());
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
      const char = json.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an LRU cache.
 */
export function createCache<T>(options?: CacheOptions): LRUCache<T> {
  return new LRUCache<T>(options);
}

/**
 * Create a tool result cache.
 */
export function createToolResultCache(options?: CacheOptions): ToolResultCache {
  return new ToolResultCache(options);
}
