/**
 * Error Logging Utilities
 *
 * Centralized error logging with Sentry integration.
 * Ensures consistent error reporting across the application.
 */

import * as Sentry from "@sentry/nextjs";
import { isAppError, toUserFacingError } from "./classify";
import type { AppError } from "./types";

/**
 * Context for error logging.
 */
export interface ErrorLogContext {
  /** Component or module where error occurred */
  component?: string;
  /** Operation being performed */
  operation?: string;
  /** User ID (if available) */
  userId?: string;
  /** Document ID (if applicable) */
  docId?: string;
  /** Additional context data */
  extra?: Record<string, unknown>;
}

/**
 * Log an error to console and Sentry.
 * Converts unknown errors to AppError format for consistent logging.
 */
export function logError(err: unknown, context: ErrorLogContext = {}): AppError {
  const appError = isAppError(err) ? err : toUserFacingError(err);

  // Console logging (development)
  if (process.env.NODE_ENV === "development") {
    console.error(`[${appError.errorType.toUpperCase()}] ${appError.code}:`, {
      message: appError.message,
      hint: appError.hint,
      retryable: appError.retryable,
      context,
      cause: appError.cause,
    });
  }

  // Sentry reporting (production)
  Sentry.captureException(appError.cause ?? new Error(appError.message), {
    tags: {
      errorCode: appError.code,
      errorType: appError.errorType,
      retryable: String(appError.retryable),
      component: context.component,
      operation: context.operation,
    },
    extra: {
      appError: {
        code: appError.code,
        message: appError.message,
        hint: appError.hint,
        errorType: appError.errorType,
        retryable: appError.retryable,
      },
      ...context.extra,
    },
    user: context.userId ? { id: context.userId } : undefined,
  });

  return appError;
}

/**
 * Log a warning (non-critical issue).
 */
export function logWarning(message: string, context: ErrorLogContext = {}): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[WARNING] ${message}`, context);
  }

  Sentry.captureMessage(message, {
    level: "warning",
    tags: {
      component: context.component,
      operation: context.operation,
    },
    extra: context.extra,
  });
}

/**
 * Create a scoped logger for a specific component.
 */
export function createScopedLogger(component: string) {
  return {
    error: (err: unknown, context: Omit<ErrorLogContext, "component"> = {}) =>
      logError(err, { ...context, component }),
    warning: (message: string, context: Omit<ErrorLogContext, "component"> = {}) =>
      logWarning(message, { ...context, component }),
  };
}
