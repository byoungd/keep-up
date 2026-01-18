/**
 * Structured Logging Utilities
 *
 * Provides structured logging for agent runtime with context propagation,
 * log levels, and JSON serialization for production observability.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Log level enumeration.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Log level priorities (lower = more verbose).
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

/**
 * Structured log entry.
 */
export interface LogEntry {
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Timestamp */
  timestamp: number;
  /** ISO timestamp */
  time: string;
  /** Logger name/category */
  logger: string;
  /** Correlation/trace ID */
  traceId?: string;
  /** Span ID */
  spanId?: string;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Error if applicable */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Duration for timed operations */
  durationMs?: number;
}

/**
 * Logger configuration.
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel;
  /** Logger name */
  name: string;
  /** Default context */
  defaultContext?: Record<string, unknown>;
  /** Output handler */
  output?: LogOutput;
  /** Enable pretty print (for development) */
  pretty?: boolean;
  /** Enable timestamps */
  timestamps?: boolean;
}

/**
 * Log output interface.
 */
export interface LogOutput {
  write(entry: LogEntry): void;
}

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * Structured logger implementation.
 */
export class StructuredLogger {
  private readonly config: Required<Omit<LoggerConfig, "defaultContext">> & {
    defaultContext: Record<string, unknown>;
  };
  private traceId?: string;
  private spanId?: string;

  constructor(config: LoggerConfig) {
    this.config = {
      level: config.level,
      name: config.name,
      defaultContext: config.defaultContext ?? {},
      output: config.output ?? new ConsoleOutput(config.pretty ?? false),
      pretty: config.pretty ?? false,
      timestamps: config.timestamps ?? true,
    };
  }

  /**
   * Set trace context for correlation.
   */
  withTrace(traceId: string, spanId?: string): this {
    this.traceId = traceId;
    this.spanId = spanId;
    return this;
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger({
      ...this.config,
      defaultContext: { ...this.config.defaultContext, ...context },
    });
    child.traceId = this.traceId;
    child.spanId = this.spanId;
    return child;
  }

  /**
   * Log at trace level.
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log("trace", message, context);
  }

  /**
   * Log at debug level.
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  /**
   * Log at info level.
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  /**
   * Log at warn level.
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  /**
   * Log at error level.
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log("error", message, context, error);
  }

  /**
   * Log at fatal level.
   */
  fatal(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log("fatal", message, context, error);
  }

  /**
   * Time an operation and log the duration.
   */
  time<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then((value) => {
          this.info(`${label} completed`, { durationMs: performance.now() - start });
          return value;
        }) as unknown as T;
      }
      this.info(`${label} completed`, { durationMs: performance.now() - start });
      return result;
    } catch (error) {
      this.error(`${label} failed`, error as Error, {
        durationMs: performance.now() - start,
      });
      throw error;
    }
  }

  /**
   * Create a timed span for async operations.
   */
  startSpan(name: string): LogSpan {
    return new LogSpan(this, name);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const now = Date.now();
    const entry: LogEntry = {
      level,
      message,
      timestamp: now,
      time: new Date(now).toISOString(),
      logger: this.config.name,
      traceId: this.traceId,
      spanId: this.spanId,
      context: { ...this.config.defaultContext, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.config.output.write(entry);
  }
}

/**
 * Log span for timing operations.
 */
export class LogSpan {
  private readonly start: number;
  private ended = false;

  constructor(
    private readonly logger: StructuredLogger,
    private readonly name: string
  ) {
    this.start = performance.now();
    this.logger.debug(`${name} started`);
  }

  /**
   * End the span with success.
   */
  end(context?: Record<string, unknown>): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.logger.info(`${this.name} completed`, {
      ...context,
      durationMs: performance.now() - this.start,
    });
  }

  /**
   * End the span with error.
   */
  error(error: Error, context?: Record<string, unknown>): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.logger.error(`${this.name} failed`, error, {
      ...context,
      durationMs: performance.now() - this.start,
    });
  }
}

// ============================================================================
// Output Implementations
// ============================================================================

/**
 * Console output for logging.
 */
export class ConsoleOutput implements LogOutput {
  constructor(private readonly pretty: boolean) {}

  write(entry: LogEntry): void {
    const output = this.pretty ? this.formatPretty(entry) : JSON.stringify(entry);

    switch (entry.level) {
      case "trace":
      case "debug":
        // biome-ignore lint/suspicious/noConsole: Console output transport.
        console.debug(output);
        break;
      case "info":
        // biome-ignore lint/suspicious/noConsole: Console output transport.
        console.info(output);
        break;
      case "warn":
        // biome-ignore lint/suspicious/noConsole: Console output transport.
        console.warn(output);
        break;
      case "error":
      case "fatal":
        // biome-ignore lint/suspicious/noConsole: Console output transport.
        console.error(output);
        break;
    }
  }

  private formatPretty(entry: LogEntry): string {
    const level = entry.level.toUpperCase().padEnd(5);
    const time = entry.time.split("T")[1].split(".")[0];
    const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const err = entry.error ? ` [${entry.error.name}: ${entry.error.message}]` : "";
    return `[${time}] ${level} [${entry.logger}] ${entry.message}${ctx}${err}`;
  }
}

/**
 * Array output for collecting logs (useful for testing).
 */
export class ArrayOutput implements LogOutput {
  readonly entries: LogEntry[] = [];

  write(entry: LogEntry): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries.length = 0;
  }

  filter(predicate: (entry: LogEntry) => boolean): LogEntry[] {
    return this.entries.filter(predicate);
  }
}

/**
 * Multi-output for writing to multiple destinations.
 */
export class MultiOutput implements LogOutput {
  constructor(private readonly outputs: LogOutput[]) {}

  write(entry: LogEntry): void {
    for (const output of this.outputs) {
      output.write(entry);
    }
  }
}

/**
 * Filtered output that only writes entries matching a predicate.
 */
export class FilteredOutput implements LogOutput {
  constructor(
    private readonly output: LogOutput,
    private readonly predicate: (entry: LogEntry) => boolean
  ) {}

  write(entry: LogEntry): void {
    if (this.predicate(entry)) {
      this.output.write(entry);
    }
  }
}

// ============================================================================
// Agent Runtime Loggers
// ============================================================================

/**
 * Pre-configured loggers for agent runtime components.
 */
export const agentLoggers = {
  orchestrator: (config?: Partial<LoggerConfig>) =>
    createLogger({ name: "agent.orchestrator", level: "info", ...config }),

  tools: (config?: Partial<LoggerConfig>) =>
    createLogger({ name: "agent.tools", level: "info", ...config }),

  memory: (config?: Partial<LoggerConfig>) =>
    createLogger({ name: "agent.memory", level: "info", ...config }),

  streaming: (config?: Partial<LoggerConfig>) =>
    createLogger({ name: "agent.streaming", level: "debug", ...config }),

  planning: (config?: Partial<LoggerConfig>) =>
    createLogger({ name: "agent.planning", level: "info", ...config }),
};

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a structured logger.
 */
export function createLogger(config: LoggerConfig): StructuredLogger {
  return new StructuredLogger(config);
}

/**
 * Create a console output.
 */
export function createConsoleOutput(pretty = false): ConsoleOutput {
  return new ConsoleOutput(pretty);
}

/**
 * Create an array output (for testing).
 */
export function createArrayOutput(): ArrayOutput {
  return new ArrayOutput();
}

/**
 * Create a multi-output combining multiple destinations.
 */
export function createMultiOutput(...outputs: LogOutput[]): MultiOutput {
  return new MultiOutput(outputs);
}

/**
 * Generate a trace ID.
 */
export function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
