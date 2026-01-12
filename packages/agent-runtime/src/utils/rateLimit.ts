/**
 * Rate Limiting Utilities
 *
 * Provides rate limiting for tool calls and API requests.
 * Implements token bucket and sliding window algorithms.
 */

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;

  /** Window size in milliseconds */
  windowMs: number;

  /**
   * Strategy for rate limiting.
   * - "sliding": Sliding window (more accurate, more memory)
   * - "fixed": Fixed window (simpler, less memory)
   * - "token-bucket": Token bucket (smooth rate limiting)
   * @default "sliding"
   */
  strategy?: "sliding" | "fixed" | "token-bucket";
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;

  /** Remaining requests in current window */
  remaining: number;

  /** Time until rate limit resets (ms) */
  resetInMs: number;

  /** Total limit */
  limit: number;
}

export interface RateLimitStats {
  /** Total requests made */
  totalRequests: number;

  /** Total requests blocked */
  blockedRequests: number;

  /** Current window usage by key */
  usage: Map<string, number>;
}

// ============================================================================
// Sliding Window Rate Limiter
// ============================================================================

/**
 * Sliding window rate limiter.
 * Tracks request timestamps for accurate rate limiting.
 */
export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly requests = new Map<string, number[]>();
  private totalRequests = 0;
  private blockedRequests = 0;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  /**
   * Check if a request is allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing timestamps
    let timestamps = this.requests.get(key) ?? [];

    // Remove expired timestamps
    timestamps = timestamps.filter((t) => t > windowStart);

    const remaining = Math.max(0, this.maxRequests - timestamps.length);
    const allowed = timestamps.length < this.maxRequests;

    // Calculate reset time
    const oldestTimestamp = timestamps[0] ?? now;
    const resetInMs = allowed ? this.windowMs : oldestTimestamp + this.windowMs - now;

    return {
      allowed,
      remaining,
      resetInMs: Math.max(0, resetInMs),
      limit: this.maxRequests,
    };
  }

  /**
   * Record a request (consume a token).
   */
  consume(key: string): RateLimitResult {
    const result = this.check(key);
    this.totalRequests++;

    if (!result.allowed) {
      this.blockedRequests++;
      return result;
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get and clean timestamps
    let timestamps = this.requests.get(key) ?? [];
    timestamps = timestamps.filter((t) => t > windowStart);

    // Add new timestamp
    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
      resetInMs: this.windowMs,
      limit: this.maxRequests,
    };
  }

  /**
   * Reset rate limit for a key.
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Clear all rate limits.
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get statistics.
   */
  getStats(): RateLimitStats {
    const usage = new Map<string, number>();
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, timestamps] of this.requests) {
      const validCount = timestamps.filter((t) => t > windowStart).length;
      if (validCount > 0) {
        usage.set(key, validCount);
      }
    }

    return {
      totalRequests: this.totalRequests,
      blockedRequests: this.blockedRequests,
      usage,
    };
  }

  /**
   * Cleanup expired entries (call periodically for memory management).
   */
  cleanup(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    let cleaned = 0;

    for (const [key, timestamps] of this.requests) {
      const validTimestamps = timestamps.filter((t) => t > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
        cleaned++;
      } else if (validTimestamps.length < timestamps.length) {
        this.requests.set(key, validTimestamps);
      }
    }

    return cleaned;
  }
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Token bucket rate limiter.
 * Provides smooth rate limiting with burst capacity.
 */
export class TokenBucketRateLimiter {
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly buckets = new Map<string, TokenBucket>();
  private totalRequests = 0;
  private blockedRequests = 0;

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.maxRequests;
    this.refillRate = config.maxRequests / config.windowMs;
  }

  /**
   * Check if a request is allowed (without consuming).
   */
  check(key: string): RateLimitResult {
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);

    const allowed = bucket.tokens >= 1;
    const resetInMs = allowed ? 0 : Math.ceil((1 - bucket.tokens) / this.refillRate);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      resetInMs,
      limit: this.maxTokens,
    };
  }

  /**
   * Consume a token.
   */
  consume(key: string): RateLimitResult {
    this.totalRequests++;
    const bucket = this.getBucket(key);
    this.refillBucket(bucket);

    if (bucket.tokens < 1) {
      this.blockedRequests++;
      return {
        allowed: false,
        remaining: 0,
        resetInMs: Math.ceil((1 - bucket.tokens) / this.refillRate),
        limit: this.maxTokens,
      };
    }

    bucket.tokens -= 1;

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetInMs: 0,
      limit: this.maxTokens,
    };
  }

  /**
   * Reset bucket for a key.
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets.
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get statistics.
   */
  getStats(): RateLimitStats {
    const usage = new Map<string, number>();

    for (const [key, bucket] of this.buckets) {
      this.refillBucket(bucket);
      usage.set(key, this.maxTokens - Math.floor(bucket.tokens));
    }

    return {
      totalRequests: this.totalRequests,
      blockedRequests: this.blockedRequests,
      usage,
    };
  }

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }
}

