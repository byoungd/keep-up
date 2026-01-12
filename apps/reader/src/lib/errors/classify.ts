/**
 * Error Classification Utilities
 *
 * Provides functions to classify unknown errors into structured AppError format.
 */

import {
  type AppError,
  type CreateAppErrorOptions,
  type ErrorClassification,
  ErrorCodes,
  type ErrorType,
} from "./types";

/**
 * Check if error message contains network-related keywords.
 */
function isNetworkError(message: string, name: string): boolean {
  return (
    (name === "typeerror" && message.includes("fetch")) ||
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("connection") ||
    name === "networkerror"
  );
}

/**
 * Check if error is a timeout error.
 */
function isTimeoutError(message: string, name: string): boolean {
  return message.includes("timeout") || name === "aborterror";
}

/**
 * Check if error is a quota/storage error.
 */
function isQuotaError(message: string, name: string): boolean {
  return message.includes("quota") || message.includes("storage") || name === "quotaexceedederror";
}

/**
 * Classify an Error object.
 */
function classifyErrorObject(err: Error): ErrorClassification {
  const message = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  if (isNetworkError(message, name)) {
    return { errorType: "network", code: ErrorCodes.NETWORK_OFFLINE, retryable: true };
  }

  if (isTimeoutError(message, name)) {
    return { errorType: "network", code: ErrorCodes.NETWORK_TIMEOUT, retryable: true };
  }

  if (isQuotaError(message, name)) {
    return { errorType: "persistence", code: ErrorCodes.PERSIST_QUOTA_EXCEEDED, retryable: false };
  }

  if (message.includes("invalid") || message.includes("validation")) {
    return {
      errorType: "validation",
      code: ErrorCodes.VALIDATION_INVALID_FORMAT,
      retryable: false,
    };
  }

  return { errorType: "unexpected", code: ErrorCodes.UNEXPECTED_ERROR, retryable: false };
}

/**
 * Classify based on HTTP status code.
 */
function classifyByStatus(status: number): ErrorClassification | null {
  if (status === 401 || status === 403) {
    return { errorType: "auth", code: ErrorCodes.AUTH_UNAUTHORIZED, retryable: false };
  }
  if (status === 429) {
    return { errorType: "network", code: ErrorCodes.NETWORK_RATE_LIMITED, retryable: true };
  }
  if (status >= 500) {
    return { errorType: "network", code: ErrorCodes.NETWORK_SERVER_ERROR, retryable: true };
  }
  if (status >= 400) {
    return {
      errorType: "validation",
      code: ErrorCodes.VALIDATION_INVALID_FORMAT,
      retryable: false,
    };
  }
  return null;
}

/**
 * Classify an unknown error into a structured classification.
 * Inspects error properties to determine type and retryability.
 */
export function classifyError(err: unknown): ErrorClassification {
  // Handle null/undefined
  if (err == null) {
    return { errorType: "unexpected", code: ErrorCodes.UNEXPECTED_ERROR, retryable: false };
  }

  // Handle Error objects
  if (err instanceof Error) {
    return classifyErrorObject(err);
  }

  // Handle response-like objects (fetch responses, axios errors)
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const status = obj.status ?? obj.statusCode;

    if (typeof status === "number") {
      const classification = classifyByStatus(status);
      if (classification) {
        return classification;
      }
    }
  }

  // Default: unexpected error
  return { errorType: "unexpected", code: ErrorCodes.UNEXPECTED_ERROR, retryable: false };
}

/**
 * Create a structured AppError from options.
 */
export function createAppError(options: CreateAppErrorOptions): AppError {
  const classification = options.cause ? classifyError(options.cause) : null;

  return {
    code: options.code,
    message: options.message,
    hint: options.hint,
    retryable: options.retryable ?? classification?.retryable ?? false,
    errorType: options.errorType ?? classification?.errorType ?? "unexpected",
    cause: options.cause,
    timestamp: Date.now(),
  };
}

/**
 * Convert any error to a user-facing AppError.
 * Ensures sensitive details are not exposed to users.
 */
export function toUserFacingError(err: unknown): AppError {
  // Already an AppError
  if (isAppError(err)) {
    return err;
  }

  const classification = classifyError(err);
  const userMessage = getUserMessage(classification.errorType, classification.code);

  return {
    code: classification.code,
    message: userMessage.message,
    hint: userMessage.hint,
    retryable: classification.retryable,
    errorType: classification.errorType,
    cause: err,
    timestamp: Date.now(),
  };
}

/**
 * Type guard to check if an object is an AppError.
 */
export function isAppError(err: unknown): err is AppError {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const obj = err as Record<string, unknown>;
  return (
    typeof obj.code === "string" &&
    typeof obj.message === "string" &&
    typeof obj.retryable === "boolean" &&
    typeof obj.errorType === "string" &&
    typeof obj.timestamp === "number"
  );
}

/**
 * Get user-friendly message based on error type and code.
 */
function getUserMessage(errorType: ErrorType, code: string): { message: string; hint?: string } {
  const messages: Record<ErrorType, Record<string, { message: string; hint?: string }>> = {
    network: {
      [ErrorCodes.NETWORK_OFFLINE]: {
        message: "Network unavailable",
        hint: "Check your connection and try again.",
      },
      [ErrorCodes.NETWORK_TIMEOUT]: {
        message: "Request timed out",
        hint: "The server took too long to respond. Try again.",
      },
      [ErrorCodes.NETWORK_RATE_LIMITED]: {
        message: "Too many requests",
        hint: "Please wait a moment before trying again.",
      },
      default: {
        message: "Connection error",
        hint: "Please try again later.",
      },
    },
    validation: {
      [ErrorCodes.VALIDATION_EMPTY_INPUT]: {
        message: "Input cannot be empty",
        hint: "Please provide the required information.",
      },
      [ErrorCodes.URL_IMPORT_UNSUPPORTED]: {
        message: "URL import is unavailable",
        hint: "Paste text instead to import content.",
      },
      default: {
        message: "Invalid input",
        hint: "Please check your input and try again.",
      },
    },
    persistence: {
      [ErrorCodes.PERSIST_QUOTA_EXCEEDED]: {
        message: "Storage full",
        hint: "Free up space by removing unused items.",
      },
      default: {
        message: "Save failed",
        hint: "Your changes could not be saved. Try again.",
      },
    },
    auth: {
      [ErrorCodes.AUTH_SESSION_EXPIRED]: {
        message: "Session expired",
        hint: "Please sign in again to continue.",
      },
      default: {
        message: "Not authorized",
        hint: "Please sign in to access this feature.",
      },
    },
    unexpected: {
      default: {
        message: "Something went wrong",
        hint: "Please try again. If the problem persists, refresh the page.",
      },
    },
  };

  const typeMessages = messages[errorType];
  return typeMessages[code] ?? typeMessages.default;
}
