import {
  createSubsystemLogger,
  type Logger as TelemetryLogger,
} from "@ku0/agent-runtime-telemetry/logging";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

function wrapLogger(logger: TelemetryLogger): Logger {
  return {
    debug: (message, data) => logger.debug(message, data),
    info: (message, data) => logger.info(message, data),
    warn: (message, data) => logger.warn(message, data),
    error: (message, error, data) => logger.error(message, error, data),
  };
}

/**
 * Create a logger instance with a specific context.
 */
export function getLogger(context: string): Logger {
  const logger = createSubsystemLogger("cowork", context);
  return wrapLogger(logger);
}

/** Default server logger */
export const serverLogger = getLogger("server");
