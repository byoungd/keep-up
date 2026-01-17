/**
 * Logging Module
 *
 * Provides structured logging for agent runtime.
 */

export {
  ConsoleTransport,
  type ConsoleTransportOptions,
  configureLogger,
  createConsoleTransport,
  createLogger,
  createMemoryTransport,
  getLogger,
  type ILogTransport,
  type LogContext,
  type LogEntry,
  Logger,
  type LoggerConfig,
  type LogLevel,
  MemoryTransport,
  resetLogger,
} from "./logger";

// Structured logging
export {
  ArrayOutput,
  agentLoggers,
  ConsoleOutput,
  createArrayOutput,
  createConsoleOutput,
  createLogger as createStructuredLogger,
  createMultiOutput,
  FilteredOutput,
  generateTraceId,
  LOG_LEVEL_PRIORITY,
  type LogEntry as StructuredLogEntry,
  type LoggerConfig as StructuredLoggerConfig,
  type LogLevel as StructuredLogLevel,
  type LogOutput,
  LogSpan,
  MultiOutput,
  StructuredLogger,
} from "./structured";
