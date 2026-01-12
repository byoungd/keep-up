/**
 * Retry Utilities
 *
 * Provides robust retry logic with exponential backoff for resilient operations.
 */

// ============================================================================
// Retry Types
// ============================================================================

export interface RetryOptions {
  /** Maximum number of attempts (including first try) */
  maxAttempts?: number;

  /** Initial delay in milliseconds */
  initialDelayMs?: number;

  /** Maximum delay in milliseconds */
  maxDelayMs?: number;

  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier?: number;

  /** Add jitter to prevent thundering herd */
  jitter?: boolean;

  /** Predicate to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;

  /** Callback on each retry attempt */
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;

  /** The result if successful */
  result?: T;

  /** The final error if all attempts failed */
  error?: unknown;

  /** Number of attempts made */
  attempts: number;

  /** Total time spent in milliseconds */
  totalTimeMs: number;
}

// ============================================================================
// Default Retry Predicates
// ============================================================================

/**
 * Default retryable error check.
 * Retries on network errors, rate limits, and transient failures.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: retry classification considers multiple error shapes
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("socket hang up")
    ) {
      return true;
    }

    // Rate limiting
    if (message.includes("rate limit") || message.includes("too many requests")) {
      return true;
    }

    // Transient server errors
    if (message.includes("503") || message.includes("502") || message.includes("504")) {
      return true;
    }

    // API overloaded
    if (message.includes("overloaded") || message.includes("capacity")) {
      return true;
    }
  }

  // Check for HTTP status codes on error objects
  const errorObj = error as { status?: number; statusCode?: number };
  const status = errorObj.status ?? errorObj.statusCode;
  if (status) {
    // Retry on 429 (rate limit), 502, 503, 504 (server errors)
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  return false;
}

/**
 * Never retry - useful for testing or when you want explicit control.
 */
export function neverRetry(): boolean {
  return false;
}

/**
 * Always retry - useful for critical operations.
 */
export function alwaysRetry(): boolean {
  return true;
}

// ============================================================================
// Retry Implementation
// ============================================================================

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => callLLM(prompt),
 *   {
 *     maxAttempts: 3,
 *     initialDelayMs: 1000,
 *     onRetry: (attempt, error) => {
 *       console.log(`Retry ${attempt}: ${error}`);
 *     },
 *   }
 * );
 *
 * if (result.success) {
 *   console.log(result.result);
 * } else {
 *   console.error(`Failed after ${result.attempts} attempts`);
 * }
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30_000,
    backoffMultiplier = 2,
    jitter = true,
    isRetryable = isRetryableError,
    onRetry,
    signal,
  } = options;

  const startTime = Date.now();
  let lastError: unknown;
  let currentDelay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Check for abort
    if (signal?.aborted) {
      return {
        success: false,
        error: new Error("Aborted"),
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    }

    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= maxAttempts || !isRetryable(error)) {
        break;
      }

      // Calculate delay with optional jitter
      let delay = Math.min(currentDelay, maxDelayMs);
      if (jitter) {
        // Add random jitter between 0-25% of delay
        delay = delay + Math.random() * delay * 0.25;
      }

      // Notify about retry
      onRetry?.(attempt, error, delay);

      // Wait before next attempt
      await sleep(delay, signal);

      // Increase delay for next attempt
      currentDelay = currentDelay * backoffMultiplier;
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Wrap a function to automatically retry on failure.
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const result = await retry(() => fn(...args), options);
    if (result.success) {
      return result.result;
    }
    throw result.error;
  }) as T;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold?: number;

  /** Time to wait before trying again (half-open state) */
  resetTimeoutMs?: number;

  /** Number of successes in half-open to close circuit */
  successThreshold?: number;
}

export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker for preventing cascading failures.
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  /**
   * Execute a function with circuit breaker protection.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
        this.successes = 0;
      } else {
        throw new CircuitOpenError("Circuit is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset the circuit to closed state.
   */
  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = "closed";
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open" || this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Sleep for a duration, respecting abort signal.
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new Error("Aborted"));
        },
        { once: true }
      );
    }
  });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a circuit breaker.
 */
export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}
