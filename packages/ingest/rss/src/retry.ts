/**
 * Retry Logic with Exponential Backoff
 *
 * Provides retry functionality for network requests with configurable
 * backoff strategy and error handling.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff multiplier */
  backoffFactor?: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for each retry attempt */
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  isRetryable: defaultIsRetryable,
};

/**
 * Default function to determine if an error is retryable.
 * Retries on network errors and 5xx server errors.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.name === "AbortError") {
      return false; // Don't retry aborted requests
    }
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return true;
    }

    // Check for HTTP status in error message
    const statusMatch = error.message.match(/(\d{3})/);
    if (statusMatch) {
      const status = Number.parseInt(statusMatch[1], 10);
      // Retry on 5xx errors and 429 (rate limit)
      return status >= 500 || status === 429;
    }

    return true; // Retry unknown errors
  }
  return false;
}

/**
 * Calculate delay for a given attempt using exponential backoff.
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffFactor: number
): number {
  const delay = initialDelay * backoffFactor ** (attempt - 1);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelay);
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (error && typeof error === "object" && "retryAfterMs" in error) {
    const value = (error as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt > opts.maxRetries || !opts.isRetryable(error)) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts.initialDelay, opts.maxDelay, opts.backoffFactor);
      const retryAfter = getRetryAfterMs(error);
      const finalDelay = retryAfter !== undefined ? Math.max(delay, retryAfter) : delay;

      opts.onRetry?.(attempt, error, finalDelay);
      await sleep(finalDelay);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper with preset options.
 */
export function createRetryWrapper(defaultOptions: RetryOptions) {
  return <T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> => {
    return withRetry(fn, { ...defaultOptions, ...options });
  };
}
