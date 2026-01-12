/**
 * Circuit Breaker
 *
 * Implements the Circuit Breaker pattern for resilient external service calls.
 * Prevents cascading failures by temporarily stopping requests to unhealthy services.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Service unhealthy, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

/** Circuit breaker state */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening (default: 5) */
  failureThreshold: number;
  /** Success threshold to close from half-open (default: 2) */
  successThreshold: number;
  /** Time in ms before transitioning from open to half-open (default: 30000) */
  resetTimeoutMs: number;
  /** Time window for counting failures in ms (default: 60000) */
  failureWindowMs: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, reason: string) => void;
}

/** Circuit breaker metrics */
export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  lastStateChangeAt: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/** Failure record for sliding window */
interface FailureRecord {
  timestamp: number;
  error: string;
}

/**
 * Circuit Breaker implementation.
 *
 * Usage:
 * ```ts
 * const breaker = new CircuitBreaker({ failureThreshold: 5 });
 *
 * const result = await breaker.execute(async () => {
 *   return await externalService.call();
 * });
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: FailureRecord[] = [];
  private successCount = 0;
  private lastStateChangeAt = Date.now();
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
      failureWindowMs: config.failureWindowMs ?? 60000,
      onStateChange: config.onStateChange,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if we should allow the request
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is ${this.state}`,
        this.getTimeUntilRetry()
      );
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  /**
   * Check if request can proceed.
   */
  canExecute(): boolean {
    this.cleanupOldFailures();

    switch (this.state) {
      case "CLOSED":
        return true;

      case "OPEN":
        // Check if reset timeout has passed
        if (Date.now() - this.lastStateChangeAt >= this.config.resetTimeoutMs) {
          this.transitionTo("HALF_OPEN", "Reset timeout elapsed");
          return true;
        }
        return false;

      case "HALF_OPEN":
        // Allow limited requests to test recovery
        return true;

      default:
        return false;
    }
  }

  /**
   * Record a successful execution.
   */
  private recordSuccess(): void {
    this.totalSuccesses++;

    switch (this.state) {
      case "HALF_OPEN":
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.transitionTo("CLOSED", "Success threshold reached");
        }
        break;

      case "CLOSED":
        // Reset failure count on success in closed state
        this.failures = [];
        break;
    }
  }

  /**
   * Record a failed execution.
   */
  private recordFailure(error: string): void {
    this.totalFailures++;
    this.failures.push({ timestamp: Date.now(), error });

    switch (this.state) {
      case "CLOSED":
        if (this.failures.length >= this.config.failureThreshold) {
          this.transitionTo("OPEN", `Failure threshold reached (${this.failures.length} failures)`);
        }
        break;

      case "HALF_OPEN":
        // Single failure in half-open returns to open
        this.transitionTo("OPEN", "Failure during recovery test");
        break;
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState, reason: string): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeAt = Date.now();

    // Reset counters based on new state
    if (newState === "HALF_OPEN") {
      this.successCount = 0;
    } else if (newState === "CLOSED") {
      this.failures = [];
      this.successCount = 0;
    }

    this.config.onStateChange?.(oldState, newState, reason);
  }

  /**
   * Remove failures outside the window.
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    this.failures = this.failures.filter((f) => f.timestamp > cutoff);
  }

  /**
   * Get time until retry is allowed (for OPEN state).
   */
  getTimeUntilRetry(): number {
    if (this.state !== "OPEN") {
      return 0;
    }
    const elapsed = Date.now() - this.lastStateChangeAt;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get metrics.
   */
  getMetrics(): CircuitBreakerMetrics {
    this.cleanupOldFailures();
    return {
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successCount,
      lastFailureAt:
        this.failures.length > 0 ? this.failures[this.failures.length - 1].timestamp : null,
      lastSuccessAt: this.totalSuccesses > 0 ? Date.now() : null, // Simplified
      lastStateChangeAt: this.lastStateChangeAt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Force state (for testing or manual intervention).
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state, "Forced state change");
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.successCount = 0;
    this.lastStateChangeAt = Date.now();
  }
}

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
  readonly name = "CircuitBreakerOpenError";
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Create a circuit breaker with default configuration.
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
  return new CircuitBreaker(config);
}
