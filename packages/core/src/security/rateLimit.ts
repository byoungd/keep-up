/**
 * LFCC v0.9 RC - Track 11: Rate Limiter
 *
 * Token bucket rate limiter for WebSocket message throttling.
 * Protects against abuse while allowing burst traffic.
 */

/** Defaults */
const DEFAULT_BUCKET_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_BUCKET_CLEANUP_MS = 60 * 1000; // 60 seconds
const DEFAULT_RATE_LIMIT_MAX_KEYS = 10000;
const DEFAULT_WINDOW_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_WINDOW_CLEANUP_MS = 30 * 1000; // 30 seconds
const DEFAULT_WINDOW_SIZE_MS = 1000;
const DEFAULT_WINDOW_MAX_KEYS = 10000;
const WINDOW_COMPACT_THRESHOLD = 64;

/** Rate limiter configuration */
export type RateLimiterConfig = {
  /** Maximum tokens (burst capacity) */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
  /** Initial tokens */
  initialTokens?: number;
  /** TTL for inactive buckets in ms (default: 1 hour) */
  bucketTtlMs?: number;
  /** Cleanup interval in ms (default: 60 seconds) */
  cleanupIntervalMs?: number;
  /** Maximum number of distinct keys tracked */
  maxKeys?: number;
};

/** Default rate limiter config (generous for dev) */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimiterConfig = {
  maxTokens: 100,
  refillRate: 50,
  initialTokens: 100,
  bucketTtlMs: DEFAULT_BUCKET_TTL_MS,
  cleanupIntervalMs: DEFAULT_BUCKET_CLEANUP_MS,
  maxKeys: DEFAULT_RATE_LIMIT_MAX_KEYS,
};

/** Rate limit result */
export type RateLimitResult = {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining tokens */
  remaining: number;
  /** Seconds until next token */
  retryAfter?: number;
};

/**
 * Token bucket rate limiter.
 * Thread-safe for single-threaded JS runtime.
 * Includes automatic cleanup of stale buckets to prevent memory leaks.
 */
export class TokenBucketRateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number; lastAccess: number }>();
  private config: Required<RateLimiterConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = {
      maxTokens: config.maxTokens,
      refillRate: config.refillRate,
      initialTokens: config.initialTokens ?? config.maxTokens,
      bucketTtlMs: config.bucketTtlMs ?? DEFAULT_BUCKET_TTL_MS,
      cleanupIntervalMs: config.cleanupIntervalMs ?? DEFAULT_BUCKET_CLEANUP_MS,
      maxKeys: config.maxKeys ?? DEFAULT_RATE_LIMIT_MAX_KEYS,
    };
    if (this.config.cleanupIntervalMs > 0) {
      this.startCleanup();
    }
  }

  /**
   * Start automatic cleanup of stale buckets.
   * Call this when starting the server.
   */
  startCleanup(): void {
    if (this.config.cleanupIntervalMs <= 0) {
      return;
    }
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleBuckets();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup.
   * Call this when shutting down the server.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Remove buckets that haven't been accessed within the TTL.
   */
  private cleanupStaleBuckets(): void {
    const now = Date.now();
    const ttl = this.config.bucketTtlMs;

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastAccess > ttl) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Enforce the max key cap using LRU order.
   */
  private evictOverflowBuckets(): void {
    if (this.config.maxKeys <= 0) {
      return;
    }
    while (this.buckets.size > this.config.maxKeys) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.buckets.delete(oldestKey);
    }
  }

  /**
   * Touch a bucket to keep LRU order stable.
   */
  private touchBucket(
    key: string,
    bucket: { tokens: number; lastRefill: number; lastAccess: number }
  ): void {
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
  }

  /**
   * Check if a request is allowed and consume a token.
   * @param key - Unique identifier (e.g., clientId)
   * @param cost - Number of tokens to consume (default: 1)
   */
  consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (bucket && now - bucket.lastAccess > this.config.bucketTtlMs) {
      this.buckets.delete(key);
      bucket = undefined;
    }

    if (!bucket) {
      bucket = { tokens: this.config.initialTokens, lastRefill: now, lastAccess: now };
      this.buckets.set(key, bucket);
      this.evictOverflowBuckets();
    } else {
      bucket.lastAccess = now;
      this.touchBucket(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = elapsed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;
    bucket.lastAccess = now;

    // Check if request is allowed
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }

    // Calculate retry-after
    const deficit = cost - bucket.tokens;
    const retryAfter = deficit / this.config.refillRate;

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(retryAfter),
    };
  }

  /**
   * Reset limiter for a key (e.g., on disconnect).
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets (for testing).
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Shutdown the rate limiter, stopping cleanup and clearing state.
   */
  shutdown(): void {
    this.stopCleanup();
    this.clear();
  }

  /**
   * Get current token count for a key (for monitoring).
   */
  getTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? Math.floor(bucket.tokens) : this.config.initialTokens;
  }

  /**
   * Get size of buckets map (for monitoring).
   */
  getBucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Check if a bucket exists for a key.
   */
  hasBucket(key: string): boolean {
    return this.buckets.has(key);
  }
}

/** Sliding window rate limiter configuration */
export type SlidingWindowConfig = {
  /** Maximum requests per second */
  maxRequestsPerSecond: number;
  /** TTL for inactive windows in ms (default: 5 minutes) */
  windowTtlMs?: number;
  /** Cleanup interval in ms (default: 30 seconds) */
  cleanupIntervalMs?: number;
  /** Maximum number of distinct keys tracked */
  maxKeys?: number;
  /** Hard cap for timestamps retained per key */
  maxTimestampsPerKey?: number;
};

