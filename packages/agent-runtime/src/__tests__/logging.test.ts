/**
 * Logging Tests
 */

import {
  configureLogger,
  createLogger,
  createMemoryTransport,
  getLogger,
  type Logger,
  type MemoryTransport,
  resetLogger,
} from "@ku0/agent-runtime-telemetry/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Logger", () => {
  let transport: MemoryTransport;
  let logger: Logger;

  beforeEach(() => {
    transport = createMemoryTransport();
    logger = createLogger({
      name: "test",
      level: "trace",
      transports: [transport],
    });
    resetLogger();
  });

  afterEach(() => {
    resetLogger();
  });

  describe("log levels", () => {
    it("should log at trace level", () => {
      logger.trace("trace message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("trace");
      expect(entries[0].message).toBe("trace message");
    });

    it("should log at debug level", () => {
      logger.debug("debug message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("debug");
    });

    it("should log at info level", () => {
      logger.info("info message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("info");
    });

    it("should log at warn level", () => {
      logger.warn("warn message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("warn");
    });

    it("should log at error level", () => {
      logger.error("error message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("error");
    });

    it("should log at fatal level", () => {
      logger.fatal("fatal message");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe("fatal");
    });
  });

  describe("level filtering", () => {
    it("should filter out logs below configured level", () => {
      const infoLogger = createLogger({
        name: "filtered",
        level: "info",
        transports: [transport],
      });

      infoLogger.trace("should not appear");
      infoLogger.debug("should not appear");
      infoLogger.info("should appear");
      infoLogger.warn("should appear");

      const entries = transport.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe("info");
      expect(entries[1].level).toBe("warn");
    });
  });

  describe("structured data", () => {
    it("should include additional data", () => {
      logger.info("user action", { userId: "123", action: "login" });

      const entries = transport.getEntries();
      expect(entries[0].data).toEqual({ userId: "123", action: "login" });
    });

    it("should include timestamps", () => {
      logger.info("timed message");

      const entries = transport.getEntries();
      expect(entries[0].timestamp).toBeDefined();
      expect(entries[0].timestampMs).toBeGreaterThan(0);
    });

    it("should include logger name", () => {
      logger.info("named message");

      const entries = transport.getEntries();
      expect(entries[0].logger).toBe("test");
    });
  });

  describe("error logging", () => {
    it("should log error objects", () => {
      const error = new Error("Something went wrong");
      logger.error("Operation failed", error);

      const entries = transport.getEntries();
      expect(entries[0].error).toBeDefined();
      expect(entries[0].error?.name).toBe("Error");
      expect(entries[0].error?.message).toBe("Something went wrong");
      expect(entries[0].error?.stack).toBeDefined();
    });

    it("should log non-Error objects", () => {
      logger.error("Operation failed", "string error");

      const entries = transport.getEntries();
      expect(entries[0].error?.message).toBe("string error");
    });

    it("should log errors with additional data", () => {
      const error = new Error("Failed");
      logger.error("Operation failed", error, { retryCount: 3 });

      const entries = transport.getEntries();
      expect(entries[0].error).toBeDefined();
      expect(entries[0].data).toEqual({ retryCount: 3 });
    });
  });

  describe("timing", () => {
    it("should log with duration", () => {
      logger.timed("info", "Request completed", 150);

      const entries = transport.getEntries();
      expect(entries[0].durationMs).toBe(150);
    });

    it("should create timer that logs duration", async () => {
      const timer = logger.startTimer("Operation");

      await new Promise((r) => setTimeout(r, 50));
      timer.stop({ result: "success" });

      const entries = transport.getEntries();
      expect(entries[0].durationMs).toBeGreaterThanOrEqual(40);
      expect(entries[0].data).toEqual({ result: "success" });
    });
  });

  describe("child loggers", () => {
    it("should create child with additional context", () => {
      const child = logger.child({ correlationId: "req-123" });
      child.info("child message");

      const entries = transport.getEntries();
      expect(entries[0].correlationId).toBe("req-123");
    });

    it("should create named child", () => {
      const child = logger.named("child-logger");
      child.info("message");

      const entries = transport.getEntries();
      expect(entries[0].logger).toBe("child-logger");
    });

    it("should create agent logger", () => {
      const agentLogger = logger.forAgent("agent-1");
      agentLogger.info("agent message");

      const entries = transport.getEntries();
      expect(entries[0].agentId).toBe("agent-1");
    });

    it("should create tool logger", () => {
      const toolLogger = logger.forTool("bash");
      toolLogger.info("tool message");

      const entries = transport.getEntries();
      expect(entries[0].toolName).toBe("bash");
    });

    it("should create plugin logger", () => {
      const pluginLogger = logger.forPlugin("my-plugin");
      pluginLogger.info("plugin message");

      const entries = transport.getEntries();
      expect(entries[0].pluginId).toBe("my-plugin");
    });

    it("should create correlated logger", () => {
      const correlated = logger.withCorrelation("trace-456");
      correlated.info("correlated message");

      const entries = transport.getEntries();
      expect(entries[0].correlationId).toBe("trace-456");
    });

    it("should inherit context in nested children", () => {
      const child = logger.withCorrelation("req-1").forAgent("agent-1").forTool("bash");

      child.info("nested context");

      const entries = transport.getEntries();
      expect(entries[0].correlationId).toBe("req-1");
      expect(entries[0].agentId).toBe("agent-1");
      expect(entries[0].toolName).toBe("bash");
    });
  });

  describe("MemoryTransport", () => {
    it("should store entries", () => {
      logger.info("message 1");
      logger.info("message 2");

      expect(transport.size).toBe(2);
    });

    it("should get entries by level", () => {
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      const warns = transport.getEntriesByLevel("warn");
      expect(warns).toHaveLength(1);
      expect(warns[0].message).toBe("warn");
    });

    it("should get entries by logger", () => {
      logger.info("from test logger");

      const other = createLogger({
        name: "other",
        transports: [transport],
      });
      other.info("from other logger");

      const testEntries = transport.getEntriesByLogger("test");
      expect(testEntries).toHaveLength(1);
      expect(testEntries[0].message).toBe("from test logger");
    });

    it("should find entries with predicate", () => {
      logger.info("user login", { userId: "123" });
      logger.info("user logout", { userId: "456" });
      logger.info("system event");

      const userEvents = transport.find((e) => e.data?.userId !== undefined);
      expect(userEvents).toHaveLength(2);
    });

    it("should clear entries", () => {
      logger.info("message");
      expect(transport.size).toBe(1);

      transport.clear();
      expect(transport.size).toBe(0);
    });

    it("should respect max entries", () => {
      const smallTransport = createMemoryTransport(3);
      const smallLogger = createLogger({
        name: "small",
        transports: [smallTransport],
      });

      for (let i = 0; i < 5; i++) {
        smallLogger.info(`message ${i}`);
      }

      expect(smallTransport.size).toBe(3);
      const entries = smallTransport.getEntries();
      expect(entries[0].message).toBe("message 2");
      expect(entries[2].message).toBe("message 4");
    });
  });

  describe("global logger", () => {
    it("should get global logger", () => {
      const global = getLogger();
      expect(global).toBeDefined();
    });

    it("should get named global logger", () => {
      const named = getLogger("my-module");
      named.info("test"); // Just verify it doesn't throw
    });

    it("should configure global logger", () => {
      const memTransport = createMemoryTransport();
      configureLogger({
        level: "debug",
        transports: [memTransport],
      });

      const global = getLogger();
      global.info("configured message");

      expect(memTransport.size).toBe(1);
    });

    it("should reset global logger", () => {
      const mem1 = createMemoryTransport();
      configureLogger({ transports: [mem1] });

      resetLogger();

      const mem2 = createMemoryTransport();
      configureLogger({ transports: [mem2] });

      getLogger().info("after reset");

      expect(mem1.size).toBe(0);
      expect(mem2.size).toBe(1);
    });
  });
});
