/**
 * Reconnect Manager
 *
 * Handles client reconnection with incremental catch-up or snapshot fallback.
 * Tracks reconnect metrics for observability.
 */

/** Resync type */
export type ResyncType = "incremental" | "snapshot" | "none";

/** Reconnect result */
export interface ReconnectResult {
  /** Type of resync performed */
  resyncType: ResyncType;
  /** Data to send to client (if any) */
  data?: Uint8Array;
  /** Current frontier tag */
  frontierTag: string;
  /** Duration of reconnect handling (ms) */
  durationMs: number;
  /** Number of updates in incremental resync */
  updateCount?: number;
  /** Whether client is up to date */
  upToDate: boolean;
}

/** Reconnect metrics */
export interface ReconnectMetrics {
  /** Total reconnect attempts */
  totalReconnects: number;
  /** Reconnects by type */
  reconnectsByType: Record<ResyncType, number>;
  /** Average reconnect duration (ms) */
  avgDurationMs: number;
  /** P95 reconnect duration (ms) */
  p95DurationMs: number;
  /** Failed reconnects */
  failedReconnects: number;
}

/** Reconnect manager configuration */
export interface ReconnectManagerConfig {
  /** Maximum updates for incremental resync (default: 100) */
  maxIncrementalUpdates: number;
  /** Maximum age for incremental resync in ms (default: 5 minutes) */
  maxIncrementalAgeMs: number;
  /** Timeout for reconnect handling in ms (default: 5000) */
  timeoutMs: number;
}

/** Persistence adapter interface */
export interface ReconnectPersistenceAdapter {
  /** Get current frontier tag for a document */
  getCurrentFrontierTag(docId: string): Promise<string>;
  /** Get updates since a frontier tag */
  getUpdatesSince(
    docId: string,
    fromFrontierTag: string
  ): Promise<{ data: Uint8Array; frontierTag: string; count: number } | null>;
  /** Get full snapshot */
  getSnapshot(docId: string): Promise<{ data: Uint8Array; frontierTag: string } | null>;
}

const DEFAULT_CONFIG: ReconnectManagerConfig = {
  maxIncrementalUpdates: 100,
  maxIncrementalAgeMs: 5 * 60 * 1000, // 5 minutes
  timeoutMs: 5000,
};

/**
 * Reconnect manager for handling client reconnections.
 */
export class ReconnectManager {
  private config: ReconnectManagerConfig;
  private persistence: ReconnectPersistenceAdapter;
  private metrics: ReconnectMetrics = {
    totalReconnects: 0,
    reconnectsByType: {
      incremental: 0,
      snapshot: 0,
      none: 0,
    },
    avgDurationMs: 0,
    p95DurationMs: 0,
    failedReconnects: 0,
  };
  private durations: number[] = [];
  private totalDurationMs = 0;

  constructor(
    persistence: ReconnectPersistenceAdapter,
    config: Partial<ReconnectManagerConfig> = {}
  ) {
    this.persistence = persistence;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Handle client reconnection.
   */
  async handleReconnect(
    docId: string,
    clientId: string,
    lastFrontierTag: string
  ): Promise<ReconnectResult> {
    const startTime = Date.now();
    this.metrics.totalReconnects++;

    try {
      // Get current frontier
      const currentFrontierTag = await this.persistence.getCurrentFrontierTag(docId);

      // Check if client is already up to date
      if (lastFrontierTag === currentFrontierTag) {
        const duration = Date.now() - startTime;
        this.recordDuration(duration);
        this.metrics.reconnectsByType.none++;

        return {
          resyncType: "none",
          frontierTag: currentFrontierTag,
          durationMs: duration,
          upToDate: true,
        };
      }

      // Try incremental catch-up first
      const incrementalResult = await this.tryIncrementalCatchUp(
        docId,
        lastFrontierTag,
        currentFrontierTag
      );

      if (incrementalResult) {
        const duration = Date.now() - startTime;
        this.recordDuration(duration);
        this.metrics.reconnectsByType.incremental++;

        return {
          resyncType: "incremental",
          data: incrementalResult.data,
          frontierTag: incrementalResult.frontierTag,
          durationMs: duration,
          updateCount: incrementalResult.count,
          upToDate: true,
        };
      }

      // Fall back to snapshot
      const snapshotResult = await this.getSnapshot(docId);

      if (snapshotResult) {
        const duration = Date.now() - startTime;
        this.recordDuration(duration);
        this.metrics.reconnectsByType.snapshot++;

        return {
          resyncType: "snapshot",
          data: snapshotResult.data,
          frontierTag: snapshotResult.frontierTag,
          durationMs: duration,
          upToDate: true,
        };
      }

      // No data available
      const duration = Date.now() - startTime;
      this.recordDuration(duration);
      this.metrics.reconnectsByType.none++;

      return {
        resyncType: "none",
        frontierTag: currentFrontierTag,
        durationMs: duration,
        upToDate: false,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordDuration(duration);
      this.metrics.failedReconnects++;

      console.error(`[ReconnectManager] Reconnect failed for ${clientId}:`, error);

      throw error;
    }
  }

  /**
   * Try incremental catch-up.
   */
  private async tryIncrementalCatchUp(
    docId: string,
    fromFrontierTag: string,
    _currentFrontierTag: string
  ): Promise<{ data: Uint8Array; frontierTag: string; count: number } | null> {
    try {
      const updates = await this.persistence.getUpdatesSince(docId, fromFrontierTag);

      if (!updates) {
        return null;
      }

      // Check if too many updates for incremental
      if (updates.count > this.config.maxIncrementalUpdates) {
        return null;
      }

      return updates;
    } catch {
      return null;
    }
  }

  /**
   * Get full snapshot.
   */
  private async getSnapshot(
    docId: string
  ): Promise<{ data: Uint8Array; frontierTag: string } | null> {
    try {
      return await this.persistence.getSnapshot(docId);
    } catch {
      return null;
    }
  }

  /**
   * Record duration for metrics.
   */
  private recordDuration(durationMs: number): void {
    this.durations.push(durationMs);
    this.totalDurationMs += durationMs;

    // Keep only last 1000 durations for P95 calculation
    if (this.durations.length > 1000) {
      const removed = this.durations.shift();
      if (removed !== undefined) {
        this.totalDurationMs -= removed;
      }
    }

    // Update average
    this.metrics.avgDurationMs = this.totalDurationMs / this.durations.length;

    // Update P95
    if (this.durations.length >= 20) {
      const sorted = [...this.durations].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.metrics.p95DurationMs = sorted[p95Index];
    }
  }

  /**
   * Get reconnect metrics.
   */
  getMetrics(): ReconnectMetrics {
    return {
      ...this.metrics,
      reconnectsByType: { ...this.metrics.reconnectsByType },
    };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      totalReconnects: 0,
      reconnectsByType: {
        incremental: 0,
        snapshot: 0,
        none: 0,
      },
      avgDurationMs: 0,
      p95DurationMs: 0,
      failedReconnects: 0,
    };
    this.durations = [];
    this.totalDurationMs = 0;
  }
}