/**
 * Sliding window rate limiter (alternative).
 * More accurate for per-second limits but uses more memory.
 * Includes automatic cleanup of stale windows to prevent memory leaks.
 */
export class SlidingWindowRateLimiter {
  private windows = new Map<
    string,
    { timestamps: number[]; startIndex: number; lastAccess: number }
  >();
  private windowSizeMs: number;
  private maxRequests: number;
  private windowTtlMs: number;
  private cleanupIntervalMs: number;
  private maxKeys: number;
  private maxTimestampsPerKey: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private compactThreshold = WINDOW_COMPACT_THRESHOLD;

  constructor(config: number | SlidingWindowConfig) {
    if (typeof config === "number") {
      // Backward compatibility
      this.maxRequests = config;
      this.windowTtlMs = DEFAULT_WINDOW_TTL_MS;
      this.cleanupIntervalMs = DEFAULT_WINDOW_CLEANUP_MS;
      this.maxKeys = DEFAULT_WINDOW_MAX_KEYS;
      this.maxTimestampsPerKey = this.maxRequests;
    } else {
      this.maxRequests = config.maxRequestsPerSecond;
      this.windowTtlMs = config.windowTtlMs ?? DEFAULT_WINDOW_TTL_MS;
      this.cleanupIntervalMs = config.cleanupIntervalMs ?? DEFAULT_WINDOW_CLEANUP_MS;
      this.maxKeys = config.maxKeys ?? DEFAULT_WINDOW_MAX_KEYS;
      this.maxTimestampsPerKey = Math.max(1, config.maxTimestampsPerKey ?? this.maxRequests);
    }
    this.windowSizeMs = DEFAULT_WINDOW_SIZE_MS;
    if (this.cleanupIntervalMs > 0) {
      this.startCleanup();
    }
  }

  /**
   * Start automatic cleanup of stale windows.
   */
  startCleanup(): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleWindows();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop automatic cleanup.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Remove windows that haven't been accessed within the TTL.
   */
  private cleanupStaleWindows(): void {
    const now = Date.now();

    for (const [key, window] of this.windows) {
      this.pruneWindow(window, now - this.windowSizeMs);
      const activeCount = window.timestamps.length - window.startIndex;

      if (activeCount === 0 || now - window.lastAccess > this.windowTtlMs) {
        this.windows.delete(key);
      }
    }
  }

  consume(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowSizeMs;

    let window = this.windows.get(key);

    if (window && now - window.lastAccess > this.windowTtlMs) {
      this.windows.delete(key);
      window = undefined;
    }

    if (!window) {
      window = { timestamps: [], startIndex: 0, lastAccess: now };
      this.windows.set(key, window);
      this.evictOverflowWindows();
    }

    // Remove old entries
    this.pruneWindow(window, cutoff);

    if (window.timestamps.length === 0) {
      this.windows.delete(key);
      window = { timestamps: [], startIndex: 0, lastAccess: now };
      this.windows.set(key, window);
    }

    // Update last access time
    window.lastAccess = now;
    this.touchWindow(key, window);

    const activeCount = window.timestamps.length - window.startIndex;

    if (activeCount >= this.maxRequests) {
      const oldestInWindow = window.timestamps[window.startIndex];
      const retryAfter = Math.ceil((oldestInWindow + this.windowSizeMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }

    if (activeCount >= this.maxTimestampsPerKey) {
      const oldestInWindow = window.timestamps[window.startIndex];
      const retryAfter = Math.ceil((oldestInWindow + this.windowSizeMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfter };
    }

    window.timestamps.push(now);

    return { allowed: true, remaining: this.maxRequests - (activeCount + 1) };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  clear(): void {
    this.windows.clear();
  }

  /**
   * Shutdown the rate limiter, stopping cleanup and clearing state.
   */
  shutdown(): void {
    this.stopCleanup();
    this.clear();
  }

  /**
   * Get size of windows map (for monitoring).
   */
  getWindowCount(): number {
    return this.windows.size;
  }

  /**
   * Check if a window exists for a key.
   */
  hasWindow(key: string): boolean {
    return this.windows.has(key);
  }

  private pruneWindow(window: { timestamps: number[]; startIndex: number }, cutoff: number): void {
    const { timestamps } = window;
    let { startIndex } = window;

    while (startIndex < timestamps.length && timestamps[startIndex] <= cutoff) {
      startIndex++;
    }

    if (startIndex >= timestamps.length) {
      window.timestamps = [];
      window.startIndex = 0;
      return;
    }

    if (startIndex > 0 && startIndex >= this.compactThreshold) {
      window.timestamps = timestamps.slice(startIndex);
      startIndex = 0;
    }

    window.startIndex = startIndex;
  }

  private evictOverflowWindows(): void {
    if (this.maxKeys <= 0) {
      return;
    }
    while (this.windows.size > this.maxKeys) {
      const oldestKey = this.windows.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.windows.delete(oldestKey);
    }
  }

  private touchWindow(
    key: string,
    window: { timestamps: number[]; startIndex: number; lastAccess: number }
  ): void {
    this.windows.delete(key);
    this.windows.set(key, window);
  }
}

/** Create default rate limiter with cleanup started */
export function createDefaultRateLimiter(): TokenBucketRateLimiter {
  const limiter = new TokenBucketRateLimiter();
  limiter.startCleanup();
  return limiter;
}
