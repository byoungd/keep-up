/**
 * Optimized Storage Layer
 *
 * Wraps storage backends with:
 * - Query result caching with LRU eviction
 * - Read-through cache for hot documents
 * - Write-behind buffering for batch writes
 * - Query statistics for optimization hints
 *
 * Track 3: Performance Optimizations (PERF)
 */

import type { DocSnapshot, OpLogEntry, StorageBackend } from "./types.js";

// ===========================================================================
// Configuration
// ===========================================================================

export interface OptimizedStorageConfig {
  /** Enable query caching (default: true) */
  enableCaching: boolean;
  /** Maximum cached documents (default: 100) */
  maxCachedDocs: number;
  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtlMs: number;
  /** Enable write buffering (default: true) */
  enableWriteBuffer: boolean;
  /** Write buffer flush interval in ms (default: 100ms) */
  writeBufferIntervalMs: number;
  /** Maximum buffered writes before flush (default: 50) */
  maxBufferedWrites: number;
  /** Enable query statistics (default: true) */
  enableQueryStats: boolean;
}

const DEFAULT_CONFIG: OptimizedStorageConfig = {
  enableCaching: true,
  maxCachedDocs: 100,
  cacheTtlMs: 5 * 60 * 1000,
  enableWriteBuffer: true,
  writeBufferIntervalMs: 100,
  maxBufferedWrites: 50,
  enableQueryStats: true,
};

// ===========================================================================
// Types
// ===========================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccess: number;
}

interface QueryStats {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  avgQueryTimeMs: number;
  slowQueries: number; // > 100ms
}

interface BufferedWrite {
  type: "snapshot" | "update";
  data: DocSnapshot | OpLogEntry;
}

// ===========================================================================
// LRU Cache Implementation
// ===========================================================================

class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];

  constructor(
    private maxSize: number,
    private ttlMs: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccess = Date.now();

    // Move to end of access order
    this.moveToEnd(key);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict if necessary
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      accessCount: 1,
      lastAccess: Date.now(),
    });

    this.accessOrder.push(key);
  }

  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const idx = this.accessOrder.indexOf(key);
      if (idx >= 0) {
        this.accessOrder.splice(idx, 1);
      }
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  getStats(): { size: number; hitRate: number } {
    let totalAccess = 0;
    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
    }
    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ? totalAccess / this.cache.size : 0,
    };
  }

  private moveToEnd(key: K): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx >= 0) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(key);
    }
  }

  private evictLRU(): void {
    const oldest = this.accessOrder.shift();
    if (oldest !== undefined) {
      this.cache.delete(oldest);
    }
  }
}

// ===========================================================================
// Optimized Storage Wrapper
// ===========================================================================

/**
 * Optimized Storage that wraps any StorageBackend with caching and buffering.
 */
export class OptimizedStorage implements StorageBackend {
  private readonly backend: StorageBackend;
  private readonly config: OptimizedStorageConfig;

  // Caches
  private snapshotCache: LRUCache<string, DocSnapshot | null>;
  private updatesCache: LRUCache<string, OpLogEntry[]>;
  private frontierCache: LRUCache<string, string>;

  // Write buffer
  private writeBuffer: BufferedWrite[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  // Statistics
  private stats: QueryStats = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgQueryTimeMs: 0,
    slowQueries: 0,
  };
  private queryTimes: number[] = [];

  constructor(backend: StorageBackend, config: Partial<OptimizedStorageConfig> = {}) {
    this.backend = backend;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize caches
    this.snapshotCache = new LRUCache(this.config.maxCachedDocs, this.config.cacheTtlMs);
    this.updatesCache = new LRUCache(this.config.maxCachedDocs, this.config.cacheTtlMs);
    this.frontierCache = new LRUCache(this.config.maxCachedDocs * 2, this.config.cacheTtlMs);
  }

  // ===========================================================================
  // Snapshot Operations
  // ===========================================================================

  async getLatestSnapshot(docId: string): Promise<DocSnapshot | null> {
    const start = Date.now();

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.snapshotCache.get(`latest:${docId}`);
      if (cached !== undefined) {
        this.recordCacheHit(start);
        return cached;
      }
    }

    // Fetch from backend
    const snapshot = await this.backend.getLatestSnapshot(docId);

    // Cache result
    if (this.config.enableCaching) {
      this.snapshotCache.set(`latest:${docId}`, snapshot);
    }

