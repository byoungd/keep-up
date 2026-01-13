import type { CorrelationContext, LogCategory, LogEntry, LogLevel } from "./types.js";

export type LoggerConfig = {
  minLevel: LogLevel;
  console: boolean;
  handler?: (entry: LogEntry) => void;
  defaultContext?: Partial<CorrelationContext>;
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class LFCCLogger {
  private config: LoggerConfig;
  private context: Partial<CorrelationContext>;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      minLevel: config.minLevel ?? "info",
      console: config.console ?? true,
      handler: config.handler,
      defaultContext: config.defaultContext ?? {},
    };
    this.context = { ...this.config.defaultContext };
  }

  child(ctx: Partial<CorrelationContext>): LFCCLogger {
    const c = new LFCCLogger(this.config);
    c.context = { ...this.context, ...ctx };
    return c;
  }

  setContext(ctx: Partial<CorrelationContext>): void {
    this.context = { ...this.context, ...ctx };
  }

  clearContext(): void {
    this.context = { ...this.config.defaultContext };
  }

  debug(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    this.log("debug", cat, msg, data);
  }

  info(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    this.log("info", cat, msg, data);
  }

  warn(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    this.log("warn", cat, msg, data);
  }

  error(cat: LogCategory, msg: string, err?: Error, data?: Record<string, unknown>): void {
    this.log("error", cat, msg, data, err);
  }

  logVerification(id: string, outcome: string, details: Record<string, unknown>): void {
    this.info("verification", `Annotation ${id} -> ${outcome}`, {
      annotationId: id,
      outcome,
      ...details,
    });
  }

  logFailClosed(reason: string, details: Record<string, unknown>, recoverable: boolean): void {
    this.log(recoverable ? "warn" : "error", "mapping", `Fail-closed: ${reason}`, {
      reason,
      recoverable,
      ...details,
    });
  }

  logSync(op: "send" | "receive" | "merge", tag: string, details: Record<string, unknown>): void {
    this.info("sync", `Sync ${op} @ ${tag.slice(0, 8)}...`, {
      operation: op,
      frontierTag: tag,
      ...details,
    });
  }

  logGateway(reqId: string, status: string, details: Record<string, unknown>): void {
    this.log(
      status === "rejected" ? "warn" : "info",
      "gateway",
      `Gateway ${reqId.slice(0, 8)}... -> ${status}`,
      { requestId: reqId, status, ...details }
    );
  }

  private log(
    lvl: LogLevel,
    cat: LogCategory,
    msg: string,
    data?: Record<string, unknown>,
    err?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[lvl] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: lvl,
      category: cat,
      message: msg,
      context: this.context,
      data,
      error: err ? { name: err.name, message: err.message, stack: err.stack } : undefined,
    };
    if (this.config.handler) {
      this.config.handler(entry);
    }
    if (this.config.console) {
      this.consoleLog(entry);
    }
  }

  private consoleLog(e: LogEntry): void {
    const p = `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.category}]`;
    const c = e.context.opId ? ` (op:${e.context.opId.slice(0, 8)})` : "";
    const a: unknown[] = [`${p + c} ${e.message}`];
    if (e.data) {
      a.push(e.data);
    }
    if (e.error) {
      a.push(e.error);
    }
    if (e.level === "debug") {
      console.debug(...a);
    } else if (e.level === "info") {
      console.info(...a);
    } else if (e.level === "warn") {
      console.warn(...a);
    } else {
      console.error(...a);
    }
  }
}

let defaultLogger: LFCCLogger | null = null;

export function getLogger(): LFCCLogger {
  if (!defaultLogger) {
    defaultLogger = new LFCCLogger();
  }
  return defaultLogger;
}

export function setDefaultLogger(logger: LFCCLogger): void {
  defaultLogger = logger;
}
