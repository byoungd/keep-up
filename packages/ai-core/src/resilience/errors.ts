/**
 * AI Error Types
 *
 * Typed error hierarchy for precise error handling and recovery.
 * Each error type includes recovery hints and retry strategies.
 */

/** Base error codes */
export type AIErrorCode =
  // Provider errors
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_CONTENT_FILTERED"
  | "PROVIDER_CONTEXT_LENGTH_EXCEEDED"
  // Network errors
  | "NETWORK_TIMEOUT"
  | "NETWORK_CONNECTION_FAILED"
  | "NETWORK_DNS_FAILED"
  // Application errors
  | "VALIDATION_FAILED"
  | "RATE_LIMIT_EXCEEDED"
  | "CIRCUIT_BREAKER_OPEN"
  | "QUEUE_FULL"
  | "REQUEST_CANCELLED"
  // RAG errors
  | "NO_RESULTS_FOUND"
  | "EMBEDDING_FAILED"
  | "INDEX_NOT_FOUND"
  // Generic
  | "UNKNOWN_ERROR";

/** Retry strategy */
export interface RetryStrategy {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Delay before retry in ms */
  delayMs: number;
  /** Maximum retries */
  maxRetries: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
}

/** Recovery suggestion */
export interface RecoverySuggestion {
  /** Action to take */
  action: "retry" | "fallback" | "wait" | "abort" | "notify_user";
  /** Human-readable message */
  message: string;
  /** Additional data */
  data?: Record<string, unknown>;
}

/**
 * Base AI Error class.
 */
export class AIError extends Error {
  override readonly name: string = "AIError";
  readonly code: AIErrorCode;
  readonly retryStrategy: RetryStrategy;
  readonly recovery: RecoverySuggestion;
  readonly timestamp: number;
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: AIErrorCode,
    options: {
      cause?: Error;
      retryStrategy?: Partial<RetryStrategy>;
      recovery?: Partial<RecoverySuggestion>;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.code = code;
    this.timestamp = Date.now();
    this.context = options.context || {};

    // Default retry strategy based on error code
    this.retryStrategy = {
      shouldRetry: this.isRetryable(code),
      delayMs: this.getDefaultDelay(code),
      maxRetries: this.getDefaultMaxRetries(code),
      exponentialBackoff: true,
      ...options.retryStrategy,
    };

    // Default recovery suggestion
    this.recovery = {
      action: this.getDefaultAction(code),
      message: this.getDefaultRecoveryMessage(code),
      ...options.recovery,
    };
  }

  private isRetryable(code: AIErrorCode): boolean {
    const retryableCodes: AIErrorCode[] = [
      "PROVIDER_UNAVAILABLE",
      "PROVIDER_RATE_LIMITED",
      "NETWORK_TIMEOUT",
      "NETWORK_CONNECTION_FAILED",
      "QUEUE_FULL",
    ];
    return retryableCodes.includes(code);
  }

  private getDefaultDelay(code: AIErrorCode): number {
    switch (code) {
      case "PROVIDER_RATE_LIMITED":
        return 60000; // 1 minute
      case "PROVIDER_QUOTA_EXCEEDED":
        return 3600000; // 1 hour
      case "NETWORK_TIMEOUT":
      case "NETWORK_CONNECTION_FAILED":
        return 5000;
      default:
        return 1000;
    }
  }

  private getDefaultMaxRetries(code: AIErrorCode): number {
    switch (code) {
      case "PROVIDER_RATE_LIMITED":
        return 3;
      case "NETWORK_TIMEOUT":
        return 3;
      case "PROVIDER_UNAVAILABLE":
        return 5;
      default:
        return 2;
    }
  }

  private getDefaultAction(code: AIErrorCode): RecoverySuggestion["action"] {
    switch (code) {
      case "PROVIDER_RATE_LIMITED":
      case "PROVIDER_QUOTA_EXCEEDED":
        return "wait";
      case "PROVIDER_AUTH_FAILED":
      case "PROVIDER_INVALID_REQUEST":
        return "abort";
      case "PROVIDER_UNAVAILABLE":
      case "NETWORK_TIMEOUT":
        return "fallback";
      case "PROVIDER_CONTENT_FILTERED":
        return "notify_user";
      default:
        return "retry";
    }
  }