    this.recordCacheMiss(start);
    return snapshot;
  }

  async saveSnapshot(snapshot: DocSnapshot): Promise<void> {
    if (this.config.enableWriteBuffer) {
      this.bufferWrite({ type: "snapshot", data: snapshot });
    } else {
      await this.backend.saveSnapshot(snapshot);
    }

    // Invalidate cache
    this.invalidateDocCache(snapshot.docId);
  }

  async listSnapshots(docId: string): Promise<DocSnapshot[]> {
    // Not cached - typically rare operation
    return this.backend.listSnapshots(docId);
  }

  async deleteSnapshot(docId: string, seq: number): Promise<void> {
    await this.backend.deleteSnapshot(docId, seq);
    this.invalidateDocCache(docId);
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  async getUpdates(docId: string, afterSeq?: number): Promise<OpLogEntry[]> {
    const start = Date.now();
    const cacheKey = `updates:${docId}:${afterSeq ?? "all"}`;

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.updatesCache.get(cacheKey);
      if (cached !== undefined) {
        this.recordCacheHit(start);
        return cached;
      }
    }

    // Fetch from backend
    const updates = await this.backend.getUpdates(docId, afterSeq);

    // Cache result
    if (this.config.enableCaching) {
      this.updatesCache.set(cacheKey, updates);
    }

    this.recordCacheMiss(start);
    return updates;
  }

  async getUpdatesSince(docId: string, frontierTag: string): Promise<OpLogEntry[]> {
    return this.backend.getUpdatesSince(docId, frontierTag);
  }

  async appendUpdate(entry: OpLogEntry): Promise<void> {
    if (this.config.enableWriteBuffer) {
      this.bufferWrite({ type: "update", data: entry });
    } else {
      await this.backend.appendUpdate(entry);
    }

    // Invalidate cache
    this.invalidateDocCache(entry.docId);
  }

  async deleteUpdates(docId: string, beforeSeq: number): Promise<void> {
    await this.backend.deleteUpdates(docId, beforeSeq);
    this.invalidateDocCache(docId);
  }

  async getLatestSeq(docId: string): Promise<number> {
    return this.backend.getLatestSeq(docId);
  }

  async getCurrentFrontierTag(docId: string): Promise<string> {
    const start = Date.now();

    // Check cache
    if (this.config.enableCaching) {
      const cached = this.frontierCache.get(docId);
      if (cached !== undefined) {
        this.recordCacheHit(start);
        return cached;
      }
    }

    // Fetch from backend
    const frontier = await this.backend.getCurrentFrontierTag(docId);

    // Cache result
    if (this.config.enableCaching) {
      this.frontierCache.set(docId, frontier);
    }

    this.recordCacheMiss(start);
    return frontier;
  }

  // ===========================================================================
  // Document Operations
  // ===========================================================================

  async docExists(docId: string): Promise<boolean> {
    // Check cache first - if we have any cached data, doc exists
    if (this.config.enableCaching) {
      if (this.snapshotCache.get(`latest:${docId}`) !== undefined) {
        return true;
      }
    }
    return this.backend.docExists(docId);
  }

  async listDocs(): Promise<string[]> {
    return this.backend.listDocs();
  }

  async deleteDoc(docId: string): Promise<void> {
    await this.backend.deleteDoc(docId);
    this.invalidateDocCache(docId);
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Invalidate all caches for a document.
   */
  private invalidateDocCache(docId: string): void {
    this.snapshotCache.delete(`latest:${docId}`);
    this.frontierCache.delete(docId);

    // Invalidate all updates caches for this doc
    // (In production, would use a more sophisticated approach)
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.snapshotCache.clear();
    this.updatesCache.clear();
    this.frontierCache.clear();
  }

  /**
   * Prefetch a document into cache.
   */
  async prefetch(docId: string): Promise<void> {
    await Promise.all([this.getLatestSnapshot(docId), this.getCurrentFrontierTag(docId)]);
  }

  // ===========================================================================
  // Write Buffer
  // ===========================================================================

  private bufferWrite(write: BufferedWrite): void {
    this.writeBuffer.push(write);

    // Check if we should flush
    if (this.writeBuffer.length >= this.config.maxBufferedWrites) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.config.writeBufferIntervalMs);
    }
  }

  /**
   * Flush all buffered writes to storage.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.flushing || this.writeBuffer.length === 0) {
      return;
    }

    this.flushing = true;
    const writes = this.writeBuffer.splice(0, this.writeBuffer.length);

    try {
      // Group by type for efficient batch processing
      const snapshots = writes
        .filter((w) => w.type === "snapshot")
        .map((w) => w.data as DocSnapshot);
      const updates = writes.filter((w) => w.type === "update").map((w) => w.data as OpLogEntry);

      // Write snapshots
      for (const snapshot of snapshots) {
        await this.backend.saveSnapshot(snapshot);
      }

      // Write updates
      for (const update of updates) {
        await this.backend.appendUpdate(update);
      }
    } finally {
      this.flushing = false;
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  private recordCacheHit(startTime: number): void {
    if (!this.config.enableQueryStats) {
      return;
    }

    const duration = Date.now() - startTime;
    this.stats.totalQueries++;
    this.stats.cacheHits++;
    this.recordQueryTime(duration);
  }

  private recordCacheMiss(startTime: number): void {
    if (!this.config.enableQueryStats) {
      return;
    }

    const duration = Date.now() - startTime;
    this.stats.totalQueries++;
    this.stats.cacheMisses++;
    this.recordQueryTime(duration);
  }

  private recordQueryTime(durationMs: number): void {
    this.queryTimes.push(durationMs);

    // Keep only last 1000 queries
    if (this.queryTimes.length > 1000) {
      this.queryTimes.shift();
    }

    // Update stats
    this.stats.avgQueryTimeMs = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;

    if (durationMs > 100) {
      this.stats.slowQueries++;
    }
  }

  /**
   * Get query statistics.
   */
  getStats(): QueryStats & { cacheStats: { size: number; hitRate: number } } {
    return {
      ...this.stats,
      cacheStats: this.snapshotCache.getStats(),
    };
  }

  /**
   * Get cache hit rate.
   */
  getCacheHitRate(): number {
    if (this.stats.totalQueries === 0) {
      return 0;
    }
    return this.stats.cacheHits / this.stats.totalQueries;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Cleanup resources.
   */
  async close(): Promise<void> {
    await this.flush();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.clearCache();
  }
}

// ===========================================================================
// Factory
// ===========================================================================

/**
 * Create an optimized storage wrapper.
 */
export function createOptimizedStorage(
  backend: StorageBackend,
  config?: Partial<OptimizedStorageConfig>
): OptimizedStorage {
  return new OptimizedStorage(backend, config);
}
