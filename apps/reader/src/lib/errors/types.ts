/**
 * Unified Error Types for the Application
 *
 * Provides a consistent error structure across the app for:
 * - User-facing error messages
 * - Error classification and logging
 * - Retry logic and recovery hints
 */

/**
 * Error classification types for categorizing failures.
 */
export type ErrorType = "validation" | "network" | "persistence" | "auth" | "unexpected";

/**
 * Unified application error structure.
 * All errors shown to users or logged should conform to this shape.
 */
export interface AppError {
  /** Machine-readable error code (e.g., IMPORT_PERSIST_FAILED) */
  code: string;
  /** User-readable short message */
  message: string;
  /** Optional hint for next steps */
  hint?: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Error classification for analytics */
  errorType: ErrorType;
  /** Original error (not shown to users, for logging only) */
  cause?: unknown;
  /** Timestamp when error occurred */
  timestamp: number;
}

/**
 * Options for creating an AppError.
 */
export interface CreateAppErrorOptions {
  code: string;
  message: string;
  hint?: string;
  retryable?: boolean;
  errorType?: ErrorType;
  cause?: unknown;
}

/**
 * Error classification result from classifyError().
 */
export interface ErrorClassification {
  errorType: ErrorType;
  code: string;
  retryable: boolean;
}

/**
 * Common error codes used throughout the application.
 */
export const ErrorCodes = {
  // Validation errors
  VALIDATION_EMPTY_INPUT: "VALIDATION_EMPTY_INPUT",
  VALIDATION_INVALID_FORMAT: "VALIDATION_INVALID_FORMAT",
  VALIDATION_TOO_LONG: "VALIDATION_TOO_LONG",

  // Network errors
  NETWORK_OFFLINE: "NETWORK_OFFLINE",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  NETWORK_SERVER_ERROR: "NETWORK_SERVER_ERROR",
  NETWORK_RATE_LIMITED: "NETWORK_RATE_LIMITED",

  // Persistence errors
  PERSIST_WRITE_FAILED: "PERSIST_WRITE_FAILED",
  PERSIST_READ_FAILED: "PERSIST_READ_FAILED",
  PERSIST_QUOTA_EXCEEDED: "PERSIST_QUOTA_EXCEEDED",

  // Auth errors
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",

  // Import-specific errors
  IMPORT_PARSE_FAILED: "IMPORT_PARSE_FAILED",
  IMPORT_PERSIST_FAILED: "IMPORT_PERSIST_FAILED",
  IMPORT_INVALID_URL: "IMPORT_INVALID_URL",
  URL_IMPORT_UNSUPPORTED: "URL_IMPORT_UNSUPPORTED",

  // Topic/Project errors
  TOPIC_CREATE_FAILED: "TOPIC_CREATE_FAILED",
  PROJECT_CREATE_FAILED: "PROJECT_CREATE_FAILED",

  // AI errors
  AI_REQUEST_FAILED: "AI_REQUEST_FAILED",
  AI_CONTEXT_MISSING: "AI_CONTEXT_MISSING",

  // Generic
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
