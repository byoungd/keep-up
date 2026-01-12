/**
 * Snapshot Policy
 *
 * Determines when to trigger snapshot/compaction for documents.
 * Prevents long sessions from accumulating unbounded updates.
 */

/** Snapshot policy configuration */
export interface SnapshotPolicyConfig {
  /** Trigger snapshot after N updates (default: 1000) */
  updateThreshold: number;
  /** Trigger snapshot after M minutes (default: 30) */
  timeThresholdMinutes: number;
  /** Minimum updates before time-based trigger (default: 100) */
  minUpdatesForTimeTrigger: number;
  /** Maximum snapshot size in bytes (default: 10MB) */
  maxSnapshotBytes: number;
}

/** Document snapshot state */
interface DocSnapshotState {
  /** Update count since last snapshot */
  updatesSinceSnapshot: number;
  /** Timestamp of last snapshot */
  lastSnapshotTs: number;
  /** Total bytes since last snapshot (estimated) */
  bytesSinceSnapshot: number;
  /** Whether snapshot is currently in progress */
  snapshotInProgress: boolean;
}

/** Snapshot trigger reason */
export type SnapshotTriggerReason = "update_threshold" | "time_threshold" | "manual" | "none";

/** Snapshot check result */
export interface SnapshotCheckResult {
  /** Whether snapshot should be triggered */
  shouldSnapshot: boolean;
  /** Reason for trigger (or 'none') */
  reason: SnapshotTriggerReason;
  /** Current state info */
  state: {
    updatesSinceSnapshot: number;
    minutesSinceSnapshot: number;
    bytesSinceSnapshot: number;
  };
}

/** Snapshot metrics */
export interface SnapshotMetrics {
  /** Total snapshots triggered */
  totalSnapshots: number;
  /** Snapshots by reason */
  snapshotsByReason: Record<SnapshotTriggerReason, number>;
  /** Average updates per snapshot */
  avgUpdatesPerSnapshot: number;
  /** Average time between snapshots (minutes) */
  avgTimeBetweenSnapshotsMinutes: number;
}

const DEFAULT_CONFIG: SnapshotPolicyConfig = {
  updateThreshold: 1000,
  timeThresholdMinutes: 30,
  minUpdatesForTimeTrigger: 100,
  maxSnapshotBytes: 10 * 1024 * 1024, // 10MB
};

/**
 * Snapshot policy for managing document compaction.
 */
export class SnapshotPolicy {
  private config: SnapshotPolicyConfig;
  private docs = new Map<string, DocSnapshotState>();
  private metrics: SnapshotMetrics = {
    totalSnapshots: 0,
    snapshotsByReason: {
      update_threshold: 0,
      time_threshold: 0,
      manual: 0,
      none: 0,
    },
    avgUpdatesPerSnapshot: 0,
    avgTimeBetweenSnapshotsMinutes: 0,
  };
  private totalUpdatesAtSnapshot = 0;
  private totalTimeBetweenSnapshots = 0;

  constructor(config: Partial<SnapshotPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if snapshot should be triggered for a document.
   */
  shouldSnapshot(docId: string): SnapshotCheckResult {
    const state = this.getOrCreateState(docId);
    const now = Date.now();
    const minutesSinceSnapshot = (now - state.lastSnapshotTs) / (60 * 1000);

    const baseResult = {
      state: {
        updatesSinceSnapshot: state.updatesSinceSnapshot,
        minutesSinceSnapshot,
        bytesSinceSnapshot: state.bytesSinceSnapshot,
      },
    };

    // Don't trigger if snapshot already in progress
    if (state.snapshotInProgress) {
      return {
        ...baseResult,
        shouldSnapshot: false,
        reason: "none",
      };
    }

    // Check update threshold
    if (state.updatesSinceSnapshot >= this.config.updateThreshold) {
      return {
        ...baseResult,
        shouldSnapshot: true,
        reason: "update_threshold",
      };
    }

    // Check time threshold (only if minimum updates met)
    if (
      minutesSinceSnapshot >= this.config.timeThresholdMinutes &&
      state.updatesSinceSnapshot >= this.config.minUpdatesForTimeTrigger
    ) {
      return {
        ...baseResult,
        shouldSnapshot: true,
        reason: "time_threshold",
      };
    }

    return {
      ...baseResult,
      shouldSnapshot: false,
      reason: "none",
    };
  }

  /**
   * Record an update for a document.
   */
  recordUpdate(docId: string, bytesEstimate = 0): void {
    const state = this.getOrCreateState(docId);
    state.updatesSinceSnapshot++;
    state.bytesSinceSnapshot += bytesEstimate;
  }

  /**
   * Mark snapshot as started for a document.
   */
  markSnapshotStarted(docId: string): void {
    const state = this.getOrCreateState(docId);
    state.snapshotInProgress = true;
  }

  /**
   * Mark snapshot as complete for a document.
   */
  markSnapshotComplete(docId: string, reason: SnapshotTriggerReason = "manual"): void {
    const state = this.getOrCreateState(docId);
    const now = Date.now();

    // Update metrics
    this.metrics.totalSnapshots++;
    this.metrics.snapshotsByReason[reason]++;
    this.totalUpdatesAtSnapshot += state.updatesSinceSnapshot;
    this.totalTimeBetweenSnapshots += (now - state.lastSnapshotTs) / (60 * 1000);

    if (this.metrics.totalSnapshots > 0) {
      this.metrics.avgUpdatesPerSnapshot =
        this.totalUpdatesAtSnapshot / this.metrics.totalSnapshots;
      this.metrics.avgTimeBetweenSnapshotsMinutes =
        this.totalTimeBetweenSnapshots / this.metrics.totalSnapshots;
    }

    // Reset state
    state.updatesSinceSnapshot = 0;
    state.bytesSinceSnapshot = 0;
    state.lastSnapshotTs = now;
    state.snapshotInProgress = false;
  }

  /**
   * Mark snapshot as failed for a document.
   */
  markSnapshotFailed(docId: string): void {
    const state = this.docs.get(docId);
    if (state) {
      state.snapshotInProgress = false;
    }
  }

  /**
   * Get snapshot metrics.
   */
  getMetrics(): SnapshotMetrics {
    return {
      ...this.metrics,
      snapshotsByReason: { ...this.metrics.snapshotsByReason },
    };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalSnapshots: 0,
      snapshotsByReason: {
        update_threshold: 0,
        time_threshold: 0,
        manual: 0,
        none: 0,
      },
      avgUpdatesPerSnapshot: 0,
      avgTimeBetweenSnapshotsMinutes: 0,
    };
    this.totalUpdatesAtSnapshot = 0;
    this.totalTimeBetweenSnapshots = 0;
  }

  /**
   * Get document count being tracked.
   */
  getDocCount(): number {
    return this.docs.size;
  }

  /**
   * Remove tracking for a document.
   */
  removeDoc(docId: string): void {
    this.docs.delete(docId);
  }

  /**
   * Clear all tracking.
   */
  clear(): void {
    this.docs.clear();
  }

  /**
   * Get or create state for a document.
   */
  private getOrCreateState(docId: string): DocSnapshotState {
    let state = this.docs.get(docId);
    if (!state) {
      state = {
        updatesSinceSnapshot: 0,
        lastSnapshotTs: Date.now(),
        bytesSinceSnapshot: 0,
        snapshotInProgress: false,
      };
      this.docs.set(docId, state);
    }
    return state;
  }
}
