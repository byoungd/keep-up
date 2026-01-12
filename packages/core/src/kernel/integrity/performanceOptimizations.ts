/**
 * Large Document Performance Optimizations
 *
 * P1.2: Performance enhancements for documents with >10k blocks:
 * - Decode cache with LRU eviction
 * - Incremental checkpoint verification (dirty regions only)
 * - Block index for O(1) annotation lookup
 * - Prefetch strategy for viewport-based rendering
 */

// ============================================================================
// Types
// ============================================================================

/** Decode cache entry */
export interface DecodeCacheEntry<T> {
  /** Cached value */
  value: T;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Access count */
  accessCount: number;
  /** Size estimate in bytes */
  sizeBytes: number;
}

/** Decode cache configuration */
export interface DecodeCacheConfig {
  /** Maximum cache size in bytes (default: 50MB) */
  maxSizeBytes: number;
  /** Maximum number of entries (default: 10000) */
  maxEntries: number;
  /** Entry TTL in ms (default: 5 minutes) */
  ttlMs: number;
  /** Enable prefetch (default: true) */
  enablePrefetch: boolean;
  /** Prefetch window size (number of blocks) */
  prefetchWindowSize: number;
}

/** Cache statistics */
export interface CacheStats {
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit ratio (0-1) */
  hitRatio: number;
  /** Current entry count */
  entryCount: number;
  /** Current size in bytes */
  sizeBytes: number;
  /** Eviction count */
  evictions: number;
  /** Prefetch count */
  prefetches: number;
}

/** Dirty region tracking */
export interface DirtyRegion {
  /** Block IDs that have been modified */
  blockIds: Set<string>;
  /** Annotation IDs that may be affected */
  annotationIds: Set<string>;
  /** First modification timestamp */
  firstModifiedAt: number;
  /** Last modification timestamp */
  lastModifiedAt: number;
}

/** Incremental verification options */
export interface IncrementalVerificationOptions {
  /** Only verify dirty regions */
  onlyDirtyRegions: boolean;
  /** Dirty region tracker */
  dirtyTracker?: DirtyRegionTracker;
  /** Force full verification (bypasses incremental) */
  forceFull?: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CACHE_CONFIG: DecodeCacheConfig = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  maxEntries: 10000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  enablePrefetch: true,
  prefetchWindowSize: 50,
};

// ============================================================================
// LRU Decode Cache
// ============================================================================

/**
 * LRU Decode Cache
 *
 * High-performance cache for decoded block content with:
 * - LRU eviction policy
 * - Size-based limits
 * - TTL expiration
 * - Prefetch support
 */
