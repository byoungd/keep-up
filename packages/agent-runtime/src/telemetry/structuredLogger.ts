/**
 * Structured Logging Module
 *
 * Provides structured logging with correlation IDs for agent tracing.
 * Features:
 * - Automatic runId, turnId, toolCallId propagation
 * - Log level filtering
 * - JSON and text formatters
 * - Context inheritance via child loggers
 *
 * @example
 * ```typescript
 * const logger = createStructuredLogger({ level: 'debug' });
 * const runLogger = logger.child({ runId: 'run-123' });
 * runLogger.info('Starting agent run', { model: 'gpt-4' });
 *
 * const turnLogger = runLogger.child({ turnId: 1 });
 * turnLogger.debug('Executing turn', { messageCount: 5 });
 * ```
 *
 * @module telemetry/structuredLogger
 */

// ============================================================================
// Types
// ============================================================================

/** Log severity levels */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Numeric priority for log levels (lower = more verbose) */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/**
 * Context for agent log correlation.
 * All fields are optional; child loggers inherit parent context.
 */
export interface AgentLogContext {
  /** Unique run identifier */
  readonly runId?: string;
  /** Turn number within the run (1-indexed) */
  readonly turnId?: number;
  /** Tool call identifier */
  readonly toolCallId?: string;
  /** Task graph node identifier */
  readonly taskNodeId?: string;
  /** Trace ID for distributed tracing */
  readonly traceId?: string;
  /** Span ID for distributed tracing */
  readonly spanId?: string;
  /** Additional custom fields */
  readonly [key: string]: string | number | boolean | undefined;
}

/**
 * A structured log entry with full context.
 */
export interface LogEntry {
  /** Timestamp in ISO 8601 format */
  readonly timestamp: string;
  /** Log level */
  readonly level: LogLevel;
  /** Log message */
  readonly message: string;
  /** Correlation context */
  readonly context: AgentLogContext;
  /** Additional structured data */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Error details if applicable */
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/**
 * Log output handler.
 */
export type LogHandler = (entry: LogEntry) => void;

/**
 * Configuration for the structured logger.
 */
export interface StructuredLoggerConfig {
  /** Minimum log level to emit (default: 'info') */
  readonly level?: LogLevel;
  /** Custom log handler (default: console) */
  readonly handler?: LogHandler;
  /** Initial context */
  readonly context?: AgentLogContext;
  /** Whether to include stack traces for errors (default: true) */
  readonly includeStackTraces?: boolean;
  /** Custom timestamp function */
  readonly now?: () => string;
}

/**
 * Interface for structured logging with context.
 */
export interface IStructuredLogger {
  /** Create a child logger with additional context */
  child(context: AgentLogContext): IStructuredLogger;

  /** Log at trace level */
  trace(message: string, data?: Record<string, unknown>): void;
  /** Log at debug level */
  debug(message: string, data?: Record<string, unknown>): void;
  /** Log at info level */
  info(message: string, data?: Record<string, unknown>): void;
  /** Log at warn level */
  warn(message: string, data?: Record<string, unknown>): void;
  /** Log at error level */
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  /** Log at fatal level */
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;

