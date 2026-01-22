/**
 * Caching Utilities
 *
 * Provides caching mechanisms for tool results and LLM responses.
 */

import { fastJsonStringify } from "./json";

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

export interface CacheAdaptiveOptions {
  /** Enable adaptive sizing */
  enabled?: boolean;
  /** Memory pressure threshold to shrink cache (0-1) */
  highWatermark?: number;
  /** Memory pressure threshold to restore cache (0-1) */
  lowWatermark?: number;
  /** Minimum entries when shrinking */
  minEntries?: number;
  /** Minimum size in bytes when shrinking */
  minSizeBytes?: number;
  /** Scale factor when shrinking (0-1) */
  scaleDownFactor?: number;
  /** Custom memory pressure provider (0-1) */
  pressureProvider?: () => number | undefined;
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

  /** Adaptive sizing configuration */
  adaptive?: CacheAdaptiveOptions;
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

export interface ICacheStrategy<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, ttlMs?: number): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  getStats(): CacheStats;
}

// ============================================================================
// Cache Key Helpers
// ============================================================================

type CacheKeyHasher = {
  update(value: string): void;
  digest(): string;
};

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

class Fnv1aHasher implements CacheKeyHasher {
  private hash = FNV_OFFSET;

  update(value: string): void {
    for (let i = 0; i < value.length; i++) {
      this.hash ^= value.charCodeAt(i);
      this.hash = (this.hash * FNV_PRIME) >>> 0;
    }
  }

  digest(): string {
    return this.hash.toString(36);
  }
}

export function createCacheKeyHasher(): CacheKeyHasher {
  return new Fnv1aHasher();
}

export function hashString(value: string): string {
  const hasher = new Fnv1aHasher();
  hasher.update(value);
  return hasher.digest();
}

export function hashStableValue(value: unknown): string {
  const hasher = new Fnv1aHasher();
  appendStableJson(value, hasher, false);
  return hasher.digest();
}

function resolveJsonValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    const jsonValue = value as { toJSON?: () => unknown };
    if (typeof jsonValue.toJSON === "function") {
      return jsonValue.toJSON();
    }
  }
  return value;
}

