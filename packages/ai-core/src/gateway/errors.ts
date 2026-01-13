/**
 * Gateway Errors - Standardized Error Handling
 *
 * Provides consistent error handling across all AI operations with:
 * - Typed error codes for programmatic handling
 * - HTTP status mapping for API responses
 * - Recovery suggestions for user-facing messages
 * - Correlation with trace context
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Gateway error codes - comprehensive set covering all failure modes.
 */
export type GatewayErrorCode =
  // Client errors (4xx)
  | "INVALID_REQUEST" // Malformed request
  | "INVALID_MODEL" // Unknown or unsupported model
  | "INVALID_PAYLOAD" // Payload validation failed
  | "MISSING_REQUIRED_FIELD" // Required field missing
  | "RATE_LIMITED" // Too many requests
  | "QUOTA_EXCEEDED" // Usage quota exceeded
  | "UNAUTHORIZED" // Invalid or missing API key
  | "FORBIDDEN" // Permission denied
  | "CONTENT_FILTERED" // Content policy violation
  | "CONTEXT_TOO_LONG" // Input exceeds context window

  // Server errors (5xx)
  | "PROVIDER_ERROR" // Upstream provider error
  | "PROVIDER_UNAVAILABLE" // Provider temporarily unavailable
  | "PROVIDER_TIMEOUT" // Provider request timed out
  | "CIRCUIT_OPEN" // Circuit breaker is open
  | "ALL_PROVIDERS_FAILED" // All providers in fallback chain failed
  | "INTERNAL_ERROR" // Unexpected internal error

  // Conflict errors (409)
  | "CONFLICT" // Generic conflict
  | "FRONTIER_MISMATCH" // Document frontier mismatch
  | "HASH_MISMATCH" // Content hash mismatch
  | "STALE_REQUEST" // Request based on stale state

  // Cancellation
  | "CANCELLED" // Request was cancelled
  | "TIMEOUT"; // Request timed out

// ============================================================================
// Error Class
// ============================================================================

/**
 * Gateway error with rich context for debugging and user feedback.
 */
export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly traceId?: string;
  readonly requestId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: GatewayErrorCode,
    message: string,
    options?: {
      cause?: Error;
      retryAfterMs?: number;
      traceId?: string;
      requestId?: string;
      provider?: string;
      model?: string;
      details?: Record<string, unknown>;
      recovery?: string;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "GatewayError";
    this.code = code;
    this.statusCode = toHttpStatus(code);
    this.retryable = isRetryableCode(code);
    this.retryAfterMs = options?.retryAfterMs;
    this.traceId = options?.traceId;
    this.requestId = options?.requestId;
    this.provider = options?.provider;
    this.model = options?.model;
    this.details = options?.details;
    this.recovery = options?.recovery ?? getDefaultRecovery(code);
  }

  /**
   * Convert to JSON-serializable response.
   */
  toResponse(): GatewayErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        retryAfterMs: this.retryAfterMs,
        recovery: this.recovery,
        traceId: this.traceId,
        requestId: this.requestId,
        details: this.details,
      },
    };
  }
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Standardized error response format.
 */
