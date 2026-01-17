/**
 * Pino Logger Factory
 *
 * Production-ready structured logging via pino.
 * Provides typed loggers with context binding.
 */

import pino, { type Logger, type LoggerOptions } from "pino";

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Log level */
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  /** Enable pretty printing (for development) */
  pretty?: boolean;
  /** Base bindings (always included in logs) */
  base?: Record<string, unknown>;
  /** Custom transport (for production) */
  transport?: LoggerOptions["transport"];
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
  pretty: process.env.NODE_ENV !== "production",
  base: {
    service: "agent-runtime",
  },
};

/**
 * Create a pino logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const options: LoggerOptions = {
    level: mergedConfig.level,
    base: mergedConfig.base,
  };

  if (mergedConfig.pretty && !mergedConfig.transport) {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  } else if (mergedConfig.transport) {
    options.transport = mergedConfig.transport;
  }

  return pino(options);
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(parent: Logger, bindings: Record<string, unknown>): Logger {
  return parent.child(bindings);
}

/**
 * Agent-runtime specific logger with common methods
 */
export interface RuntimeLogger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, error?: Error | Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): RuntimeLogger;
}

/**
 * Create a runtime logger wrapper
 */
export function createRuntimeLogger(config?: LoggerConfig & { module?: string }): RuntimeLogger {
  const base = createLogger(config);
  const logger = config?.module ? base.child({ module: config.module }) : base;

  return wrapLogger(logger);
}

function wrapLogger(logger: Logger): RuntimeLogger {
  return {
    trace: (msg, data) => (data ? logger.trace(data, msg) : logger.trace(msg)),
    debug: (msg, data) => (data ? logger.debug(data, msg) : logger.debug(msg)),
    info: (msg, data) => (data ? logger.info(data, msg) : logger.info(msg)),
    warn: (msg, data) => (data ? logger.warn(data, msg) : logger.warn(msg)),
    error: (msg, err) => {
      if (err instanceof Error) {
        logger.error({ err }, msg);
      } else if (err) {
        logger.error(err, msg);
      } else {
        logger.error(msg);
      }
    },
    child: (bindings) => wrapLogger(logger.child(bindings)),
  };
}

// Re-export pino types
export type { Logger } from "pino";

// Default singleton logger
let defaultLogger: RuntimeLogger | null = null;

/**
 * Get or create the default runtime logger
 */
export function getLogger(): RuntimeLogger {
  if (!defaultLogger) {
    defaultLogger = createRuntimeLogger();
  }
  return defaultLogger;
}
