/**
 * Standardized API Error Response Utilities
 *
 * Provides consistent error response formatting across all AI API routes.
 * Follows the gateway error format for unified client-side handling.
 */

import { type GatewayErrorCode, toHttpStatus } from "@keepup/ai-core";

// ============================================================================
// Types
// ============================================================================

/**
 * API-specific error codes that map to gateway error codes.
 */
export type APIErrorCode =
  | "missing_prompt"
  | "invalid_model"
  | "invalid_request"
  | "unsupported_capability"
  | "config_error"
  | "provider_error"
  | "rate_limited"
  | "unauthorized"
  | "timeout"
  | "internal_error";

/**
 * Standardized API error response structure.
 */
export interface APIErrorResponse {
  error: {
    code: APIErrorCode;
    message: string;
    request_id?: string;
    retryable?: boolean;
    retry_after_ms?: number;
    recovery?: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Error Code Mapping
// ============================================================================

const API_TO_GATEWAY_CODE: Record<APIErrorCode, GatewayErrorCode> = {
  missing_prompt: "INVALID_REQUEST",
  invalid_model: "INVALID_MODEL",
  invalid_request: "INVALID_REQUEST",
  unsupported_capability: "INVALID_REQUEST",
  config_error: "INTERNAL_ERROR",
  provider_error: "PROVIDER_ERROR",
  rate_limited: "RATE_LIMITED",
  unauthorized: "UNAUTHORIZED",
  timeout: "TIMEOUT",
  internal_error: "INTERNAL_ERROR",
};

const RETRYABLE_CODES = new Set<APIErrorCode>(["provider_error", "rate_limited", "timeout"]);

const RECOVERY_MESSAGES: Partial<Record<APIErrorCode, string>> = {
  missing_prompt: "Please provide a prompt in your request.",
  invalid_model: "Please check the model ID and try again.",
  unsupported_capability: "This model doesn't support the requested capability.",
  config_error: "AI service is not properly configured. Please contact support.",
  provider_error: "The AI provider encountered an error. Please try again.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  unauthorized: "Invalid or missing API credentials.",
  timeout: "The request took too long. Please try again with a shorter input.",
};

// ============================================================================
// Response Builders
// ============================================================================

/**
 * Create a standardized error response.
 */
export function createErrorResponse(
  code: APIErrorCode,
  message: string,
  options?: {
    requestId?: string;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
    recovery?: string;
  }
): Response {
  const gatewayCode = API_TO_GATEWAY_CODE[code];
  const status = toHttpStatus(gatewayCode);
  const retryable = RETRYABLE_CODES.has(code);
  const recovery = options?.recovery ?? RECOVERY_MESSAGES[code];

  const body: APIErrorResponse = {
    error: {
      code,
      message,
      request_id: options?.requestId,
      retryable,
      retry_after_ms: options?.retryAfterMs,
      recovery,
      details: options?.details,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.requestId) {
    headers["x-request-id"] = options.requestId;
  }

  if (options?.retryAfterMs) {
    headers["Retry-After"] = String(Math.ceil(options.retryAfterMs / 1000));
  }

  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Create a success response with standard headers.
 */
export function createSuccessResponse(
  body: string | object,
  options?: {
    requestId?: string;
    contentType?: string;
    headers?: Record<string, string>;
  }
): Response {
  const isJson = typeof body === "object";
  const contentType =
    options?.contentType ?? (isJson ? "application/json" : "text/plain; charset=utf-8");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...options?.headers,
  };

  if (options?.requestId) {
    headers["x-request-id"] = options.requestId;
  }

  const responseBody = isJson ? JSON.stringify(body) : body;

  return new Response(responseBody, { status: 200, headers });
}

/**
 * Create a streaming response with standard headers.
 */
export function createStreamResponse(
  stream: ReadableStream,
  options?: {
    requestId?: string;
    headers?: Record<string, string>;
  }
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...options?.headers,
  };

  if (options?.requestId) {
    headers["x-request-id"] = options.requestId;
  }

  return new Response(stream, { status: 200, headers });
}

// ============================================================================
// Error Conversion Helpers
// ============================================================================

/**
 * Convert an unknown error to a standardized API error response.
 */
export function handleUnknownError(error: unknown, requestId?: string): Response {
  if (error instanceof Error) {
    const message = error.message;

    // Detect specific error patterns
    if (/api key/i.test(message) || /unauthorized/i.test(message)) {
      return createErrorResponse("config_error", message, { requestId });
    }

    if (/rate limit/i.test(message) || /too many/i.test(message)) {
      return createErrorResponse("rate_limited", message, { requestId });
    }

    if (/timeout/i.test(message) || /timed out/i.test(message)) {
      return createErrorResponse("timeout", message, { requestId });
    }

    return createErrorResponse("provider_error", message, { requestId });
  }

  return createErrorResponse("internal_error", "An unexpected error occurred", { requestId });
}

/**
 * Map provider resolution errors to API errors.
 */
export function handleProviderError(
  error: { code: string; message: string; provider?: string },
  requestId: string
): Response {
  const code: APIErrorCode =
    error.code === "provider_not_configured" || error.code === "no_provider_configured"
      ? "config_error"
      : "invalid_model";

  return createErrorResponse(code, error.message, {
    requestId,
    details: error.provider ? { provider: error.provider } : undefined,
  });
}
