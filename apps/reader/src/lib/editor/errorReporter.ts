/**
 * Unified Error Reporter for Editor Operations
 * Centralizes error logging and Sentry integration for the LFCC editor.
 */

import * as Sentry from "@sentry/nextjs";

export type EditorErrorContext = {
  /** Operation that failed */
  operation: string;
  /** Document ID if available */
  docId?: string;
  /** Peer ID if in collaboration mode */
  peerId?: string;
  /** Additional context data */
  extra?: Record<string, unknown>;
};

/**
 * Report an editor error to console and Sentry.
 */
export function reportEditorError(error: Error, context: EditorErrorContext): void {
  const { operation, docId, peerId, extra } = context;

  // Console logging for development
  console.error(`[Editor Error] ${operation}:`, error.message, {
    docId,
    peerId,
    ...extra,
  });

  // Sentry reporting for production
  Sentry.captureException(error, {
    tags: {
      component: "lfcc-editor",
      operation,
    },
    extra: {
      docId,
      peerId,
      ...extra,
    },
  });
}

/**
 * Report a warning (non-fatal issue).
 */
export function reportEditorWarning(message: string, context: EditorErrorContext): void {
  const { operation, docId, peerId, extra } = context;

  console.warn(`[Editor Warning] ${operation}: ${message}`, {
    docId,
    peerId,
    ...extra,
  });

  Sentry.captureMessage(message, {
    level: "warning",
    tags: {
      component: "lfcc-editor",
      operation,
    },
    extra: {
      docId,
      peerId,
      ...extra,
    },
  });
}

/**
 * Wrap an async operation with error reporting.
 */
export async function withEditorErrorReporting<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Omit<EditorErrorContext, "operation">
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    reportEditorError(error instanceof Error ? error : new Error(String(error)), {
      operation,
      ...context,
    });
    throw error;
  }
}
