/**
 * Snapshot Policy Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotPolicy } from "../snapshotPolicy";

describe("SnapshotPolicy", () => {
  let policy: SnapshotPolicy;

  beforeEach(() => {
    vi.useFakeTimers();
    policy = new SnapshotPolicy({
      updateThreshold: 100,
      timeThresholdMinutes: 5,
      minUpdatesForTimeTrigger: 10,
      maxSnapshotBytes: 1024 * 1024,
    });
  });

  afterEach(() => {
    policy.clear();
    vi.useRealTimers();
  });

  describe("update threshold", () => {
    it("should not trigger before threshold", () => {
      for (let i = 0; i < 99; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(false);
      expect(result.state.updatesSinceSnapshot).toBe(99);
    });

    it("should trigger at threshold", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(true);
      expect(result.reason).toBe("update_threshold");
    });

    it("should track bytes", () => {
      policy.recordUpdate("doc-1", 500);
      policy.recordUpdate("doc-1", 300);

      const result = policy.shouldSnapshot("doc-1");
      expect(result.state.bytesSinceSnapshot).toBe(800);
    });
  });

  describe("time threshold", () => {
    it("should not trigger without minimum updates", () => {
      // Only 5 updates (below minUpdatesForTimeTrigger)
      for (let i = 0; i < 5; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      // Advance past time threshold
      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(false);
    });

    it("should trigger with minimum updates after time", () => {
      // Meet minimum updates
      for (let i = 0; i < 10; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      // Advance past time threshold
      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(true);
      expect(result.reason).toBe("time_threshold");
    });

    it("should report minutes since snapshot", () => {
      policy.recordUpdate("doc-1", 100);

      vi.advanceTimersByTime(3 * 60 * 1000);

      const result = policy.shouldSnapshot("doc-1");
      expect(result.state.minutesSinceSnapshot).toBeCloseTo(3, 0);
    });
  });

  describe("snapshot lifecycle", () => {
    it("should block during snapshot in progress", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      policy.markSnapshotStarted("doc-1");

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(false);
    });

    it("should reset state after snapshot complete", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      policy.markSnapshotStarted("doc-1");
      policy.markSnapshotComplete("doc-1", "update_threshold");

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(false);
      expect(result.state.updatesSinceSnapshot).toBe(0);
      expect(result.state.bytesSinceSnapshot).toBe(0);
    });

    it("should allow retry after snapshot failed", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }

      policy.markSnapshotStarted("doc-1");
      policy.markSnapshotFailed("doc-1");

      const result = policy.shouldSnapshot("doc-1");
      expect(result.shouldSnapshot).toBe(true);
    });
  });

  describe("multi-document tracking", () => {
    it("should track documents independently", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }
      for (let i = 0; i < 50; i++) {
        policy.recordUpdate("doc-2", 100);
      }

      expect(policy.shouldSnapshot("doc-1").shouldSnapshot).toBe(true);
      expect(policy.shouldSnapshot("doc-2").shouldSnapshot).toBe(false);
    });

    it("should track document count", () => {
      policy.recordUpdate("doc-1", 100);
      policy.recordUpdate("doc-2", 100);
      policy.recordUpdate("doc-3", 100);

      expect(policy.getDocCount()).toBe(3);
    });

    it("should remove document tracking", () => {
      policy.recordUpdate("doc-1", 100);
      policy.recordUpdate("doc-2", 100);

      policy.removeDoc("doc-1");

      expect(policy.getDocCount()).toBe(1);
    });
  });

  describe("metrics", () => {
    it("should track snapshot metrics", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }
      policy.markSnapshotComplete("doc-1", "update_threshold");

      for (let i = 0; i < 50; i++) {
        policy.recordUpdate("doc-2", 100);
      }
      vi.advanceTimersByTime(6 * 60 * 1000);
      policy.markSnapshotComplete("doc-2", "time_threshold");

      const metrics = policy.getMetrics();
      expect(metrics.totalSnapshots).toBe(2);
      expect(metrics.snapshotsByReason.update_threshold).toBe(1);
      expect(metrics.snapshotsByReason.time_threshold).toBe(1);
    });

    it("should calculate average updates per snapshot", () => {
      for (let i = 0; i < 100; i++) {
        policy.recordUpdate("doc-1", 100);
      }
      policy.markSnapshotComplete("doc-1", "update_threshold");

      for (let i = 0; i < 200; i++) {
        policy.recordUpdate("doc-1", 100);
      }
      policy.markSnapshotComplete("doc-1", "update_threshold");

      const metrics = policy.getMetrics();
      expect(metrics.avgUpdatesPerSnapshot).toBe(150);
    });

    it("should reset metrics", () => {
      policy.markSnapshotComplete("doc-1", "manual");
      policy.resetMetrics();

      const metrics = policy.getMetrics();
      expect(metrics.totalSnapshots).toBe(0);
    });
  });
});
