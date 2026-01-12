/**
 * Error System - Public API
 *
 * Unified error handling for the application.
 *
 * @example
 * ```ts
 * import { createAppError, logError, toUserFacingError, ErrorCodes } from '@/lib/errors';
 *
 * // Create a specific error
 * const error = createAppError({
 *   code: ErrorCodes.IMPORT_PERSIST_FAILED,
 *   message: 'Failed to save imported content',
 *   hint: 'Try again or check your storage.',
 *   retryable: true,
 *   cause: originalError,
 * });
 *
 * // Log and get user-facing error
 * const userError = logError(error, { component: 'ImportModal' });
 *
 * // Convert unknown error to user-facing
 * const safeError = toUserFacingError(unknownError);
 * ```
 */

export {
  ErrorCodes,
  type AppError,
  type CreateAppErrorOptions,
  type ErrorClassification,
  type ErrorCode,
  type ErrorType,
} from "./types";

export {
  classifyError,
  createAppError,
  isAppError,
  toUserFacingError,
} from "./classify";

export {
  createScopedLogger,
  logError,
  logWarning,
  type ErrorLogContext,
} from "./logger";

export {
  createNotifier,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "./notify";
