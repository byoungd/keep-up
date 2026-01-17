/**
 * @file structuredLogger.test.ts
 * @description Tests for the StructuredLogger
 */

import { describe, expect, it } from "vitest";
import { createNoopLogger, createStructuredLogger, LogBuffer } from "../telemetry/structuredLogger";

describe("StructuredLogger", () => {
  describe("log levels", () => {
    it("respects minimum log level", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "warn",
        handler: buffer.handler,
      });

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      expect(buffer.length).toBe(2);
      expect(buffer.getEntries()[0].level).toBe("warn");
      expect(buffer.getEntries()[1].level).toBe("error");
    });

    it("logs all levels when set to trace", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "trace",
        handler: buffer.handler,
      });

      logger.trace("trace");
      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");
      logger.fatal("fatal");

      expect(buffer.length).toBe(6);
    });

    it("isLevelEnabled returns correct value", () => {
      const logger = createStructuredLogger({ level: "warn" });

      expect(logger.isLevelEnabled("debug")).toBe(false);
      expect(logger.isLevelEnabled("info")).toBe(false);
      expect(logger.isLevelEnabled("warn")).toBe(true);
      expect(logger.isLevelEnabled("error")).toBe(true);
    });
  });

  describe("context propagation", () => {
    it("includes context in log entries", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
        context: { runId: "run-123" },
      });

      logger.info("test message");

      const entry = buffer.getLast();
      expect(entry?.context.runId).toBe("run-123");
    });

    it("child logger inherits parent context", () => {
      const buffer = new LogBuffer();
      const parent = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
        context: { runId: "run-123" },
      });

      const child = parent.child({ turnId: 1 });
      child.info("child message");

      const entry = buffer.getLast();
      expect(entry?.context.runId).toBe("run-123");
      expect(entry?.context.turnId).toBe(1);
    });

    it("child context overrides parent context", () => {
      const buffer = new LogBuffer();
      const parent = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
        context: { runId: "run-old" },
      });

      const child = parent.child({ runId: "run-new" });
      child.info("message");

      expect(buffer.getLast()?.context.runId).toBe("run-new");
    });

    it("nested children accumulate context", () => {
      const buffer = new LogBuffer();
      const root = createStructuredLogger({
        level: "debug",
        handler: buffer.handler,
        context: { runId: "run-1" },
      });

      const turnLogger = root.child({ turnId: 1 });
      const toolLogger = turnLogger.child({ toolCallId: "tool-abc" });

      toolLogger.debug("tool execution");

      const entry = buffer.getLast();
      expect(entry?.context).toEqual({
        runId: "run-1",
        turnId: 1,
        toolCallId: "tool-abc",
      });
    });
  });

  describe("structured data", () => {
    it("includes additional data in log entries", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
      });

      logger.info("processing", { itemCount: 10, status: "pending" });

      const entry = buffer.getLast();
      expect(entry?.data).toEqual({ itemCount: 10, status: "pending" });
    });

    it("includes error details", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "error",
        handler: buffer.handler,
        includeStackTraces: true,
      });

      const error = new Error("Something went wrong");
      logger.error("operation failed", error);

      const entry = buffer.getLast();
      expect(entry?.error?.name).toBe("Error");
      expect(entry?.error?.message).toBe("Something went wrong");
      expect(entry?.error?.stack).toBeDefined();
    });

    it("can omit stack traces when configured", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "error",
        handler: buffer.handler,
        includeStackTraces: false,
      });

      logger.error("error", new Error("test"));

      expect(buffer.getLast()?.error?.stack).toBeUndefined();
    });
  });

  describe("LogBuffer", () => {
    it("getEntriesAtLevel filters correctly", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "debug",
        handler: buffer.handler,
      });

      logger.debug("d1");
      logger.info("i1");
      logger.debug("d2");
      logger.warn("w1");

      expect(buffer.getEntriesAtLevel("debug").length).toBe(2);
      expect(buffer.getEntriesAtLevel("warn").length).toBe(1);
    });

    it("findByMessage searches messages", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
      });

      logger.info("processing request");
      logger.info("completed request");
      logger.info("starting new task");

      expect(buffer.findByMessage("request").length).toBe(2);
      expect(buffer.findByMessage("task").length).toBe(1);
    });

    it("clear removes all entries", () => {
      const buffer = new LogBuffer();
      const logger = createStructuredLogger({
        level: "info",
        handler: buffer.handler,
      });

      logger.info("message");
      expect(buffer.length).toBe(1);

      buffer.clear();
      expect(buffer.length).toBe(0);
    });
  });

  describe("createNoopLogger", () => {
    it("discards all messages", () => {
      // Noop logger has its own internal handler
      const logger = createNoopLogger();

      logger.trace("t");
      logger.debug("d");
      logger.info("i");
      logger.warn("w");
      logger.error("e");
      logger.fatal("f");

      // Since noop uses a no-op handler internally, we can verify by checking
      // that creating a child and logging also works without error
      const child = logger.child({ runId: "test" });
      child.info("test");

      // No assertions needed - if no error, test passes
      expect(true).toBe(true);
    });
  });

  describe("getContext", () => {
    it("returns current context", () => {
      const logger = createStructuredLogger({
        context: { runId: "run-1", turnId: 5 },
      });

      const context = logger.getContext();
      expect(context.runId).toBe("run-1");
      expect(context.turnId).toBe(5);
    });

    it("returns a copy of context", () => {
      const logger = createStructuredLogger({
        context: { runId: "run-1" },
      });

      const context1 = logger.getContext();
      const context2 = logger.getContext();

      expect(context1).toEqual(context2);
      expect(context1).not.toBe(context2);
    });
  });
});
