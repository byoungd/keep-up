/**
 * Execution Feedback Tracker Tests
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionFeedbackTracker, ExecutionFeedbackTracker } from "../executionFeedback";

describe("ExecutionFeedbackTracker", () => {
  let tracker: ExecutionFeedbackTracker;

  beforeEach(() => {
    tracker = createExecutionFeedbackTracker();
  });

  it("should create tracker with default config", () => {
    expect(tracker).toBeInstanceOf(ExecutionFeedbackTracker);
  });

  it("should create tracker with custom config", () => {
    const customTracker = createExecutionFeedbackTracker({
      maxHistoryPerTool: 50,
      statsWindowMs: 1800_000,
    });
    expect(customTracker).toBeInstanceOf(ExecutionFeedbackTracker);
  });

  describe("recordOutcome", () => {
    it("should record successful outcomes", () => {
      tracker.recordOutcome("test_tool", { success: true, durationMs: 100 });
      const stats = tracker.getStats("test_tool");

      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(1);
      expect(stats?.successCount).toBe(1);
      expect(stats?.successRate).toBe(1);
    });

    it("should record failed outcomes with error codes", () => {
      tracker.recordOutcome("test_tool", {
        success: false,
        durationMs: 100,
        errorCode: "TIMEOUT",
      });
      const stats = tracker.getStats("test_tool");

      expect(stats?.failureCount).toBe(1);
      expect(stats?.topErrorCodes).toContainEqual({ code: "TIMEOUT", count: 1 });
    });

    it("should limit history per tool", () => {
      const limitedTracker = createExecutionFeedbackTracker({
        maxHistoryPerTool: 3,
      });

      for (let i = 0; i < 5; i++) {
        limitedTracker.recordOutcome("test_tool", { success: true, durationMs: 100 });
      }

      const stats = limitedTracker.getStats("test_tool");
      expect(stats?.totalExecutions).toBe(3); // Capped at 3
    });
  });

  describe("getSuccessRate", () => {
    it("should return -1 for unknown tools", () => {
      expect(tracker.getSuccessRate("unknown")).toBe(-1);
    });

    it("should return -1 for insufficient data", () => {
      tracker.recordOutcome("test_tool", { success: true, durationMs: 100 });
      expect(tracker.getSuccessRate("test_tool")).toBe(-1); // Needs 5+ executions
    });

    it("should return correct rate with sufficient data", () => {
      for (let i = 0; i < 8; i++) {
        tracker.recordOutcome("test_tool", {
          success: i < 6, // 6 success, 2 failures
          durationMs: 100,
        });
      }
      expect(tracker.getSuccessRate("test_tool")).toBe(0.75);
    });
  });

  describe("getAverageLatency", () => {
    it("should return -1 for unknown tools", () => {
      expect(tracker.getAverageLatency("unknown")).toBe(-1);
    });

    it("should calculate average latency correctly", () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome("test_tool", {
          success: true,
          durationMs: (i + 1) * 100, // 100, 200, 300, 400, 500
        });
      }
      expect(tracker.getAverageLatency("test_tool")).toBe(300);
    });
  });

  describe("getStats", () => {
    it("should return undefined for unknown tools", () => {
      expect(tracker.getStats("unknown")).toBeUndefined();
    });

    it("should calculate P95 latency", () => {
      // Record 20 executions with varying durations
      for (let i = 1; i <= 20; i++) {
        tracker.recordOutcome("test_tool", { success: true, durationMs: i * 100 });
      }
      const stats = tracker.getStats("test_tool");
      expect(stats?.p95DurationMs).toBeGreaterThanOrEqual(1900);
    });
  });

  describe("getUnreliableTools", () => {
    it("should identify unreliable tools", () => {
      // Record low success rate tool
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome("bad_tool", {
          success: i < 3, // 30% success
          durationMs: 100,
        });
      }
      // Record high success rate tool
      for (let i = 0; i < 10; i++) {
        tracker.recordOutcome("good_tool", {
          success: true,
          durationMs: 100,
        });
      }

      const unreliable = tracker.getUnreliableTools(0.5);
      expect(unreliable).toHaveLength(1);
      expect(unreliable[0].toolName).toBe("bad_tool");
    });
  });

  describe("getToolsByLatency", () => {
    it("should sort tools by latency", () => {
      // Fast tool
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome("fast_tool", { success: true, durationMs: 100 });
      }
      // Slow tool
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome("slow_tool", { success: true, durationMs: 1000 });
      }

      const byLatency = tracker.getToolsByLatency();
      expect(byLatency[0].toolName).toBe("fast_tool");
      expect(byLatency[1].toolName).toBe("slow_tool");
    });
  });

  describe("clear", () => {
    it("should clear all history", () => {
      tracker.recordOutcome("tool1", { success: true, durationMs: 100 });
      tracker.recordOutcome("tool2", { success: true, durationMs: 100 });
      tracker.clear();

      expect(tracker.getTrackedTools()).toHaveLength(0);
    });
  });

  describe("clearTool", () => {
    it("should clear specific tool history", () => {
      tracker.recordOutcome("tool1", { success: true, durationMs: 100 });
      tracker.recordOutcome("tool2", { success: true, durationMs: 100 });
      tracker.clearTool("tool1");

      expect(tracker.getTrackedTools()).toContain("tool2");
      expect(tracker.getTrackedTools()).not.toContain("tool1");
    });
  });

  describe("export/import", () => {
    it("should export and import history", () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordOutcome("test_tool", { success: true, durationMs: 100 });
      }

      const exported = tracker.exportHistory();
      const newTracker = createExecutionFeedbackTracker();
      newTracker.importHistory(exported);

      expect(newTracker.getStats("test_tool")?.totalExecutions).toBe(5);
    });
  });
});