  /** Get the current context */
  getContext(): AgentLogContext;
  /** Check if a level is enabled */
  isLevelEnabled(level: LogLevel): boolean;
}

// ============================================================================
// Console Handler
// ============================================================================

/** Format log entry for console output */
function formatForConsole(entry: LogEntry): string {
  const { timestamp, level, message, context, data, error } = entry;

  // Build context string
  const contextParts: string[] = [];
  if (context.runId) {
    contextParts.push(`run=${context.runId}`);
  }
  if (context.turnId !== undefined) {
    contextParts.push(`turn=${context.turnId}`);
  }
  if (context.toolCallId) {
    contextParts.push(`tool=${context.toolCallId}`);
  }
  if (context.traceId) {
    contextParts.push(`trace=${context.traceId}`);
  }

  const contextStr = contextParts.length > 0 ? ` [${contextParts.join(" ")}]` : "";
  const dataStr = data && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
  const errorStr = error ? ` (${error.name}: ${error.message})` : "";

  return `${timestamp} ${level.toUpperCase().padEnd(5)}${contextStr} ${message}${dataStr}${errorStr}`;
}

/** Default console handler */
export const consoleHandler: LogHandler = (entry) => {
  const formatted = formatForConsole(entry);
  switch (entry.level) {
    case "trace":
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
    case "fatal":
      console.error(formatted);
      if (entry.error?.stack) {
        console.error(entry.error.stack);
      }
      break;
  }
};

/** JSON handler for machine-readable output */
export const jsonHandler: LogHandler = (entry) => {
  // Using console.info to satisfy lint rules while still outputting to stdout
  console.info(JSON.stringify(entry));
};

// ============================================================================
// Implementation
// ============================================================================

/**
 * Structured logger with context propagation.
 */
export class StructuredLogger implements IStructuredLogger {
  private readonly level: LogLevel;
  private readonly levelPriority: number;
  private readonly handler: LogHandler;
  private readonly context: AgentLogContext;
  private readonly includeStackTraces: boolean;
  private readonly now: () => string;

  constructor(config: StructuredLoggerConfig = {}) {
    this.level = config.level ?? "info";
    this.levelPriority = LOG_LEVEL_PRIORITY[this.level];
    this.handler = config.handler ?? consoleHandler;
    this.context = config.context ?? {};
    this.includeStackTraces = config.includeStackTraces ?? true;
    this.now = config.now ?? (() => new Date().toISOString());
  }

  /**
   * Create a child logger that inherits this logger's context.
   */
  child(context: AgentLogContext): IStructuredLogger {
    return new StructuredLogger({
      level: this.level,
      handler: this.handler,
      includeStackTraces: this.includeStackTraces,
      now: this.now,
      context: { ...this.context, ...context },
    });
  }

  /** Get the current context */
  getContext(): AgentLogContext {
    return { ...this.context };
  }

  /** Check if a level is enabled */
  isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= this.levelPriority;
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log("trace", message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log("error", message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log("fatal", message, data, error);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: this.now(),
      level,
      message,
      context: this.context,
      data,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: this.includeStackTraces ? error.stack : undefined,
          }
        : undefined,
    };

    try {
      this.handler(entry);
    } catch {
      // Silently ignore handler errors to avoid recursive logging
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new StructuredLogger instance.
 *
 * @param config - Configuration options
 * @returns IStructuredLogger instance
 */
export function createStructuredLogger(config?: StructuredLoggerConfig): IStructuredLogger {
  return new StructuredLogger(config);
}

/**
 * Create a no-op logger that discards all messages.
 * Useful for testing or disabling logging.
 */
export function createNoopLogger(): IStructuredLogger {
  return new StructuredLogger({
    handler: () => {
      /* noop */
    },
    level: "fatal",
  });
}

// ============================================================================
// Log Buffer for Testing
// ============================================================================

/**
 * A log handler that buffers entries for testing assertions.
 */
export class LogBuffer {
  private entries: LogEntry[] = [];

  /** Handler to pass to StructuredLogger */
  readonly handler: LogHandler = (entry) => {
    this.entries.push(entry);
  };

  /** Get all buffered entries */
  getEntries(): readonly LogEntry[] {
    return [...this.entries];
  }

  /** Get entries at a specific level */
  getEntriesAtLevel(level: LogLevel): readonly LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /** Find entries containing a message substring */
  findByMessage(substring: string): readonly LogEntry[] {
    return this.entries.filter((e) => e.message.includes(substring));
  }

  /** Clear all buffered entries */
  clear(): void {
    this.entries = [];
  }

  /** Get the last entry */
  getLast(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** Get entry count */
  get length(): number {
    return this.entries.length;
  }
}
