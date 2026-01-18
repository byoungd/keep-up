/**
 * Structured Logging System
 *
 * Provides structured, JSON-formatted logging for agent runtime.
 * Supports log levels, context propagation, and transport abstraction.
 */

// ============================================================================
// Types
// ============================================================================

/** Log levels */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/** Log level priority (lower = more verbose) */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

function writeLine(output: string, stream: "stdout" | "stderr"): void {
  if (typeof process === "undefined") {
    return;
  }
  const target = stream === "stderr" ? process.stderr : process.stdout;
  if (!target) {
    return;
  }
  target.write(`${output}\n`);
}

/** Structured log entry */
export interface LogEntry {
  /** Log level */
  level: LogLevel;

  /** Log message */
  message: string;

  /** Timestamp */
  timestamp: string;

  /** Unix timestamp in ms */
  timestampMs: number;

  /** Logger name/category */
  logger: string;

  /** Correlation ID for request tracing */
  correlationId?: string;

  /** Agent ID if within agent context */
  agentId?: string;

  /** Tool name if within tool context */
  toolName?: string;

  /** Plugin ID if within plugin context */
  pluginId?: string;

  /** Additional structured data */
  data?: Record<string, unknown>;

  /** Error information */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };

  /** Duration in ms (for timing logs) */
  durationMs?: number;

  /** Source file and line (if available) */
  source?: {
    file: string;
    line: number;
    function?: string;
  };
}

/** Log context */
export interface LogContext {
  correlationId?: string;
  agentId?: string;
  toolName?: string;
  pluginId?: string;
  [key: string]: unknown;
}

/** Log transport interface */
export interface ILogTransport {
  /** Transport name */
  name: string;

  /** Write a log entry */
  write(entry: LogEntry): void;

  /** Flush pending logs */
  flush?(): Promise<void>;

  /** Close the transport */
  close?(): Promise<void>;
}

/** Logger configuration */
export interface LoggerConfig {
  /** Logger name */
  name: string;

  /** Minimum log level */
  level?: LogLevel;

  /** Transports to use */
  transports?: ILogTransport[];

  /** Default context */
  context?: LogContext;

  /** Enable timestamps */
  timestamps?: boolean;

  /** Enable source tracking (slower) */
  trackSource?: boolean;
}

// ============================================================================
// Console Transport
// ============================================================================

/** Console transport options */
export interface ConsoleTransportOptions {
  /** Use colors */
  colors?: boolean;

  /** Pretty print JSON */
  pretty?: boolean;

  /** Include timestamp */
  showTimestamp?: boolean;
}

/**
 * Console transport that outputs to stdout/stderr.
 */
export class ConsoleTransport implements ILogTransport {
  readonly name = "console";
  private readonly options: Required<ConsoleTransportOptions>;

  private readonly LEVEL_COLORS: Record<LogLevel, string> = {
    trace: "\x1b[90m", // Gray
    debug: "\x1b[36m", // Cyan
    info: "\x1b[32m", // Green
    warn: "\x1b[33m", // Yellow
    error: "\x1b[31m", // Red
    fatal: "\x1b[35m", // Magenta
  };

  private readonly RESET = "\x1b[0m";

  constructor(options: ConsoleTransportOptions = {}) {
    this.options = {
      colors: options.colors ?? true,
      pretty: options.pretty ?? false,
      showTimestamp: options.showTimestamp ?? true,
    };
  }

  write(entry: LogEntry): void {
    const output = this.options.pretty ? this.formatPretty(entry) : this.formatJson(entry);

    const stream = entry.level === "error" || entry.level === "fatal" ? "stderr" : "stdout";
    writeLine(output, stream);
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private formatPretty(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    if (this.options.showTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    // Level with color
    const level = entry.level.toUpperCase().padEnd(5);
    if (this.options.colors) {
      parts.push(`${this.LEVEL_COLORS[entry.level]}${level}${this.RESET}`);
    } else {
      parts.push(level);
    }

    // Logger name
    parts.push(`[${entry.logger}]`);

    // Context
    if (entry.correlationId) {
      parts.push(`[${entry.correlationId}]`);
    }
    if (entry.agentId) {
      parts.push(`[agent:${entry.agentId}]`);
    }
    if (entry.toolName) {
      parts.push(`[tool:${entry.toolName}]`);
    }

    // Message
    parts.push(entry.message);

    // Duration
    if (entry.durationMs !== undefined) {
      parts.push(`(${entry.durationMs}ms)`);
    }

    // Data
    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(JSON.stringify(entry.data));
    }

    // Error
    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }

    return parts.join(" ");
  }
}

// ============================================================================
// Memory Transport (for testing)
// ============================================================================

/**
 * In-memory transport that stores logs for testing.
 */
export class MemoryTransport implements ILogTransport {
  readonly name = "memory";
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  write(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /** Get all stored entries */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** Get entries by level */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /** Get entries by logger */
  getEntriesByLogger(logger: string): LogEntry[] {
    return this.entries.filter((e) => e.logger === logger);
  }

  /** Find entries matching a predicate */
  find(predicate: (entry: LogEntry) => boolean): LogEntry[] {
    return this.entries.filter(predicate);
  }

  /** Clear all entries */
  clear(): void {
    this.entries.length = 0;
  }

  /** Get entry count */
  get size(): number {
    return this.entries.length;
  }
}

// ============================================================================
// Logger Implementation
// ============================================================================

/**
 * Structured logger with context propagation.
 */
export class Logger {
  private readonly name: string;
  private readonly level: LogLevel;
  private readonly transports: ILogTransport[];
  private readonly context: LogContext;
  private readonly timestamps: boolean;
  private readonly trackSource: boolean;