function isOmittedJsonValue(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

function appendStableJson(value: unknown, hasher: CacheKeyHasher, inArray: boolean): boolean {
  const resolved = resolveJsonValue(value);
  return appendResolvedValue(resolved, hasher, inArray);
}

function appendResolvedValue(value: unknown, hasher: CacheKeyHasher, inArray: boolean): boolean {
  if (isOmittedJsonValue(value)) {
    return appendOmittedValue(hasher, inArray);
  }

  if (value === null) {
    appendNull(hasher);
    return true;
  }

  if (typeof value === "number") {
    return appendNumber(value, hasher);
  }

  if (typeof value === "bigint") {
    appendString(value.toString(), hasher);
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    appendLiteral(value, hasher);
    return true;
  }

  if (Array.isArray(value)) {
    appendArray(value, hasher);
    return true;
  }

  if (typeof value === "object") {
    appendObject(value as Record<string, unknown>, hasher);
    return true;
  }

  appendNull(hasher);
  return true;
}

function appendOmittedValue(hasher: CacheKeyHasher, inArray: boolean): boolean {
  if (!inArray) {
    return false;
  }
  appendNull(hasher);
  return true;
}

function appendNull(hasher: CacheKeyHasher): void {
  hasher.update("null");
}

function appendNumber(value: number, hasher: CacheKeyHasher): boolean {
  if (!Number.isFinite(value)) {
    appendNull(hasher);
    return true;
  }
  hasher.update(JSON.stringify(value));
  return true;
}

function appendString(value: string, hasher: CacheKeyHasher): void {
  hasher.update(JSON.stringify(value));
}

function appendLiteral(value: string | boolean, hasher: CacheKeyHasher): void {
  hasher.update(JSON.stringify(value));
}

function appendArray(values: unknown[], hasher: CacheKeyHasher): void {
  hasher.update("[");
  for (let i = 0; i < values.length; i++) {
    if (i > 0) {
      hasher.update(",");
    }
    appendStableJson(values[i], hasher, true);
  }
  hasher.update("]");
}

function appendObject(obj: Record<string, unknown>, hasher: CacheKeyHasher): void {
  const entries = Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
  hasher.update("{");
  let wroteEntry = false;
  for (const [key, entryValue] of entries) {
    const normalized = resolveJsonValue(entryValue);
    if (isOmittedJsonValue(normalized)) {
      continue;
    }
    if (wroteEntry) {
      hasher.update(",");
    }
    wroteEntry = true;
    hasher.update(JSON.stringify(key));
    hasher.update(":");
    appendStableJson(normalized, hasher, false);
  }
  hasher.update("}");
}

function defaultMemoryPressureProvider(): number | undefined {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
    return undefined;
  }
  const { heapUsed, heapTotal } = process.memoryUsage();
  if (heapTotal <= 0) {
    return undefined;
  }
  return heapUsed / heapTotal;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * LRU (Least Recently Used) cache with TTL support.
 */
export class LRUCache<T> implements ICacheStrategy<string, T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly baseMaxEntries: number;
  private readonly baseMaxSizeBytes: number;
  private readonly defaultTtlMs: number;
  private readonly adaptive?: CacheAdaptiveOptions;
  private readonly pressureProvider?: () => number | undefined;
  private maxEntries: number;
  private maxSizeBytes: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private mostRecentKey?: string;

  private totalHits = 0;
  private totalMisses = 0;
  private currentSizeBytes = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.baseMaxEntries = this.maxEntries;
    this.defaultTtlMs = options.defaultTtlMs ?? 0;
    this.maxSizeBytes = options.maxSizeBytes ?? 50 * 1024 * 1024; // 50MB default
    this.baseMaxSizeBytes = this.maxSizeBytes;
    this.adaptive = options.adaptive?.enabled ? options.adaptive : undefined;
    this.pressureProvider = this.adaptive?.pressureProvider ?? defaultMemoryPressureProvider;

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
    entry.hits++;
    if (key !== this.mostRecentKey) {
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.mostRecentKey = key;
    }

    this.totalHits++;
    return entry.value;
  }

  /**
   * Peek at cache entry metadata without updating access order.
   */
  peekEntry(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key);
  }

  /**
   * Set a value in cache.
   */
  set(key: string, value: T, ttlMs?: number): void {
    this.adjustCapacity();

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
    this.mostRecentKey = key;
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
      const removed = this.cache.delete(key);
      if (removed && key === this.mostRecentKey) {
        this.mostRecentKey = undefined;
      }
      return removed;
    }
    return false;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
    this.mostRecentKey = undefined;
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

  private adjustCapacity(): void {
    if (!this.adaptive) {
      return;
    }
    const pressure = this.pressureProvider?.();
    if (pressure === undefined) {
      return;
    }

    const high = this.adaptive.highWatermark ?? 0.85;
    const low = this.adaptive.lowWatermark ?? 0.65;

    if (pressure >= high) {
      const scaleDownFactor = this.adaptive.scaleDownFactor ?? 0.5;
      const minEntries = Math.min(this.baseMaxEntries, this.adaptive.minEntries ?? 1);
      const scaledEntries = Math.floor(this.baseMaxEntries * scaleDownFactor);
      this.maxEntries = Math.max(minEntries, scaledEntries);

      if (Number.isFinite(this.baseMaxSizeBytes)) {
        const minSizeBytes = Math.min(this.baseMaxSizeBytes, this.adaptive.minSizeBytes ?? 0);
        const scaledSizeBytes = Math.floor(this.baseMaxSizeBytes * scaleDownFactor);
        this.maxSizeBytes = Math.max(minSizeBytes, scaledSizeBytes);
      } else {
        this.maxSizeBytes = this.baseMaxSizeBytes;
      }
      return;
    }

    if (pressure <= low) {
      this.maxEntries = this.baseMaxEntries;
      this.maxSizeBytes = this.baseMaxSizeBytes;
    }
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
      const serialized = fastJsonStringify(value);
      if (typeof serialized === "string") {
        return serialized.length * 2;
      }
      return 1024; // Default estimate for non-serializable objects
    }

    return 64;
  }
}

// ============================================================================
// Tool Result Cache
// ============================================================================

/**
 * Tool result cache persistence store interface.
 */
