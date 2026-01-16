/**
 * Retry Utilities
 *
 * Delegates retry and circuit breaker behavior to @ku0/ai-core resilience.
 */

import {
  CircuitBreaker as AICoreCircuitBreaker,
  type CircuitState as AICoreCircuitState,
  type CancellationToken,
  type CircuitBreakerConfig,
  CircuitBreakerOpenError,
  type RetryPolicy,
  type RetryPolicyConfig,
  isRetryableError as aiCoreIsRetryableError,
  createCancellationToken,
  createRetryPolicy,
} from "@ku0/ai-core";

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

export function isRetryableError(error: unknown): boolean {
  return aiCoreIsRetryableError(error);
}

export function neverRetry(): boolean {
  return false;
}

export function alwaysRetry(): boolean {
  return true;
}

// ============================================================================
// Retry Implementation
// ============================================================================

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const policy = buildRetryPolicy(options);
  const cancellation = createCancellationFromSignal(options.signal);
  const result = await policy.execute(() => fn(), cancellation);

  if (result.result._tag === "Ok") {
    return {
      success: true,
      result: result.result.value,
      attempts: result.attempts.length,
      totalTimeMs: result.totalDurationMs,
    };
  }

  return {
    success: false,
    error: result.result.error,
    attempts: result.attempts.length,
    totalTimeMs: result.totalDurationMs,
  };
}

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

export type CircuitBreakerOptions = CircuitBreakerConfig;
export type CircuitState = AICoreCircuitState;

export class CircuitBreaker extends AICoreCircuitBreaker {}

export class CircuitOpenError extends CircuitBreakerOpenError {
  constructor(message: string, retryAfterMs = 0) {
    super(message, retryAfterMs);
    Object.defineProperty(this, "name", { value: "CircuitOpenError" });
  }
}

export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  return new CircuitBreaker(options);
}

// ============================================================================
// Helpers
// ============================================================================

function buildRetryPolicy(options: RetryOptions): RetryPolicy {
  const config: Partial<RetryPolicyConfig> = {
    maxAttempts: options.maxAttempts ?? 3,
    initialDelayMs: options.initialDelayMs ?? 1000,
    maxDelayMs: options.maxDelayMs ?? 30_000,
    backoffMultiplier: options.backoffMultiplier ?? 2,
    jitterFactor: options.jitter === false ? 0 : 0.1,
    isRetryable: options.isRetryable ?? aiCoreIsRetryableError,
    onRetry: options.onRetry,
  };

  return createRetryPolicy(config);
}

function createCancellationFromSignal(signal?: AbortSignal): CancellationToken | undefined {
  if (!signal) {
    return undefined;
  }
  const token = createCancellationToken();
  if (signal.aborted) {
    token.cancel("Aborted");
    return token;
  }
  signal.addEventListener(
    "abort",
    () => {
      token.cancel("Aborted");
    },
    { once: true }
  );
  return token;
}