export class DecodeCache<T> {
  private cache = new Map<string, DecodeCacheEntry<T>>();
  private config: DecodeCacheConfig;
  private currentSizeBytes = 0;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRatio: 0,
    entryCount: 0,
    sizeBytes: 0,
    evictions: 0,
    prefetches: 0,
  };

  constructor(config: Partial<DecodeCacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get a cached value.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRatio();
      return undefined;
    }

    // Update access stats
    entry.lastAccessedAt = now;
    entry.accessCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    this.updateHitRatio();
    return entry.value;
  }

  /**
   * Set a cached value.
   */
  set(key: string, value: T, sizeBytes?: number): void {
    const estimatedSize = sizeBytes ?? this.estimateSize(value);

    // Check if we need to evict entries
    while (
      (this.currentSizeBytes + estimatedSize > this.config.maxSizeBytes ||
        this.cache.size >= this.config.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictLru();
    }

    // Remove existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSizeBytes -= existing.sizeBytes;
      this.cache.delete(key);
    }

    const now = Date.now();
    const entry: DecodeCacheEntry<T> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      sizeBytes: estimatedSize,
    };

    this.cache.set(key, entry);
    this.currentSizeBytes += estimatedSize;
    this.updateStats();
  }

  /**
   * Check if key exists (and is not expired).
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (now - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a cached entry.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.currentSizeBytes -= entry.sizeBytes;
    this.cache.delete(key);
    this.updateStats();
    return true;
  }

  /**
   * Get or compute a value.
   */
  async getOrCompute(key: string, compute: () => Promise<T>, sizeBytes?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, sizeBytes);
    return value;
  }

  /**
   * Prefetch multiple keys.
   */
  async prefetch(
    keys: string[],
    computeMany: (keys: string[]) => Promise<Map<string, T>>
  ): Promise<void> {
    // Filter to keys not in cache
    const uncached = keys.filter((k) => !this.has(k));
    if (uncached.length === 0) {
      return;
    }

    this.stats.prefetches += uncached.length;

    const results = await computeMany(uncached);
    for (const [key, value] of results) {
      this.set(key, value);
    }
  }

  /**
   * Prefetch blocks in a window around a position.
   */
  async prefetchWindow(
    centerKey: string,
    allKeys: string[],
    computeMany: (keys: string[]) => Promise<Map<string, T>>
  ): Promise<void> {
    if (!this.config.enablePrefetch) {
      return;
    }

    const centerIndex = allKeys.indexOf(centerKey);
    if (centerIndex === -1) {
      return;
    }

    const halfWindow = Math.floor(this.config.prefetchWindowSize / 2);
    const startIndex = Math.max(0, centerIndex - halfWindow);
    const endIndex = Math.min(allKeys.length, centerIndex + halfWindow + 1);

    const windowKeys = allKeys.slice(startIndex, endIndex);
    await this.prefetch(windowKeys, computeMany);
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.updateStats();
  }

  /**
   * Evict expired entries.
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRatio: 0,
      entryCount: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      evictions: 0,
      prefetches: 0,
    };
  }

  /**
   * Evict the least recently used entry.
   */
  private evictLru(): void {
    // Map iteration is in insertion order, so first entry is LRU
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Estimate size of a value.
   */
  private estimateSize(value: T): number {
    // Simple estimation based on JSON serialization
    try {
      return JSON.stringify(value).length * 2; // UTF-16 chars
    } catch {
      return 1024; // Default 1KB if serialization fails
    }
  }

  /**
   * Update hit ratio.
   */
  private updateHitRatio(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRatio = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Update stats.
   */
  private updateStats(): void {
    this.stats.entryCount = this.cache.size;
    this.stats.sizeBytes = this.currentSizeBytes;
  }
}

// ============================================================================
// Dirty Region Tracker
// ============================================================================

/**
 * Dirty Region Tracker
 *
 * Tracks which blocks and annotations have been modified since last checkpoint.
 * Enables incremental verification of only affected regions.
 */
export class DirtyRegionTracker {
  private dirtyBlocks = new Set<string>();
  private dirtyAnnotations = new Set<string>();
  private firstModifiedAt: number | null = null;
  private lastModifiedAt: number | null = null;

  /** Block to annotation mapping for efficient lookup */
  private blockToAnnotations = new Map<string, Set<string>>();

  /**
   * Mark a block as dirty.
   */
  markBlockDirty(blockId: string): void {
    this.dirtyBlocks.add(blockId);
    this.updateTimestamps();

    // Mark associated annotations as potentially dirty
    const annotations = this.blockToAnnotations.get(blockId);
    if (annotations) {
      for (const annoId of annotations) {
        this.dirtyAnnotations.add(annoId);
      }
    }
  }

  /**
   * Mark multiple blocks as dirty.
   */
  markBlocksDirty(blockIds: string[]): void {
    for (const blockId of blockIds) {
      this.markBlockDirty(blockId);
    }
  }

  /**
   * Mark an annotation as dirty.
   */
  markAnnotationDirty(annotationId: string): void {
    this.dirtyAnnotations.add(annotationId);
    this.updateTimestamps();
  }

  /**
   * Register block-annotation association.
   */
  registerBlockAnnotation(blockId: string, annotationId: string): void {
    let annotations = this.blockToAnnotations.get(blockId);
    if (!annotations) {
      annotations = new Set();
      this.blockToAnnotations.set(blockId, annotations);
    }
    annotations.add(annotationId);
  }

  /**
   * Unregister block-annotation association.
   */
  unregisterBlockAnnotation(blockId: string, annotationId: string): void {
    const annotations = this.blockToAnnotations.get(blockId);
    if (annotations) {
      annotations.delete(annotationId);
      if (annotations.size === 0) {
        this.blockToAnnotations.delete(blockId);
      }
    }
  }

  /**
   * Get current dirty region.
   */
  getDirtyRegion(): DirtyRegion {
    return {
      blockIds: new Set(this.dirtyBlocks),
      annotationIds: new Set(this.dirtyAnnotations),
      firstModifiedAt: this.firstModifiedAt ?? Date.now(),
      lastModifiedAt: this.lastModifiedAt ?? Date.now(),
    };
  }

  /**
   * Get dirty block IDs.
   */
  getDirtyBlockIds(): string[] {
    return Array.from(this.dirtyBlocks);
  }

  /**
   * Get dirty annotation IDs.
   */
  getDirtyAnnotationIds(): string[] {
    return Array.from(this.dirtyAnnotations);
  }

  /**
   * Check if any regions are dirty.
   */
  hasDirtyRegions(): boolean {
    return this.dirtyBlocks.size > 0 || this.dirtyAnnotations.size > 0;
  }

  /**
   * Clear dirty state after checkpoint.
   */
  clear(): void {
    this.dirtyBlocks.clear();
    this.dirtyAnnotations.clear();
    this.firstModifiedAt = null;
    this.lastModifiedAt = null;
  }

  /**
   * Get statistics.
   */
  getStats(): {
    dirtyBlockCount: number;
    dirtyAnnotationCount: number;
    blockAnnotationMappings: number;
  } {
    return {
      dirtyBlockCount: this.dirtyBlocks.size,
      dirtyAnnotationCount: this.dirtyAnnotations.size,
      blockAnnotationMappings: this.blockToAnnotations.size,
    };
  }

  /**
   * Update modification timestamps.
   */
  private updateTimestamps(): void {
    const now = Date.now();
    if (this.firstModifiedAt === null) {
      this.firstModifiedAt = now;
    }
    this.lastModifiedAt = now;
  }
}

// ============================================================================
// Block Index
// ============================================================================

/** Block index entry */
export interface BlockIndexEntry {
  /** Block ID */
  blockId: string;
  /** Block position in document order */
  position: number;
  /** Parent block ID (for nested blocks) */
  parentId: string | null;
  /** Depth in document tree */
  depth: number;
  /** Associated annotation IDs */
  annotationIds: Set<string>;
}

/**
 * Block Index
 *
 * Provides O(1) lookup for block-related queries.
 */
export class BlockIndex {
  private byId = new Map<string, BlockIndexEntry>();
  private byPosition: BlockIndexEntry[] = [];
  private annotationToBlocks = new Map<string, Set<string>>();

  /**
   * Build index from block list.
   */
  build(
    blocks: Array<{ blockId: string; parentId?: string | null }>,
    blockAnnotations: Map<string, string[]>
  ): void {
    this.clear();

    let position = 0;
    const depthStack: string[] = [];

    for (const block of blocks) {
      // Calculate depth
      while (depthStack.length > 0 && depthStack[depthStack.length - 1] !== block.parentId) {
        depthStack.pop();
      }
      if (block.parentId) {
        depthStack.push(block.parentId);
      }

      const entry: BlockIndexEntry = {
        blockId: block.blockId,
        position,
        parentId: block.parentId ?? null,
        depth: depthStack.length,
        annotationIds: new Set(blockAnnotations.get(block.blockId) ?? []),
      };

      this.byId.set(block.blockId, entry);
      this.byPosition.push(entry);

      // Build annotation reverse index
      for (const annoId of entry.annotationIds) {
        let blocks = this.annotationToBlocks.get(annoId);
        if (!blocks) {
          blocks = new Set();
          this.annotationToBlocks.set(annoId, blocks);
        }
        blocks.add(block.blockId);
      }

      position++;
    }
  }

  /**
   * Get block by ID.
   */
  getBlock(blockId: string): BlockIndexEntry | undefined {
    return this.byId.get(blockId);
  }

  /**
   * Get block by position.
   */
  getBlockAtPosition(position: number): BlockIndexEntry | undefined {
    return this.byPosition[position];
  }

  /**
   * Get blocks in range.
   */
  getBlocksInRange(startPosition: number, endPosition: number): BlockIndexEntry[] {
    return this.byPosition.slice(startPosition, endPosition);
  }

  /**
   * Get blocks for an annotation.
   */
  getBlocksForAnnotation(annotationId: string): string[] {
    const blocks = this.annotationToBlocks.get(annotationId);
    return blocks ? Array.from(blocks) : [];
  }

  /**
   * Get annotations for a block.
   */
  getAnnotationsForBlock(blockId: string): string[] {
    const entry = this.byId.get(blockId);
    return entry ? Array.from(entry.annotationIds) : [];
  }

  /**
   * Add annotation association.
   */
  addAnnotation(blockId: string, annotationId: string): void {
    const entry = this.byId.get(blockId);
    if (entry) {
      entry.annotationIds.add(annotationId);

      let blocks = this.annotationToBlocks.get(annotationId);
      if (!blocks) {
        blocks = new Set();
        this.annotationToBlocks.set(annotationId, blocks);
      }
      blocks.add(blockId);
    }
  }

  /**
   * Remove annotation association.
   */
  removeAnnotation(blockId: string, annotationId: string): void {
    const entry = this.byId.get(blockId);
    if (entry) {
      entry.annotationIds.delete(annotationId);
    }

    const blocks = this.annotationToBlocks.get(annotationId);
    if (blocks) {
      blocks.delete(blockId);
      if (blocks.size === 0) {
        this.annotationToBlocks.delete(annotationId);
      }
    }
  }

  /**
   * Get total block count.
   */
  size(): number {
    return this.byPosition.length;
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.byId.clear();
    this.byPosition = [];
    this.annotationToBlocks.clear();
  }

  /**
   * Get all block IDs.
   */
  getAllBlockIds(): string[] {
    return this.byPosition.map((e) => e.blockId);
  }
}

// ============================================================================
// Performance Metrics
// ============================================================================

/** Large document performance metrics */
export interface LargeDocPerformanceMetrics {
  /** Decode cache stats */
  decodeCache: CacheStats;
  /** Dirty region stats */
  dirtyRegion: {
    dirtyBlockCount: number;
    dirtyAnnotationCount: number;
  };
  /** Block index stats */
  blockIndex: {
    totalBlocks: number;
    totalAnnotations: number;
  };
  /** Verification stats */
  verification: {
    lastFullScanMs: number;
    lastIncrementalMs: number;
    incrementalRatio: number;
  };
}

/**
 * Create a performance monitor.
 */
export function createPerformanceMonitor(options: {
  decodeCache?: DecodeCache<unknown>;
  dirtyTracker?: DirtyRegionTracker;
  blockIndex?: BlockIndex;
}) {
  let lastFullScanMs = 0;
  let lastIncrementalMs = 0;
  let fullScans = 0;
  let incrementalScans = 0;

  return {
    recordFullScan(durationMs: number) {
      lastFullScanMs = durationMs;
      fullScans++;
    },

    recordIncrementalScan(durationMs: number) {
      lastIncrementalMs = durationMs;
      incrementalScans++;
    },

    getMetrics(): LargeDocPerformanceMetrics {
      const dirtyStats = options.dirtyTracker?.getStats() ?? {
        dirtyBlockCount: 0,
        dirtyAnnotationCount: 0,
      };

      return {
        decodeCache: options.decodeCache?.getStats() ?? {
          hits: 0,
          misses: 0,
          hitRatio: 0,
          entryCount: 0,
          sizeBytes: 0,
          evictions: 0,
          prefetches: 0,
        },
        dirtyRegion: {
          dirtyBlockCount: dirtyStats.dirtyBlockCount,
          dirtyAnnotationCount: dirtyStats.dirtyAnnotationCount,
        },
        blockIndex: {
          totalBlocks: options.blockIndex?.size() ?? 0,
          totalAnnotations: 0, // Would need to track this separately
        },
        verification: {
          lastFullScanMs,
          lastIncrementalMs,
          incrementalRatio:
            fullScans + incrementalScans > 0
              ? incrementalScans / (fullScans + incrementalScans)
              : 0,
        },
      };
    },
  };
}
