/**
 * Rate Limiter
 *
 * Per-client rate limiting using token bucket algorithm.
 * Prevents runaway clients from overwhelming the server.
 */

/** Rate limiter configuration */
export interface RateLimiterConfig {
  /** Maximum messages per second per client (default: 50) */
  maxMessagesPerSecond: number;
  /** Maximum bytes per second per client (default: 100KB) */
  maxBytesPerSecond: number;
  /** Burst allowance multiplier (default: 2) */
  burstMultiplier: number;
  /** Window size in milliseconds for rate calculation (default: 1000) */
  windowMs: number;
}

/** Rate limit check result */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Milliseconds until retry is allowed (if rate limited) */
  retryAfterMs?: number;
  /** Error code if rate limited */
  reason?: "RATE_LIMITED";
  /** Current usage info */
  usage?: {
    messagesInWindow: number;
    bytesInWindow: number;
    windowStartMs: number;
  };
}

/** Rate limit metrics */
export interface RateLimitMetrics {
  /** Total requests checked */
  totalChecks: number;
  /** Total requests allowed */
  totalAllowed: number;
  /** Total requests denied */
  totalDenied: number;
  /** Denial rate (0-1) */
  denialRate: number;
}

/** Client rate state */
interface ClientRateState {
  /** Messages in current window */
  messagesInWindow: number;
  /** Bytes in current window */
  bytesInWindow: number;
  /** Window start timestamp */
  windowStartMs: number;
  /** Burst tokens available */
  burstTokens: number;
  /** Last update timestamp */
  lastUpdateMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxMessagesPerSecond: 50,
  maxBytesPerSecond: 100 * 1024, // 100KB
  burstMultiplier: 2,
  windowMs: 1000,
};

/**
 * Token bucket rate limiter for per-client rate limiting.
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private clients = new Map<string, ClientRateState>();
  private metrics: RateLimitMetrics = {
    totalChecks: 0,
    totalAllowed: 0,
    totalDenied: 0,
    denialRate: 0,
  };

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a message is allowed for a client.
   */
  check(clientId: string, messageBytes: number): RateLimitResult {
    this.metrics.totalChecks++;

    const now = Date.now();
    let state = this.clients.get(clientId);

    // Initialize state for new client
    if (!state) {
      state = {
        messagesInWindow: 0,
        bytesInWindow: 0,
        windowStartMs: now,
        burstTokens: this.config.maxMessagesPerSecond * this.config.burstMultiplier,
        lastUpdateMs: now,
      };
      this.clients.set(clientId, state);
    }

    // Replenish burst tokens based on time elapsed
    const elapsedMs = now - state.lastUpdateMs;
    const tokensToAdd = (elapsedMs / 1000) * this.config.maxMessagesPerSecond;
    state.burstTokens = Math.min(
      state.burstTokens + tokensToAdd,
      this.config.maxMessagesPerSecond * this.config.burstMultiplier
    );
    state.lastUpdateMs = now;

    // Check if window has expired
    if (now - state.windowStartMs >= this.config.windowMs) {
      // Reset window
      state.messagesInWindow = 0;
      state.bytesInWindow = 0;
      state.windowStartMs = now;
    }

    // Calculate limits with burst
    const maxMessages = this.config.maxMessagesPerSecond;
    const maxBytes = this.config.maxBytesPerSecond;

    // Check message rate
    if (state.messagesInWindow >= maxMessages && state.burstTokens < 1) {
      this.metrics.totalDenied++;
      this.updateDenialRate();

      const retryAfterMs = this.config.windowMs - (now - state.windowStartMs);
      return {
        allowed: false,
        retryAfterMs: Math.max(retryAfterMs, 100),
        reason: "RATE_LIMITED",
        usage: {
          messagesInWindow: state.messagesInWindow,
          bytesInWindow: state.bytesInWindow,
          windowStartMs: state.windowStartMs,
        },
      };
    }

    // Check byte rate
    if (state.bytesInWindow + messageBytes > maxBytes * this.config.burstMultiplier) {
      this.metrics.totalDenied++;
      this.updateDenialRate();

      const retryAfterMs = this.config.windowMs - (now - state.windowStartMs);
      return {
        allowed: false,
        retryAfterMs: Math.max(retryAfterMs, 100),
        reason: "RATE_LIMITED",
        usage: {
          messagesInWindow: state.messagesInWindow,
          bytesInWindow: state.bytesInWindow,
          windowStartMs: state.windowStartMs,
        },
      };
    }

    // Allow the request
    state.messagesInWindow++;
    state.bytesInWindow += messageBytes;

    // Consume burst token if over base rate
    if (state.messagesInWindow > maxMessages) {
      state.burstTokens--;
    }

    this.metrics.totalAllowed++;
    this.updateDenialRate();

    return {
      allowed: true,
      usage: {
        messagesInWindow: state.messagesInWindow,
        bytesInWindow: state.bytesInWindow,
        windowStartMs: state.windowStartMs,
      },
    };
  }

  /**
   * Reset rate limits for a client.
   */
  reset(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Reset all rate limits.
   */
  resetAll(): void {
    this.clients.clear();
  }

  /**
   * Get rate limit metrics.
   */
  getMetrics(): RateLimitMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalChecks: 0,
      totalAllowed: 0,
      totalDenied: 0,
      denialRate: 0,
    };
  }

  /**
   * Get client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Clean up stale client entries.
   */
  cleanup(maxAgeMs = 60000): number {
    const now = Date.now();
    let removed = 0;

    for (const [clientId, state] of this.clients) {
      if (now - state.lastUpdateMs > maxAgeMs) {
        this.clients.delete(clientId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Update denial rate metric.
   */
  private updateDenialRate(): void {
    if (this.metrics.totalChecks > 0) {
      this.metrics.denialRate = this.metrics.totalDenied / this.metrics.totalChecks;
    }
  }
}
