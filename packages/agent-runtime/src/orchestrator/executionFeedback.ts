/**
 * Execution Feedback Tracker
 *
 * Tracks historical execution outcomes for tools to inform scheduling decisions.
 * Provides success rates, average latencies, and failure patterns to enable
 * smarter tool selection and concurrency adjustments.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Execution outcome record.
 */
export interface ExecutionOutcome {
  /** Whether execution succeeded */
  success: boolean;
  /** Duration in milliseconds */
  durationMs: number;
  /** Timestamp of execution */
  timestamp: number;
  /** Error code if failed */
  errorCode?: string;
}

/**
 * Tool execution statistics.
 */
export interface ToolStats {
  /** Total execution count */
  totalExecutions: number;
  /** Successful execution count */
  successCount: number;
  /** Failed execution count */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average duration in milliseconds */
  averageDurationMs: number;
  /** P95 duration in milliseconds */
  p95DurationMs: number;
  /** Last execution time */
  lastExecutedAt: number;
  /** Common error codes */
  topErrorCodes: Array<{ code: string; count: number }>;
}

/**
 * Feedback tracker configuration.
 */
export interface ExecutionFeedbackConfig {
  /** Maximum history entries per tool */
  maxHistoryPerTool: number;
  /** Time window for stats calculation (ms) */
  statsWindowMs: number;
  /** Minimum executions for reliable stats */
  minExecutionsForStats: number;
}

const DEFAULT_CONFIG: ExecutionFeedbackConfig = {
  maxHistoryPerTool: 100,
  statsWindowMs: 3600_000, // 1 hour
  minExecutionsForStats: 5,
};

// ============================================================================
// Execution Feedback Tracker
// ============================================================================

/**
 * Tracks tool execution outcomes for informed scheduling decisions.
 */
export class ExecutionFeedbackTracker {
  private readonly config: ExecutionFeedbackConfig;
  private readonly history = new Map<string, ExecutionOutcome[]>();
  private readonly statsCache = new Map<string, { stats: ToolStats; cachedAt: number }>();
  private readonly STATS_CACHE_TTL_MS = 5000;

  constructor(config: Partial<ExecutionFeedbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record an execution outcome.
   */
  recordOutcome(toolName: string, outcome: Omit<ExecutionOutcome, "timestamp">): void {
    const record: ExecutionOutcome = {
      ...outcome,
      timestamp: Date.now(),
    };

    let toolHistory = this.history.get(toolName);
    if (!toolHistory) {
      toolHistory = [];
      this.history.set(toolName, toolHistory);
    }

    toolHistory.push(record);

    // Trim history if too large
    if (toolHistory.length > this.config.maxHistoryPerTool) {
      toolHistory.shift();
    }

    // Invalidate cache
    this.statsCache.delete(toolName);
  }

  /**
   * Get success rate for a tool.
   * Returns -1 if insufficient data.
   */
  getSuccessRate(toolName: string): number {
    const stats = this.getStats(toolName);
    if (!stats || stats.totalExecutions < this.config.minExecutionsForStats) {
      return -1;
    }
    return stats.successRate;
  }

  /**
   * Get average latency for a tool.
   * Returns -1 if insufficient data.
   */
  getAverageLatency(toolName: string): number {
    const stats = this.getStats(toolName);
    if (!stats || stats.totalExecutions < this.config.minExecutionsForStats) {
      return -1;
    }
    return stats.averageDurationMs;
  }

  /**
   * Get full statistics for a tool.
   */
  getStats(toolName: string): ToolStats | undefined {
    // Check cache
    const cached = this.statsCache.get(toolName);
    if (cached && Date.now() - cached.cachedAt < this.STATS_CACHE_TTL_MS) {
      return cached.stats;
    }

    const history = this.history.get(toolName);
    if (!history || history.length === 0) {
      return undefined;
    }

    // Filter to stats window
    const windowStart = Date.now() - this.config.statsWindowMs;
    const recentHistory = history.filter((h) => h.timestamp >= windowStart);

    if (recentHistory.length === 0) {
      return undefined;
    }

    // Calculate stats
    const successCount = recentHistory.filter((h) => h.success).length;
    const failureCount = recentHistory.length - successCount;
    const successRate = successCount / recentHistory.length;

    const durations = recentHistory.map((h) => h.durationMs).sort((a, b) => a - b);
    const averageDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p95DurationMs = durations[p95Index] ?? durations[durations.length - 1] ?? 0;

    // Count error codes
    const errorCounts = new Map<string, number>();
    for (const h of recentHistory) {
      if (!h.success && h.errorCode) {
        errorCounts.set(h.errorCode, (errorCounts.get(h.errorCode) ?? 0) + 1);
      }
    }
    const topErrorCodes = Array.from(errorCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stats: ToolStats = {
      totalExecutions: recentHistory.length,
      successCount,
      failureCount,
      successRate,
      averageDurationMs,
      p95DurationMs,
      lastExecutedAt: recentHistory[recentHistory.length - 1]?.timestamp ?? 0,
      topErrorCodes,
    };

    // Cache stats
    this.statsCache.set(toolName, { stats, cachedAt: Date.now() });

    return stats;
  }

  /**
   * Get all tracked tool names.
   */
  getTrackedTools(): string[] {
    return Array.from(this.history.keys());
  }

  /**
   * Get tools with low success rates.
   */
  getUnreliableTools(threshold = 0.8): Array<{ toolName: string; successRate: number }> {
    const unreliable: Array<{ toolName: string; successRate: number }> = [];

    for (const toolName of this.history.keys()) {
      const rate = this.getSuccessRate(toolName);
      if (rate >= 0 && rate < threshold) {
        unreliable.push({ toolName, successRate: rate });
      }
    }

    return unreliable.sort((a, b) => a.successRate - b.successRate);
  }

  /**
   * Get tools sorted by average latency.
   */
  getToolsByLatency(): Array<{ toolName: string; avgLatencyMs: number }> {
    const result: Array<{ toolName: string; avgLatencyMs: number }> = [];

    for (const toolName of this.history.keys()) {
      const latency = this.getAverageLatency(toolName);
      if (latency >= 0) {
        result.push({ toolName, avgLatencyMs: latency });
      }
    }

    return result.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.history.clear();
    this.statsCache.clear();
  }

  /**
   * Clear history for a specific tool.
   */
  clearTool(toolName: string): void {
    this.history.delete(toolName);
    this.statsCache.delete(toolName);
  }

  /**
   * Export history for persistence.
   */
  exportHistory(): Map<string, ExecutionOutcome[]> {
    return new Map(this.history);
  }

  /**
   * Import history from persistence.
   */
  importHistory(data: Map<string, ExecutionOutcome[]>): void {
    for (const [toolName, outcomes] of data) {
      this.history.set(toolName, [...outcomes]);
    }
    this.statsCache.clear();
  }
}

/**
 * Create an execution feedback tracker.
 */
export function createExecutionFeedbackTracker(
  config?: Partial<ExecutionFeedbackConfig>
): ExecutionFeedbackTracker {
  return new ExecutionFeedbackTracker(config);
}
