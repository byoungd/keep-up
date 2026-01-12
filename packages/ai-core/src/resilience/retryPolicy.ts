/**
 * Retry Policy - Configurable Retry Strategies
 *
 * Production-grade retry with exponential backoff, jitter, and circuit breaker integration.
 */

import { type Result, err, isOk, ok } from "../types/result";

// ============================================================================
// Types
// ============================================================================

/**
 * Retry policy configuration.
 */
export interface RetryPolicyConfig {
  /** Maximum retry attempts (default: 3) */
  maxAttempts: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitterFactor: number;
  /** Timeout per attempt in ms (default: 60000) */
  timeoutMs: number;
  /** Function to determine if error is retryable */
  isRetryable: (error: unknown) => boolean;
  /** Called before each retry */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

/**
 * Retry attempt metadata.
 */
export interface RetryAttempt {
  /** Attempt number (1-based) */
  attempt: number;
  /** Time spent on this attempt in ms */
  durationMs: number;
  /** Error if attempt failed */
  error?: unknown;
}

/**
 * Retry result with attempt history.
 */
export interface RetryResult<T> {
  /** Final result */
  result: Result<T, Error>;
  /** All attempts made */
  attempts: RetryAttempt[];
  /** Total time spent in ms */
  totalDurationMs: number;
}

/**
 * Cancellation token.
 */
export interface CancellationToken {
  readonly signal: AbortSignal;
  readonly isCancelled: boolean;
  cancel(reason?: string): void;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RetryPolicyConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  timeoutMs: 60000,
  isRetryable: (error) => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on transient errors
      return (
        message.includes("timeout") ||
        message.includes("network") ||
        message.includes("rate limit") ||
        message.includes("429") ||
        message.includes("503") ||
        message.includes("502") ||
        message.includes("504")
      );
    }
    return false;
  },
};

// ============================================================================
// Retry Policy Class
// ============================================================================

/**
 * Retry policy with configurable strategies.
 */
export class RetryPolicy {
  private readonly config: RetryPolicyConfig;

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute function with retry.
   */
  async execute<T>(
    fn: (attempt: number, signal: AbortSignal) => Promise<T>,
    cancellation?: CancellationToken
  ): Promise<RetryResult<T>> {
    const attempts: RetryAttempt[] = [];
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      // Check cancellation
      if (cancellation?.isCancelled) {
        return {
          result: err(new Error("Operation cancelled")),
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      }

      const attemptStart = Date.now();
      const controller = new AbortController();

      // Link to parent cancellation
      const abortHandler = () => controller.abort();
      cancellation?.signal.addEventListener("abort", abortHandler);

      // Set timeout
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.timeoutMs);

      try {
        const result = await fn(attempt, controller.signal);
        clearTimeout(timeoutId);
        cancellation?.signal.removeEventListener("abort", abortHandler);

        attempts.push({
          attempt,
          durationMs: Date.now() - attemptStart,
        });

        return {
          result: ok(result),
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        cancellation?.signal.removeEventListener("abort", abortHandler);

        attempts.push({
          attempt,
          durationMs: Date.now() - attemptStart,
          error,
        });

        // Check if we should retry
        const isLastAttempt = attempt >= this.config.maxAttempts;
        const shouldRetry = !isLastAttempt && this.config.isRetryable(error);

        if (!shouldRetry) {
          return {
            result: err(error instanceof Error ? error : new Error(String(error))),
            attempts,
            totalDurationMs: Date.now() - startTime,
          };
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        this.config.onRetry?.(attempt, error, delay);

        // Wait before retry
        await this.sleep(delay, cancellation);
      }
    }

    // Should not reach here
    return {
      result: err(new Error("Retry exhausted")),
      attempts,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate delay with exponential backoff and jitter.
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.initialDelayMs * this.config.backoffMultiplier ** (attempt - 1);
    const clampedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = clampedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(clampedDelay + jitter));
  }

  /**
   * Sleep with cancellation support.
   */
  private sleep(ms: number, cancellation?: CancellationToken): Promise<void> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(resolve, ms);

      if (cancellation) {
        const abortHandler = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        cancellation.signal.addEventListener("abort", abortHandler, {
          once: true,
        });
      }
    });
  }
}

// ============================================================================
// Cancellation Token
// ============================================================================

/**
 * Create a cancellation token.
 */
export function createCancellationToken(): CancellationToken {
  const controller = new AbortController();

  return {
    get signal() {
      return controller.signal;
    },
    get isCancelled() {
      return controller.signal.aborted;
    },
    cancel(reason?: string) {
      controller.abort(reason);
    },
  };
}

/**
 * Create a cancellation token with timeout.
 */
export function createTimeoutToken(timeoutMs: number): CancellationToken {
  const token = createCancellationToken();
  setTimeout(() => token.cancel("Timeout"), timeoutMs);
  return token;
}

/**
 * Combine multiple cancellation tokens.
 */
export function combineCancellationTokens(...tokens: CancellationToken[]): CancellationToken {
  const combined = createCancellationToken();

  for (const token of tokens) {
    if (token.isCancelled) {
      combined.cancel("Parent cancelled");
      break;
    }
    token.signal.addEventListener("abort", () => combined.cancel("Parent cancelled"), {
      once: true,
    });
  }

  return combined;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create retry policy with defaults.
 */
export function createRetryPolicy(config?: Partial<RetryPolicyConfig>): RetryPolicy {
  return new RetryPolicy(config);
}

/**
 * Create aggressive retry policy for critical operations.
 */
export function createAggressiveRetryPolicy(): RetryPolicy {
  return new RetryPolicy({
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  });
}

/**
 * Create gentle retry policy for non-critical operations.
 */
export function createGentleRetryPolicy(): RetryPolicy {
  return new RetryPolicy({
    maxAttempts: 2,
    initialDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.1,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute with retry using default policy.
 */
export async function withRetry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  config?: Partial<RetryPolicyConfig>
): Promise<T> {
  const policy = createRetryPolicy(config);
  const { result } = await policy.execute(fn);

  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Execute with retry, returning Result.
 */
export async function tryWithRetry<T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  config?: Partial<RetryPolicyConfig>
): Promise<RetryResult<T>> {
  const policy = createRetryPolicy(config);
  return policy.execute(fn);
}
