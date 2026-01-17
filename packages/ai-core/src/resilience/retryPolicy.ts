/**
 * Retry Policy - Configurable Retry Strategies
 *
 * Production-grade retry with exponential backoff, jitter, and circuit breaker integration.
 */

import {
  type RetryPolicy as CockatielRetryPolicy,
  ExponentialBackoff,
  handleWhen,
  retry,
} from "cockatiel";
import { err, isOk, ok, type Result } from "../types/result";

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
  /** Jitter factor 0-1 (default: 0.1) - Handled internally by Cockatiel jitter */
  jitterFactor: number;
  /** Timeout per attempt in ms (default: 60000) - Note: timeout should be handled via TimeoutPolicy or signal */
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
 * Retry policy with configurable strategies using Cockatiel.
 */
export class RetryPolicy {
  private readonly config: RetryPolicyConfig;
  private readonly policy: CockatielRetryPolicy;

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    this.config = fullConfig;

    this.policy = retry(
      handleWhen((error) => this.config.isRetryable(error)),
      {
        maxAttempts: this.config.maxAttempts,
        backoff: new ExponentialBackoff({
          initialDelay: this.config.initialDelayMs,
          maxDelay: this.config.maxDelayMs,
          exponent: this.config.backoffMultiplier,
        }),
      }
    );
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
    let lastAttemptStart = startTime;

    // Cockatiel events to track attempts
    const retrySub = this.policy.onRetry((reason) => {
      const now = Date.now();
      attempts.push({
        attempt: reason.attempt,
        durationMs: now - lastAttemptStart,
        error: "error" in reason ? reason.error : reason.value,
      });
      this.config.onRetry?.(
        reason.attempt,
        "error" in reason ? reason.error : reason.value,
        reason.delay
      );
      lastAttemptStart = now + reason.delay; // Estimate next start
    });

    try {
      // Create a combined signal if both exist
      const signal = cancellation ? this.combineSignals(cancellation.signal) : undefined;

      const resultValue = await this.policy.execute(async ({ attempt, signal: policySignal }) => {
        lastAttemptStart = Date.now();
        // If we have a timeout, we should wrap the call
        // For simplicity here, we just pass the signal
        return await fn(attempt, policySignal);
      }, signal);

      retrySub.dispose();

      attempts.push({
        attempt: attempts.length + 1,
        durationMs: Date.now() - lastAttemptStart,
      });

      return {
        result: ok(resultValue),
        attempts,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      retrySub.dispose();

      // If it's a cancellation error from our side
      if (cancellation?.isCancelled) {
        return {
          result: err(new Error("Operation cancelled")),
          attempts,
          totalDurationMs: Date.now() - startTime,
        };
      }

      const finalError = error instanceof Error ? error : new Error(String(error));

      // Ensure the last failure is recorded if not already in attempts
      if (attempts.length < this.config.maxAttempts) {
        attempts.push({
          attempt: attempts.length + 1,
          durationMs: Date.now() - lastAttemptStart,
          error: finalError,
        });
      }

      return {
        result: err(finalError),
        attempts,
        totalDurationMs: Date.now() - startTime,
      };
    }
  }

  private combineSignals(parentSignal: AbortSignal): AbortSignal {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    parentSignal.addEventListener("abort", abortHandler);
    // Cleanup isn't trivial here without a way to know when to stop listening,
    // but AbortSignal.any() is available in modern Node/browsers.
    // If not, this is a reasonable approximation for now.
    return controller.signal;
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
  setTimeout(() => {
    token.cancel("Timeout");
  }, timeoutMs);
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
    token.signal.addEventListener(
      "abort",
      () => {
        combined.cancel("Parent cancelled");
      },
      {
        once: true,
      }
    );
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