// ============================================================================
// Per-Tool Rate Limiter
// ============================================================================

export interface ToolRateLimitConfig {
  /** Default rate limit for all tools */
  default?: RateLimitConfig;

  /** Per-tool rate limits (overrides default) */
  tools?: Record<string, RateLimitConfig>;

  /** Per-user rate limits */
  perUser?: RateLimitConfig;
}

/**
 * Rate limiter for tool calls with per-tool configuration.
 */
export class ToolRateLimiter {
  private readonly defaultLimiter?: SlidingWindowRateLimiter;
  private readonly toolLimiters = new Map<string, SlidingWindowRateLimiter>();
  private readonly userLimiter?: SlidingWindowRateLimiter;

  constructor(config: ToolRateLimitConfig) {
    if (config.default) {
      this.defaultLimiter = new SlidingWindowRateLimiter(config.default);
    }

    if (config.tools) {
      for (const [tool, limitConfig] of Object.entries(config.tools)) {
        this.toolLimiters.set(tool, new SlidingWindowRateLimiter(limitConfig));
      }
    }

    if (config.perUser) {
      this.userLimiter = new SlidingWindowRateLimiter(config.perUser);
    }
  }

  /**
   * Check and consume rate limit for a tool call.
   */
  checkAndConsume(toolName: string, userId?: string): RateLimitResult {
    // Check user-level rate limit first
    if (userId && this.userLimiter) {
      const userResult = this.userLimiter.check(userId);
      if (!userResult.allowed) {
        return userResult;
      }
    }

    // Check tool-specific rate limit
    const toolLimiter = this.toolLimiters.get(toolName) ?? this.defaultLimiter;
    if (toolLimiter) {
      const toolResult = toolLimiter.consume(toolName);
      if (!toolResult.allowed) {
        return toolResult;
      }
    }

    // Consume user-level token if applicable
    if (userId && this.userLimiter) {
      this.userLimiter.consume(userId);
    }

    return {
      allowed: true,
      remaining: -1, // Unknown when multiple limiters
      resetInMs: 0,
      limit: -1,
    };
  }

  /**
   * Check rate limit without consuming.
   */
  check(toolName: string, userId?: string): RateLimitResult {
    if (userId && this.userLimiter) {
      const userResult = this.userLimiter.check(userId);
      if (!userResult.allowed) {
        return userResult;
      }
    }

    const toolLimiter = this.toolLimiters.get(toolName) ?? this.defaultLimiter;
    if (toolLimiter) {
      return toolLimiter.check(toolName);
    }

    return { allowed: true, remaining: -1, resetInMs: 0, limit: -1 };
  }

  /**
   * Reset rate limits.
   */
  reset(toolName?: string, userId?: string): void {
    if (toolName) {
      const limiter = this.toolLimiters.get(toolName) ?? this.defaultLimiter;
      limiter?.reset(toolName);
    }

    if (userId && this.userLimiter) {
      this.userLimiter.reset(userId);
    }
  }

  /**
   * Cleanup expired entries.
   */
  cleanup(): void {
    this.defaultLimiter?.cleanup();
    this.userLimiter?.cleanup();
    for (const limiter of this.toolLimiters.values()) {
      limiter.cleanup();
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a rate limiter.
 */
export function createRateLimiter(
  config: RateLimitConfig
): SlidingWindowRateLimiter | TokenBucketRateLimiter {
  const strategy = config.strategy ?? "sliding";

  if (strategy === "token-bucket") {
    return new TokenBucketRateLimiter(config);
  }

  return new SlidingWindowRateLimiter(config);
}

/**
 * Create a tool rate limiter.
 */
export function createToolRateLimiter(config: ToolRateLimitConfig): ToolRateLimiter {
  return new ToolRateLimiter(config);
}