  constructor(config: LoggerConfig) {
    this.name = config.name;
    this.level = config.level ?? "info";
    this.transports = config.transports ?? [new ConsoleTransport({ pretty: true })];
    this.context = config.context ?? {};
    this.timestamps = config.timestamps ?? true;
    this.trackSource = config.trackSource ?? false;
  }

  // ==========================================================================
  // Log Methods
  // ==========================================================================

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

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorInfo = this.extractError(error);
    this.log("error", message, { ...data, ...errorInfo });
  }

  fatal(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorInfo = this.extractError(error);
    this.log("fatal", message, { ...data, ...errorInfo });
  }

  // ==========================================================================
  // Timing Helpers
  // ==========================================================================

  /**
   * Log with timing information.
   */
  timed(
    level: LogLevel,
    message: string,
    durationMs: number,
    data?: Record<string, unknown>
  ): void {
    this.log(level, message, { ...data, _durationMs: durationMs });
  }

  /**
   * Create a timer that logs when stopped.
   */
  startTimer(
    message: string,
    level: LogLevel = "debug"
  ): { stop: (data?: Record<string, unknown>) => void } {
    const start = Date.now();

    return {
      stop: (data?: Record<string, unknown>) => {
        const durationMs = Date.now() - start;
        this.timed(level, message, durationMs, data);
      },
    };
  }

  // ==========================================================================
  // Child Loggers
  // ==========================================================================

  /**
   * Create a child logger with additional context.
   */
  child(context: Partial<LogContext>): Logger {
    return new Logger({
      name: this.name,
      level: this.level,
      transports: this.transports,
      context: { ...this.context, ...context },
      timestamps: this.timestamps,
      trackSource: this.trackSource,
    });
  }

  /**
   * Create a child logger with a different name.
   */
  named(name: string): Logger {
    return new Logger({
      name,
      level: this.level,
      transports: this.transports,
      context: this.context,
      timestamps: this.timestamps,
      trackSource: this.trackSource,
    });
  }

  /**
   * Create a logger for an agent.
   */
  forAgent(agentId: string): Logger {
    return this.child({ agentId });
  }

  /**
   * Create a logger for a tool.
   */
  forTool(toolName: string): Logger {
    return this.child({ toolName });
  }

  /**
   * Create a logger for a plugin.
   */
  forPlugin(pluginId: string): Logger {
    return this.child({ pluginId });
  }

  /**
   * Create a logger with correlation ID.
   */
  withCorrelation(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    // Check level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const now = new Date();

    // Extract special fields from data
    const durationMs = data?._durationMs as number | undefined;
    const cleanData = data ? { ...data } : undefined;
    if (cleanData?._durationMs !== undefined) {
      cleanData._durationMs = undefined;
    }

    // Extract error if present
    let errorInfo: LogEntry["error"] | undefined;
    if (cleanData?._error) {
      errorInfo = cleanData._error as LogEntry["error"];
      cleanData._error = undefined;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: now.toISOString(),
      timestampMs: now.getTime(),
      logger: this.name,
      correlationId: this.context.correlationId as string | undefined,
      agentId: this.context.agentId as string | undefined,
      toolName: this.context.toolName as string | undefined,
      pluginId: this.context.pluginId as string | undefined,
      data: cleanData && Object.keys(cleanData).length > 0 ? cleanData : undefined,
      error: errorInfo,
      durationMs,
    };

    // Track source if enabled
    if (this.trackSource) {
      entry.source = this.getSource();
    }

    // Write to all transports
    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // Ignore transport errors
      }
    }
  }

  private extractError(error: unknown): { _error?: LogEntry["error"] } {
    if (!error) {
      return {};
    }

    if (error instanceof Error) {
      return {
        _error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      };
    }

    return {
      _error: {
        name: "Error",
        message: String(error),
      },
    };
  }

  private getSource(): LogEntry["source"] | undefined {
    const stack = new Error().stack;
    if (!stack) {
      return undefined;
    }

    // Parse stack to find caller (skip internal frames)
    const lines = stack.split("\n");
    for (const line of lines.slice(3)) {
      const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):\d+\)/);
      if (match) {
        return {
          function: match[1],
          file: match[2],
          line: Number.parseInt(match[3], 10),
        };
      }
    }

    return undefined;
  }
}

// ============================================================================
// Global Logger
// ============================================================================

let globalLogger: Logger | null = null;

/**
 * Get or create the global logger.
 */
export function getLogger(name?: string): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({
      name: "agent-runtime",
      level: "info",
      transports: [new ConsoleTransport({ pretty: true })],
    });
  }

  return name ? globalLogger.named(name) : globalLogger;
}

/**
 * Configure the global logger.
 */
export function configureLogger(config: Omit<LoggerConfig, "name"> & { name?: string }): Logger {
  globalLogger = new Logger({
    name: config.name ?? "agent-runtime",
    ...config,
  });
  return globalLogger;
}

/**
 * Reset the global logger.
 */
export function resetLogger(): void {
  globalLogger = null;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new logger.
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Create a console transport.
 */
export function createConsoleTransport(options?: ConsoleTransportOptions): ConsoleTransport {
  return new ConsoleTransport(options);
}

/**
 * Create a memory transport (for testing).
 */
export function createMemoryTransport(maxEntries?: number): MemoryTransport {
  return new MemoryTransport(maxEntries);
}