export interface ToolResultCacheStore {
  load(): Promise<ToolResultCacheSnapshot | null>;
  save(snapshot: ToolResultCacheSnapshot): Promise<void>;
}

export interface ToolResultCacheSnapshot {
  version: number;
  entries: ToolResultCacheEntrySnapshot[];
}

export type ToolResultCacheEntrySnapshot = CacheEntry<unknown> & {
  key: string;
  accessHistory: number[];
};

export interface ToolResultCachePersistence {
  store: ToolResultCacheStore;
  autoFlushIntervalMs?: number;
  flushOnSet?: boolean;
}

export interface ToolResultTtlContext {
  toolName: string;
  args: Record<string, unknown>;
  resultSizeBytes: number;
  hits: number;
  defaultTtlMs: number;
}

export type ToolResultTtlStrategy = (context: ToolResultTtlContext) => number;

export interface ToolResultCacheOptions extends CacheOptions {
  k?: number;
  ttlStrategy?: ToolResultTtlStrategy;
  slidingTtl?: boolean;
  persistence?: ToolResultCachePersistence;
}

type ToolCacheEntry = CacheEntry<unknown> & { accessHistory: number[] };

const DEFAULT_TOOL_TTL_MS = 60_000;
const TOOL_RESULT_CACHE_SNAPSHOT_VERSION = 2;
const DEFAULT_TOOL_TTL_BY_PREFIX: Array<{ prefix: string; ttlMs: number }> = [
  { prefix: "file:", ttlMs: 5 * 60_000 },
  { prefix: "git:", ttlMs: 60_000 },
  { prefix: "web:", ttlMs: 60_000 },
  { prefix: "search:", ttlMs: 60_000 },
  { prefix: "lfcc:", ttlMs: 30_000 },
];

/**
 * Specialized cache for tool results with content-based keys.
 *
 * ## Hydration Behavior
 * When persistence is configured, the cache begins hydrating from storage
 * immediately upon construction. The cache is usable during hydration, but
 * may return cache misses for entries that have not yet been restored.
 * Call `ready()` to await hydration completion if synchronization is required.
 */
export class ToolResultCache {
  private readonly entries = new Map<string, ToolCacheEntry>();
  private readonly baseMaxEntries: number;
  private readonly baseMaxSizeBytes: number;
  private readonly defaultTtlMs: number;
  private readonly k: number;
  private readonly slidingTtl: boolean;
  private readonly ttlStrategy?: ToolResultTtlStrategy;
  private readonly persistence?: ToolResultCachePersistence;
  private readonly adaptive?: CacheAdaptiveOptions;
  private readonly pressureProvider?: () => number | undefined;
  private maxEntries: number;
  private maxSizeBytes: number;
  private currentSizeBytes = 0;
  private totalHits = 0;
  private totalMisses = 0;
  private flushTimer?: ReturnType<typeof setInterval>;
  private hydrationPromise?: Promise<void>;

  constructor(options: ToolResultCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.baseMaxEntries = this.maxEntries;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TOOL_TTL_MS;
    this.maxSizeBytes = options.maxSizeBytes ?? 10 * 1024 * 1024;
    this.baseMaxSizeBytes = this.maxSizeBytes;
    this.k = Math.max(1, options.k ?? 2);
    this.slidingTtl = options.slidingTtl ?? true;
    this.ttlStrategy = options.ttlStrategy;
    this.persistence = options.persistence;
    this.adaptive = options.adaptive?.enabled ? options.adaptive : undefined;
    this.pressureProvider = this.adaptive?.pressureProvider ?? defaultMemoryPressureProvider;

    this.scheduleFlush(options.persistence);
    this.startHydration();
  }

  /**
   * Wait for hydration to complete.
   * Resolves immediately if no persistence is configured or hydration has already finished.
   */
  async ready(): Promise<void> {
    if (this.hydrationPromise) {
      await this.hydrationPromise;
    }
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
    const entry = this.entries.get(key);
    if (!entry) {
      this.totalMisses++;
      return undefined;
    }

    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.deleteEntry(key, entry);
      this.totalMisses++;
      return undefined;
    }

    entry.hits += 1;
    entry.accessHistory.push(Date.now());
    if (entry.accessHistory.length > this.k) {
      entry.accessHistory.shift();
    }