  private getDefaultRecoveryMessage(code: AIErrorCode): string {
    switch (code) {
      case "PROVIDER_RATE_LIMITED":
        return "Rate limit reached. Please wait before retrying.";
      case "PROVIDER_QUOTA_EXCEEDED":
        return "API quota exceeded. Please check your billing.";
      case "PROVIDER_AUTH_FAILED":
        return "Authentication failed. Please check your API key.";
      case "PROVIDER_CONTENT_FILTERED":
        return "Content was filtered by safety systems.";
      case "PROVIDER_CONTEXT_LENGTH_EXCEEDED":
        return "Input too long. Please reduce context size.";
      case "NETWORK_TIMEOUT":
        return "Request timed out. Trying again...";
      case "NO_RESULTS_FOUND":
        return "No relevant information found in your documents.";
      default:
        return "An error occurred. Please try again.";
    }
  }

  /**
   * Create a structured representation.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      retryStrategy: this.retryStrategy,
      recovery: this.recovery,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Provider-specific error.
 */
export class ProviderError extends AIError {
  override readonly name: string = "ProviderError";
  readonly provider: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    code: AIErrorCode,
    provider: string,
    options: {
      statusCode?: number;
      cause?: Error;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message, code, {
      cause: options.cause,
      context: { ...options.context, provider, statusCode: options.statusCode },
    });
    this.provider = provider;
    this.statusCode = options.statusCode;
  }

  /**
   * Create from HTTP response.
   */
  static fromResponse(provider: string, status: number, body: string): ProviderError {
    let code: AIErrorCode;
    let message: string;

    switch (status) {
      case 401:
      case 403:
        code = "PROVIDER_AUTH_FAILED";
        message = `Authentication failed for ${provider}`;
        break;
      case 429:
        code = "PROVIDER_RATE_LIMITED";
        message = `Rate limit exceeded for ${provider}`;
        break;
      case 400:
        if (body.includes("context_length") || body.includes("max_tokens")) {
          code = "PROVIDER_CONTEXT_LENGTH_EXCEEDED";
          message = `Context length exceeded for ${provider}`;
        } else {
          code = "PROVIDER_INVALID_REQUEST";
          message = `Invalid request to ${provider}: ${body.slice(0, 100)}`;
        }
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        code = "PROVIDER_UNAVAILABLE";
        message = `${provider} is temporarily unavailable`;
        break;
      default:
        code = "UNKNOWN_ERROR";
        message = `${provider} error (${status}): ${body.slice(0, 100)}`;
    }

    return new ProviderError(message, code, provider, { statusCode: status });
  }
}

/**
 * Rate limit error with reset time.
 */
export class RateLimitError extends AIError {
  override readonly name: string = "RateLimitError";
  readonly resetAt: number;
  readonly limitType: "requests" | "tokens" | "cost";

  constructor(
    message: string,
    limitType: "requests" | "tokens" | "cost",
    resetAt: number,
    options: { context?: Record<string, unknown> } = {}
  ) {
    super(message, "RATE_LIMIT_EXCEEDED", {
      context: { ...options.context, limitType, resetAt },
      retryStrategy: {
        shouldRetry: true,
        delayMs: Math.max(0, resetAt - Date.now()),
        maxRetries: 1,
        exponentialBackoff: false,
      },
    });
    this.limitType = limitType;
    this.resetAt = resetAt;
  }
}

/**
 * Validation error with field details.
 */
export class ValidationError extends AIError {
  override readonly name: string = "ValidationError";
  readonly field?: string;
  readonly value?: unknown;

  constructor(
    message: string,
    field?: string,
    value?: unknown,
    options: { context?: Record<string, unknown> } = {}
  ) {
    super(message, "VALIDATION_FAILED", {
      context: { ...options.context, field, value },
      retryStrategy: { shouldRetry: false, delayMs: 0, maxRetries: 0, exponentialBackoff: false },
      recovery: { action: "abort", message },
    });
    this.field = field;
    this.value = value;
  }
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIError) {
    return error.retryStrategy.shouldRetry;
  }
  if (error instanceof Error) {
    // Check for common retryable error patterns
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("econnreset") ||
      message.includes("rate limit") ||
      message.includes("503") ||
      message.includes("502")
    );
  }
  return false;
}

/**
 * Calculate retry delay with exponential backoff.
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  exponential = true
): number {
  if (!exponential) {
    return baseDelay;
  }

  const delay = baseDelay * 2 ** attempt;
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.min(delay + jitter, 60000); // Cap at 1 minute
}

/**
 * Wrap an error as an AIError.
 */
export function wrapError(error: unknown, defaultCode: AIErrorCode = "UNKNOWN_ERROR"): AIError {
  if (error instanceof AIError) {
    return error;
  }

  if (error instanceof Error) {
    return new AIError(error.message, defaultCode, { cause: error });
  }

  return new AIError(String(error), defaultCode);
}
