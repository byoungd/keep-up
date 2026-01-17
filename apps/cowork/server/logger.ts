/**
 * Cowork Server Logger
 *
 * Structured logging for the cowork server.
 * Provides consistent log formatting with timestamps and context.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  error?: { name: string; message: string; stack?: string };
  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const envLevel =
  typeof process !== "undefined" ? (process.env.LOG_LEVEL as LogLevel | undefined) : undefined;
const currentLevel: LogLevel = envLevel ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const prefix = entry.context ? `[${entry.context}]` : "";
  const base = `${entry.timestamp} ${entry.level.toUpperCase().padEnd(5)} ${prefix} ${entry.message}`;

  if (entry.error) {
    return `${base}\n  Error: ${entry.error.message}${entry.error.stack ? `\n${entry.error.stack}` : ""}`;
  }

  if (entry.data && Object.keys(entry.data).length > 0) {
    return `${base} ${JSON.stringify(entry.data)}`;
  }

  return base;
}

function log(
  level: LogLevel,
  context: string,
  message: string,
  error?: Error,
  data?: Record<string, unknown>
): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context,
    data,
  };

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const _formatted = formatEntry(entry);

  switch (level) {
    case "debug":
      break;
    case "info":
      break;
    case "warn":
      break;
    case "error":
      break;
  }
}

/**
 * Create a logger instance with a specific context.
 */
export function getLogger(context: string): Logger {
  return {
    debug: (message, data) => log("debug", context, message, undefined, data),
    info: (message, data) => log("info", context, message, undefined, data),
    warn: (message, data) => log("warn", context, message, undefined, data),
    error: (message, error, data) => log("error", context, message, error, data),
  };
}

/** Default server logger */
export const serverLogger = getLogger("cowork-server");
