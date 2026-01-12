/**
 * LFCC v0.9 RC - Performance Counters
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 *
 * Lightweight dev-only performance tracking
 */

import type { PerfSectionData } from "./types";

/**
 * Rolling window for calculating rates
 */
type RollingWindow = {
  timestamps: number[];
  windowMs: number;
};

/**
 * Duration tracker for avg/p95 calculations
 */
type DurationTracker = {
  samples: number[];
  maxSamples: number;
};

function createRollingWindow(windowMs = 1000): RollingWindow {
  return { timestamps: [], windowMs };
}

function createDurationTracker(maxSamples = 100): DurationTracker {
  return { samples: [], maxSamples };
}

function recordEvent(window: RollingWindow): void {
  const now = performance.now();
  window.timestamps.push(now);
  // Clean old entries
  const cutoff = now - window.windowMs;
  while (window.timestamps.length > 0 && window.timestamps[0] < cutoff) {
    window.timestamps.shift();
  }
}

function getRate(window: RollingWindow): number {
  const now = performance.now();
  const cutoff = now - window.windowMs;
  let count = 0;
  for (const ts of window.timestamps) {
    if (ts >= cutoff) {
      count++;
    }
  }
  return count * (1000 / window.windowMs);
}

function recordDuration(tracker: DurationTracker, durationMs: number): void {
  tracker.samples.push(durationMs);
  if (tracker.samples.length > tracker.maxSamples) {
    tracker.samples.shift();
  }
}

function getAvgDuration(tracker: DurationTracker): number {
  if (tracker.samples.length === 0) {
    return 0;
  }
  const sum = tracker.samples.reduce((a, b) => a + b, 0);
  return sum / tracker.samples.length;
}

function getP95Duration(tracker: DurationTracker): number {
  if (tracker.samples.length === 0) {
    return 0;
  }
  const sorted = [...tracker.samples].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Performance counter manager (dev-only)
 */
export type PerfCounters = {
  /** Record a drag update event */
  recordDragUpdate: () => void;
  /** Record a resolution call with duration */
  recordResolution: (durationMs: number) => void;
  /** Record a decoration rebuild */
  recordDecorationRebuild: () => void;
  /** Get current perf data */
  getData: () => PerfSectionData;
  /** Reset all counters */
  reset: () => void;
};

/**
 * Create performance counters for debug overlay
 */
export function createPerfCounters(): PerfCounters {
  let dragWindow = createRollingWindow();
  let resolutionWindow = createRollingWindow();
  let decorationWindow = createRollingWindow();
  let resolutionDurations = createDurationTracker();

  return {
    recordDragUpdate() {
      recordEvent(dragWindow);
    },

    recordResolution(durationMs: number) {
      recordEvent(resolutionWindow);
      recordDuration(resolutionDurations, durationMs);
    },

    recordDecorationRebuild() {
      recordEvent(decorationWindow);
    },

    getData(): PerfSectionData {
      return {
        dragUpdatesPerSecond: Math.round(getRate(dragWindow)),
        resolutionCallsPerSecond: Math.round(getRate(resolutionWindow)),
        decorationRebuildsPerSecond: Math.round(getRate(decorationWindow)),
        avgResolutionDurationMs: Math.round(getAvgDuration(resolutionDurations) * 100) / 100,
        p95ResolutionDurationMs: Math.round(getP95Duration(resolutionDurations) * 100) / 100,
      };
    },

    reset() {
      dragWindow = createRollingWindow();
      resolutionWindow = createRollingWindow();
      decorationWindow = createRollingWindow();
      resolutionDurations = createDurationTracker();
    },
  };
}

/**
 * Global perf counters singleton (only in dev)
 */
let globalPerfCounters: PerfCounters | null = null;

/**
 * Get or create global perf counters
 */
export function getPerfCounters(): PerfCounters {
  if (!globalPerfCounters) {
    globalPerfCounters = createPerfCounters();
  }
  return globalPerfCounters;
}
