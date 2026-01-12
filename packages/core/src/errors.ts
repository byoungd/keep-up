export type LfccErrorCode =
  | "METRICS_REGISTRY_NOT_INITIALIZED"
  | "CONNECTION_TIMEOUT"
  | "WEBSOCKET_ERROR"
  | "INVALID_STATE"
  | "POLICY_NEGOTIATION_FAILED"
  | "UPDATE_REJECTED"
  | "MAX_RECONNECT_ATTEMPTS"
  | "RECOVERY_FAILED";

type LfccErrorOptions = {
  context?: Record<string, unknown>;
  cause?: unknown;
};

export class LfccError extends Error {
  readonly code: LfccErrorCode | string;
  readonly context?: Record<string, unknown>;

  constructor(code: LfccErrorCode | string, message: string, options: LfccErrorOptions = {}) {
    super(message);
    this.name = "LfccError";
    this.code = code;
    this.context = options.context;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
