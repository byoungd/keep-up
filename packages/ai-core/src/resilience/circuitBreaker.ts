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

import {
  type CircuitBreakerPolicy,
  CircuitState as CockatielState,
  SamplingBreaker,
  circuitBreaker,
  handleAll,
} from "cockatiel";

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

/**
 * Circuit Breaker implementation using Cockatiel.
 */
export class CircuitBreaker {
  private readonly policy: CircuitBreakerPolicy;
  private readonly config: CircuitBreakerConfig;
  private isolationHandle: { dispose: () => void } | null = null;

  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastStateChangeAt: number = Date.now();
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
      failureWindowMs: config.failureWindowMs ?? 60000,
      onStateChange: config.onStateChange,
    };

    // Use SamplingBreaker to respect the time window.
    this.policy = circuitBreaker(handleAll, {
      halfOpenAfter: this.config.resetTimeoutMs,
      breaker: new SamplingBreaker({
        threshold: 0.1,
        duration: this.config.failureWindowMs,
        minimumRps: 1,
      }),
    });

    this.policy.onStateChange((state) => {
      const to = this.mapState(state);
      const from = this.getState();
      this.lastStateChangeAt = Date.now();

      if (this.config.onStateChange) {
        this.config.onStateChange(from, to, "Cockatiel state transition");
      }
    });

    this.policy.onSuccess(() => {
      this.totalSuccesses++;
      this.lastSuccessAt = Date.now();
    });

    this.policy.onFailure(() => {
      this.totalFailures++;
      this.lastFailureAt = Date.now();
    });
  }

  private mapState(state: CockatielState): CircuitState {
    switch (state) {
      case CockatielState.Closed: {
        return "CLOSED";
      }
      case CockatielState.Open:
      case CockatielState.Isolated: {
        return "OPEN";
      }
      case CockatielState.HalfOpen: {
        return "HALF_OPEN";
      }
      default: {
        return "CLOSED";
      }
    }
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    try {
      return await this.policy.execute(fn);
    } catch (error) {
      if (error instanceof Error && error.name === "BrokenCircuitError") {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is ${this.getState()}`,
          this.getTimeUntilRetry()
        );
      }
      throw error;
    }
  }

  /**
   * Check if request can proceed.
   */
  canExecute(): boolean {
    return (
      this.policy.state === CockatielState.Closed || this.policy.state === CockatielState.HalfOpen
    );
  }

  /**
   * Get time until retry is allowed (for OPEN state).
   */
  getTimeUntilRetry(): number {
    if (this.policy.state !== CockatielState.Open) {
      return 0;
    }
    const elapsed = Date.now() - this.lastStateChangeAt;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.mapState(this.policy.state);
  }

  /**
   * Get metrics.
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.getState(),
      failureCount: this.totalFailures,
      successCount: this.totalSuccesses,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      lastStateChangeAt: this.lastStateChangeAt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Force state.
   */
  forceState(state: CircuitState): void {
    if (state === "OPEN") {
      if (!this.isolationHandle) {
        this.isolationHandle = this.policy.isolate();
      }
    } else {
      if (this.isolationHandle) {
        this.isolationHandle.dispose();
        this.isolationHandle = null;
      }
    }
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset(): void {
    if (this.isolationHandle) {
      this.isolationHandle.dispose();
      this.isolationHandle = null;
    }
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastFailureAt = null;
    this.lastSuccessAt = null;
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