    if (this.slidingTtl && entry.expiresAt > 0) {
      entry.expiresAt = this.computeExpiresAt(toolName, args, entry.sizeBytes, entry.hits);
    }

    this.totalHits++;
    return entry.value;
  }

  /**
   * Cache a tool result.
   */
  set(toolName: string, args: Record<string, unknown>, result: unknown, ttlMs?: number): void {
    const key = this.makeKey(toolName, args);
    const existing = this.entries.get(key);
    if (existing) {
      this.deleteEntry(key, existing);
    }

    this.adjustCapacity();

    const sizeBytes = this.estimateSize(result);
    const resolvedTtl = ttlMs ?? this.resolveTtl(toolName, args, sizeBytes, 0);
    const expiresAt = resolvedTtl > 0 ? Date.now() + resolvedTtl : 0;

    this.evictIfNeeded(sizeBytes);

    const entry: ToolCacheEntry = {
      value: result,
      createdAt: Date.now(),
      expiresAt,
      hits: 0,
      sizeBytes,
      accessHistory: [Date.now()],
    };

    this.entries.set(key, entry);
    this.currentSizeBytes += sizeBytes;
    this.maybeFlush();
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
    const cached = this.get(toolName, args);
    if (cached !== undefined) {
      return cached as T;
    }

    const result = await execute();
    this.set(toolName, args, result, ttlMs);
    return result;
  }

  /**
   * Invalidate cache for a tool.
   */
  invalidate(toolName: string, args?: Record<string, unknown>): void {
    if (args) {
      const key = this.makeKey(toolName, args);
      const entry = this.entries.get(key);
      if (entry) {
        this.deleteEntry(key, entry);
      }
    }
    // Note: full tool invalidation would require tracking all keys per tool
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.totalHits + this.totalMisses;
    return {
      entries: this.entries.size,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: total > 0 ? this.totalHits / total : 0,
      sizeBytes: this.currentSizeBytes,
    };
  }

  /**
   * Clear all cached results.
   */
  clear(): void {
    this.entries.clear();
    this.currentSizeBytes = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
    this.maybeFlush();
  }

  async hydrate(): Promise<void> {
    if (!this.persistence) {
      return;
    }
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = (async () => {
      const snapshot = await this.persistence?.store.load();
      if (!snapshot || snapshot.version !== TOOL_RESULT_CACHE_SNAPSHOT_VERSION) {
        return;
      }

      this.entries.clear();
      this.currentSizeBytes = 0;
      const now = Date.now();

      for (const entry of snapshot.entries) {
        if (entry.expiresAt > 0 && now > entry.expiresAt) {
          continue;
        }
        const restored: ToolCacheEntry = {
          value: entry.value,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          hits: entry.hits,
          sizeBytes: entry.sizeBytes,
          accessHistory: entry.accessHistory ?? [],
        };
        this.entries.set(entry.key, restored);
        this.currentSizeBytes += entry.sizeBytes;
      }

      this.adjustCapacity();
      this.evictIfNeeded(0);
    })();

    return this.hydrationPromise;
  }

  async flush(): Promise<void> {
    if (!this.persistence) {
      return;
    }

    const snapshot: ToolResultCacheSnapshot = {
      version: TOOL_RESULT_CACHE_SNAPSHOT_VERSION,
      entries: Array.from(this.entries.entries()).map(([key, entry]) => ({
        key,
        value: entry.value,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        hits: entry.hits,
        sizeBytes: entry.sizeBytes,
        accessHistory: [...entry.accessHistory],
      })),
    };

    await this.persistence.store.save(snapshot);
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private hashArgs(args: Record<string, unknown>): string {
    return hashStableValue(args);
  }

  private adjustCapacity(): void {
    if (!this.adaptive) {
      return;
    }
    const pressure = this.pressureProvider?.();
    if (pressure === undefined) {
      return;
    }

    const high = this.adaptive.highWatermark ?? 0.85;
    const low = this.adaptive.lowWatermark ?? 0.65;

    if (pressure >= high) {
      const scaleDownFactor = this.adaptive.scaleDownFactor ?? 0.5;
      const minEntries = Math.min(this.baseMaxEntries, this.adaptive.minEntries ?? 1);
      const scaledEntries = Math.floor(this.baseMaxEntries * scaleDownFactor);
      this.maxEntries = Math.max(minEntries, scaledEntries);

      if (Number.isFinite(this.baseMaxSizeBytes)) {
        const minSizeBytes = Math.min(this.baseMaxSizeBytes, this.adaptive.minSizeBytes ?? 0);
        const scaledSizeBytes = Math.floor(this.baseMaxSizeBytes * scaleDownFactor);
        this.maxSizeBytes = Math.max(minSizeBytes, scaledSizeBytes);
      } else {
        this.maxSizeBytes = this.baseMaxSizeBytes;
      }
      return;
    }

    if (pressure <= low) {
      this.maxEntries = this.baseMaxEntries;
      this.maxSizeBytes = this.baseMaxSizeBytes;
    }
  }

  private evictIfNeeded(incomingSizeBytes: number): void {
    while (
      this.entries.size >= this.maxEntries ||
      this.currentSizeBytes + incomingSizeBytes > this.maxSizeBytes
    ) {
      const candidateKey = this.findEvictionCandidate();
      if (!candidateKey) {
        break;
      }
      const entry = this.entries.get(candidateKey);
      if (!entry) {
        break;
      }
      this.deleteEntry(candidateKey, entry);
    }
  }

  private findEvictionCandidate(): string | undefined {
    let candidateKey: string | undefined;
    let candidateScore = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      const score = entry.accessHistory.length >= this.k ? entry.accessHistory[0] : 0;
      if (score < candidateScore) {
        candidateScore = score;
        candidateKey = key;
      }
    }

    return candidateKey;
  }

  private deleteEntry(key: string, entry: ToolCacheEntry): void {
    this.entries.delete(key);
    this.currentSizeBytes -= entry.sizeBytes;
  }

  private resolveTtl(
    toolName: string,
    args: Record<string, unknown>,
    resultSizeBytes: number,
    hits: number
  ): number {
    const base = this.ttlStrategy
      ? this.ttlStrategy({
          toolName,
          args,
          resultSizeBytes,
          hits,
          defaultTtlMs: this.defaultTtlMs,
        })
      : this.resolveBaseTtl(toolName);

    if (base <= 0) {
      return base;
    }

    const hitBoost = Math.min(3, Math.floor(hits / 5)) * 0.2;
    const sizePenalty = resultSizeBytes > 500_000 ? 0.5 : resultSizeBytes > 100_000 ? 0.8 : 1;
    return Math.max(1000, Math.round(base * (1 + hitBoost) * sizePenalty));
  }

  private resolveBaseTtl(toolName: string): number {
    const match = DEFAULT_TOOL_TTL_BY_PREFIX.find((entry) => toolName.startsWith(entry.prefix));
    return match?.ttlMs ?? this.defaultTtlMs;
  }

  private computeExpiresAt(
    toolName: string,
    args: Record<string, unknown>,
    resultSizeBytes: number,
    hits: number
  ): number {
    const ttlMs = this.resolveTtl(toolName, args, resultSizeBytes, hits);
    return ttlMs > 0 ? Date.now() + ttlMs : 0;
  }

  private maybeFlush(): void {
    if (!this.persistence) {
      return;
    }
    if (this.persistence.flushOnSet) {
      void this.flush();
    }
  }

  private scheduleFlush(persistence?: ToolResultCachePersistence): void {
    if (!persistence?.autoFlushIntervalMs) {
      return;
    }
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, persistence.autoFlushIntervalMs);

    if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  private startHydration(): void {
    if (!this.persistence) {
      return;
    }
    void this.hydrate();
  }

  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) {
      return 8;
    }
    if (typeof value === "string") {
      return value.length * 2;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return 8;
    }
    if (Array.isArray(value)) {
      return value.reduce((acc, item) => acc + this.estimateSize(item), 64);
    }
    if (typeof value === "object") {
      const serialized = fastJsonStringify(value);
      if (typeof serialized === "string") {
        return serialized.length * 2;
      }
      return 1024;
    }
    return 64;
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
export function createToolResultCache(options?: ToolResultCacheOptions): ToolResultCache {
  return new ToolResultCache(options);
}
