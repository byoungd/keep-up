/**
 * Logging Module
 *
 * Provides structured logging for agent runtime.
 */

export {
  Logger,
  ConsoleTransport,
  MemoryTransport,
  createLogger,
  createConsoleTransport,
  createMemoryTransport,
  getLogger,
  configureLogger,
  resetLogger,
  type LogLevel,
  type LogEntry,
  type LogContext,
  type ILogTransport,
  type LoggerConfig,
  type ConsoleTransportOptions,
} from "./logger";

// Structured logging
export {
  StructuredLogger,
  LogSpan,
  ConsoleOutput,
  ArrayOutput,
  MultiOutput,
  FilteredOutput,
  agentLoggers,
  createLogger as createStructuredLogger,
  createConsoleOutput,
  createArrayOutput,
  createMultiOutput,
  generateTraceId,
  LOG_LEVEL_PRIORITY,
  type LogLevel as StructuredLogLevel,
  type LogEntry as StructuredLogEntry,
  type LoggerConfig as StructuredLoggerConfig,
  type LogOutput,
} from "./structured";
