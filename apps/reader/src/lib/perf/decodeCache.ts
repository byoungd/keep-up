/**
 * Decode Cache
 *
 * LRU cache for decoded CRDT content to avoid redundant decoding.
 * Invalidates on CRDT state changes.
 */

/** Cache entry */
interface CacheEntry<T> {
  value: T;
  stateVersion: string;
  accessedAt: number;
  size: number;
}

/** Cache metrics */
export interface DecodeCacheMetrics {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Current cache size (entries) */
  size: number;
  /** Current cache size (bytes estimate) */
  bytesEstimate: number;
  /** Total evictions */
  evictions: number;
}

/** Decode cache configuration */
export interface DecodeCacheConfig {
  /** Maximum cache entries (default: 100) */
  maxEntries: number;
  /** Maximum cache size in bytes (default: 10MB) */
  maxBytes: number;
  /** TTL in milliseconds (default: 5 minutes) */
  ttlMs: number;
}

const DEFAULT_CONFIG: DecodeCacheConfig = {
  maxEntries: 100,
  maxBytes: 10 * 1024 * 1024, // 10MB
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * LRU cache for decoded content.
 */
export class DecodeCache<T> {
  private config: DecodeCacheConfig;
  private cache = new Map<string, CacheEntry<T>>();
  private metrics: DecodeCacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    size: 0,
    bytesEstimate: 0,
    evictions: 0,
  };
  private totalBytes = 0;

  constructor(config: Partial<DecodeCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a cached value.
   * Returns undefined if not found or stale.
   */
  get(key: string, currentStateVersion: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check if stale (version mismatch)
    if (entry.stateVersion !== currentStateVersion) {
      this.delete(key);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.accessedAt > this.config.ttlMs) {
      this.delete(key);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access time (LRU)
    entry.accessedAt = Date.now();

    this.metrics.hits++;
    this.updateHitRate();
    return entry.value;
  }

  /**
   * Set a cached value.
   */
  set(key: string, value: T, stateVersion: string, sizeEstimate = 0): void {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict if necessary
    while (
      this.cache.size >= this.config.maxEntries ||
      this.totalBytes + sizeEstimate > this.config.maxBytes
    ) {
      if (!this.evictLRU()) {
        break;
      }
    }

    const entry: CacheEntry<T> = {
      value,
      stateVersion,
      accessedAt: Date.now(),
      size: sizeEstimate,
    };

    this.cache.set(key, entry);
    this.totalBytes += sizeEstimate;
    this.updateMetrics();
  }

  /**
   * Delete a cached entry.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.totalBytes -= entry.size;
    this.cache.delete(key);
    this.updateMetrics();
    return true;
  }

  /**
   * Invalidate all entries for a state version.
   */
  invalidateVersion(stateVersion: string): number {
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.stateVersion === stateVersion) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Invalidate all entries.
   */
  invalidateAll(): void {
    this.cache.clear();
    this.totalBytes = 0;
    this.updateMetrics();
  }

  /**
   * Get cache metrics.
   */
  getMetrics(): DecodeCacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: this.cache.size,
      bytesEstimate: this.totalBytes,
      evictions: 0,
    };
  }

  /**
   * Evict least recently used entry.
   */
  private evictLRU(): boolean {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.metrics.evictions++;
      return true;
    }

    return false;
  }

  /**
   * Update hit rate metric.
   */
  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  /**
   * Update size metrics.
   */
  private updateMetrics(): void {
    this.metrics.size = this.cache.size;
    this.metrics.bytesEstimate = this.totalBytes;
  }
}

/**
 * Create a decode cache for document content.
 */
export function createDecodeCache<T>(config?: Partial<DecodeCacheConfig>): DecodeCache<T> {
  return new DecodeCache<T>(config);
}