export interface GatewayErrorResponse {
  error: {
    code: GatewayErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    recovery?: string;
    traceId?: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// HTTP Status Mapping
// ============================================================================

const STATUS_MAP: Record<GatewayErrorCode, number> = {
  // 400 Bad Request
  INVALID_REQUEST: 400,
  INVALID_MODEL: 400,
  INVALID_PAYLOAD: 400,
  MISSING_REQUIRED_FIELD: 400,
  CONTEXT_TOO_LONG: 400,

  // 401 Unauthorized
  UNAUTHORIZED: 401,

  // 403 Forbidden
  FORBIDDEN: 403,
  CONTENT_FILTERED: 403,

  // 408 Request Timeout
  TIMEOUT: 408,

  // 409 Conflict
  CONFLICT: 409,
  FRONTIER_MISMATCH: 409,
  HASH_MISMATCH: 409,
  STALE_REQUEST: 409,

  // 429 Too Many Requests
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,

  // 499 Client Closed Request (nginx convention)
  CANCELLED: 499,

  // 500 Internal Server Error
  INTERNAL_ERROR: 500,

  // 502 Bad Gateway
  PROVIDER_ERROR: 502,
  ALL_PROVIDERS_FAILED: 502,

  // 503 Service Unavailable
  PROVIDER_UNAVAILABLE: 503,
  CIRCUIT_OPEN: 503,

  // 504 Gateway Timeout
  PROVIDER_TIMEOUT: 504,
};

/**
 * Map error code to HTTP status.
 */
export function toHttpStatus(code: GatewayErrorCode): number {
  return STATUS_MAP[code] ?? 500;
}

// ============================================================================
// Retryable Classification
// ============================================================================

const RETRYABLE_CODES = new Set<GatewayErrorCode>([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "CIRCUIT_OPEN",
  "TIMEOUT",
  "INTERNAL_ERROR",
]);

function isRetryableCode(code: GatewayErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

// ============================================================================
// Recovery Suggestions
// ============================================================================

const RECOVERY_MAP: Partial<Record<GatewayErrorCode, string>> = {
  RATE_LIMITED: "Please wait a moment and try again.",
  QUOTA_EXCEEDED:
    "You've reached your usage limit. Please upgrade your plan or wait for the limit to reset.",
  UNAUTHORIZED: "Please check your API key configuration.",
  FORBIDDEN: "You don't have permission to perform this action.",
  CONTENT_FILTERED: "Your request was blocked by content policies. Please revise your input.",
  CONTEXT_TOO_LONG: "Your input is too long. Please shorten it and try again.",
  PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable. Please try again in a moment.",
  CIRCUIT_OPEN:
    "The AI service is temporarily unavailable due to high error rates. Please try again later.",
  ALL_PROVIDERS_FAILED: "All AI providers are currently unavailable. Please try again later.",
  TIMEOUT: "The request took too long. Please try again with a shorter input.",
  FRONTIER_MISMATCH: "The document has been modified. Please refresh and try again.",
  STALE_REQUEST: "Your changes are based on an outdated version. Please refresh and try again.",
};

function getDefaultRecovery(code: GatewayErrorCode): string | undefined {
  return RECOVERY_MAP[code];
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a gateway error with context.
 */
export function createGatewayError(
  code: GatewayErrorCode,
  message: string,
  options?: {
    cause?: Error;
    retryAfterMs?: number;
    traceId?: string;
    requestId?: string;
    provider?: string;
    model?: string;
    details?: Record<string, unknown>;
    recovery?: string;
  }
): GatewayError {
  return new GatewayError(code, message, options);
}

/**
 * Type guard for GatewayError.
 */
export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

/**
 * Format any error as a gateway error response.
 */
export function formatErrorResponse(
  error: unknown,
  context?: { traceId?: string; requestId?: string }
): { status: number; body: GatewayErrorResponse } {
  if (isGatewayError(error)) {
    return {
      status: error.statusCode,
      body: error.toResponse(),
    };
  }

  // Wrap unknown errors
  const gatewayError = new GatewayError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : "An unexpected error occurred",
    {
      cause: error instanceof Error ? error : undefined,
      traceId: context?.traceId,
      requestId: context?.requestId,
    }
  );

  return {
    status: gatewayError.statusCode,
    body: gatewayError.toResponse(),
  };
}

// ============================================================================
// Error Conversion Helpers
// ============================================================================

/**
 * Convert HTTP response status to gateway error.
 */
export function fromHttpStatus(
  status: number,
  message?: string,
  options?: {
    cause?: Error;
    retryAfterMs?: number;
    traceId?: string;
    requestId?: string;
    provider?: string;
    model?: string;
    details?: Record<string, unknown>;
    recovery?: string;
  }
): GatewayError {
  let code: GatewayErrorCode;

  switch (status) {
    case 400:
      code = "INVALID_REQUEST";
      break;
    case 401:
      code = "UNAUTHORIZED";
      break;
    case 403:
      code = "FORBIDDEN";
      break;
    case 408:
      code = "TIMEOUT";
      break;
    case 409:
      code = "CONFLICT";
      break;
    case 429:
      code = "RATE_LIMITED";
      break;
    case 499:
      code = "CANCELLED";
      break;
    case 502:
      code = "PROVIDER_ERROR";
      break;
    case 503:
      code = "PROVIDER_UNAVAILABLE";
      break;
    case 504:
      code = "PROVIDER_TIMEOUT";
      break;
    default:
      code = status >= 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST";
  }

  return new GatewayError(code, message ?? `HTTP ${status}`, options);
}

/**
 * Convert provider-specific errors to gateway errors.
 */
export function fromProviderError(
  error: Error,
  provider: string,
  options?: { traceId?: string; requestId?: string; model?: string }
): GatewayError {
  const message = error.message.toLowerCase();

  // Detect common provider error patterns
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return new GatewayError("RATE_LIMITED", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (message.includes("quota") || message.includes("billing")) {
    return new GatewayError("QUOTA_EXCEEDED", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (message.includes("unauthorized") || message.includes("invalid api key")) {
    return new GatewayError("UNAUTHORIZED", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (message.includes("content") && (message.includes("filter") || message.includes("policy"))) {
    return new GatewayError("CONTENT_FILTERED", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (
    message.includes("context length") ||
    message.includes("too long") ||
    message.includes("maximum")
  ) {
    return new GatewayError("CONTEXT_TOO_LONG", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return new GatewayError("PROVIDER_TIMEOUT", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  if (message.includes("unavailable") || message.includes("overloaded")) {
    return new GatewayError("PROVIDER_UNAVAILABLE", error.message, {
      cause: error,
      provider,
      ...options,
    });
  }

  // Default to generic provider error
  return new GatewayError("PROVIDER_ERROR", error.message, {
    cause: error,
    provider,
    ...options,
  });
}
