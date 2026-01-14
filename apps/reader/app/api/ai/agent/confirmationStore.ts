import { randomUUID } from "node:crypto";

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

type ConfirmationEntry = {
  requestId: string;
  resolve: (confirmed: boolean) => void;
  createdAt: number;
  timeoutId: NodeJS.Timeout;
};

// NOTE: This in-memory store assumes a single long-lived server process (local desktop/dev).
// Replace with a persistent store for serverless or multi-instance deployments.
const confirmations = new Map<string, ConfirmationEntry>();

export function createPendingConfirmation(options: {
  requestId: string;
  timeoutMs?: number;
}): { confirmationId: string; promise: Promise<boolean> } {
  const confirmationId = randomUUID();
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  let resolvePromise: (value: boolean) => void = () => undefined;

  const promise = new Promise<boolean>((resolve) => {
    resolvePromise = resolve;
  });

  const timeoutId = setTimeout(() => {
    resolvePromise(false);
    confirmations.delete(confirmationId);
  }, timeoutMs);

  confirmations.set(confirmationId, {
    requestId: options.requestId,
    resolve: (confirmed) => {
      clearTimeout(timeoutId);
      resolvePromise(confirmed);
      confirmations.delete(confirmationId);
    },
    createdAt: Date.now(),
    timeoutId,
  });

  return { confirmationId, promise };
}

export function resolvePendingConfirmation(options: {
  confirmationId: string;
  confirmed: boolean;
  requestId?: string;
}):
  | { status: "resolved"; requestId: string }
  | { status: "not_found" }
  | { status: "request_mismatch"; requestId: string } {
  const entry = confirmations.get(options.confirmationId);
  if (!entry) {
    return { status: "not_found" };
  }

  if (options.requestId && entry.requestId !== options.requestId) {
    return { status: "request_mismatch", requestId: entry.requestId };
  }

  entry.resolve(options.confirmed);
  return { status: "resolved", requestId: entry.requestId };
}
