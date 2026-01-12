/**
 * Notification Utilities
 *
 * Unified API for showing user notifications (toasts).
 * Integrates with the error system for consistent error display.
 */

import type { ToastType } from "@/components/ui/Toast";
import { isAppError, toUserFacingError } from "./classify";
import { type ErrorLogContext, logError } from "./logger";
import type { AppError } from "./types";

/**
 * Toast function type (from useToast hook).
 */
type ToastFn = (message: string, type?: ToastType) => void;

/**
 * Global toast reference for use outside React components.
 * Set by ToastProvider on mount.
 */
let globalToast: ToastFn | null = null;

/**
 * Register the global toast function.
 * Called by ToastProvider on mount.
 */
export function registerGlobalToast(toast: ToastFn): void {
  globalToast = toast;
}

/**
 * Unregister the global toast function.
 * Called by ToastProvider on unmount.
 */
export function unregisterGlobalToast(): void {
  globalToast = null;
}

/**
 * Get the current toast function.
 * Returns a no-op if not available.
 */
function getToast(): ToastFn {
  if (globalToast) {
    return globalToast;
  }
  // Fallback: log to console if toast not available
  return (message: string, type?: ToastType) => {
    if (process.env.NODE_ENV === "development") {
      console.info(`[Toast ${type ?? "info"}] ${message}`);
    }
  };
}

/**
 * Show an error notification to the user.
 * Automatically logs the error and converts to user-facing message.
 *
 * @param err - The error to display
 * @param context - Optional logging context
 * @returns The AppError that was displayed
 */
export function notifyError(err: unknown, context: ErrorLogContext = {}): AppError {
  const appError = isAppError(err) ? err : toUserFacingError(err);
  logError(err, context);
  const toast = getToast();

  // Build message with optional hint
  const message = appError.hint ? `${appError.message}. ${appError.hint}` : appError.message;

  toast(message, "error");
  return appError;
}

/**
 * Show a success notification.
 */
export function notifySuccess(message: string): void {
  getToast()(message, "success");
}

/**
 * Show an info notification.
 */
export function notifyInfo(message: string): void {
  getToast()(message, "info");
}

/**
 * Show a warning notification.
 */
export function notifyWarning(message: string): void {
  getToast()(message, "warning");
}

/**
 * Create a notification helper bound to a specific component.
 * Useful for consistent error context in a module.
 */
export function createNotifier(component: string) {
  return {
    error: (err: unknown, context: Omit<ErrorLogContext, "component"> = {}) =>
      notifyError(err, { ...context, component }),
    success: notifySuccess,
    info: notifyInfo,
    warning: notifyWarning,
  };
}
