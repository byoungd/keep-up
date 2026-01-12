/**
 * Performance Profiler
 *
 * CPU and memory profiling for AI operations.
 * Identifies performance bottlenecks and resource usage patterns.
 *
 * Features:
 * - Function-level timing
 * - Memory allocation tracking
 * - Async operation profiling
 * - Flame graph compatible output
 * - Aggregated statistics
 */

// ============================================================================
// Types
// ============================================================================

/** Profile entry */
export interface ProfileEntry {
  /** Entry ID */
  id: string;
  /** Function/operation name */
  name: string;
  /** Category */
  category: string;
  /** Start timestamp (high-resolution) */
  startTime: number;
  /** End timestamp */
  endTime?: number;
  /** Duration in ms */
  duration?: number;
  /** Self time (excluding children) */
  selfTime?: number;
  /** Parent entry ID */
  parentId?: string;
  /** Child entry IDs */
  childIds: string[];
  /** Memory before (if tracked) */
  memoryBefore?: MemorySnapshot;
  /** Memory after */
  memoryAfter?: MemorySnapshot;
  /** Memory delta */
  memoryDelta?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Async operation */
  isAsync: boolean;
  /** Error if failed */
  error?: string;
}

/** Memory snapshot */
export interface MemorySnapshot {
  /** Used heap size in bytes */
  usedHeapSize: number;
  /** Total heap size */
  totalHeapSize: number;
  /** Heap size limit */
  heapSizeLimit: number;
  /** Timestamp */
  timestamp: number;
}

/** Profile report */
export interface ProfileReport {
  /** Report ID */
  id: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** Total duration */
  totalDuration: number;
  /** All entries */
  entries: ProfileEntry[];
  /** Hot paths (most time-consuming) */
  hotPaths: HotPath[];
  /** Function statistics */
  functionStats: FunctionStats[];
  /** Memory statistics */
  memoryStats: MemoryStats;
  /** Summary */
  summary: ProfileSummary;
}

/** Hot path (call stack with high cumulative time) */
export interface HotPath {
  /** Call stack (function names) */
  stack: string[];
  /** Cumulative time */
  cumulativeTime: number;
  /** Percentage of total time */
  percentage: number;
  /** Hit count */
  hitCount: number;
}

/** Function-level statistics */
export interface FunctionStats {
  /** Function name */
  name: string;
  /** Category */
  category: string;
  /** Call count */
  callCount: number;
  /** Total time */
  totalTime: number;
  /** Self time (excluding children) */
  selfTime: number;
  /** Average time per call */
  avgTime: number;
  /** Min time */
  minTime: number;
  /** Max time */
  maxTime: number;
  /** Standard deviation */
  stdDev: number;
}

/** Memory statistics */
export interface MemoryStats {
  /** Peak memory usage */
  peakUsage: number;
  /** Average memory usage */
  avgUsage: number;
  /** Memory allocations count */
  allocationCount: number;
  /** Total allocated bytes */
  totalAllocated: number;
  /** Memory snapshots */
  snapshots: MemorySnapshot[];
}

/** Profile summary */
export interface ProfileSummary {
  /** Total operations */
  totalOperations: number;
  /** Successful operations */
  successfulOperations: number;
  /** Failed operations */
  failedOperations: number;
  /** Total time */
  totalTime: number;
  /** Operations per second */
  operationsPerSecond: number;
  /** Categories breakdown */
  categoriesBreakdown: Record<string, { count: number; time: number }>;
}

/** Profiler configuration */
export interface ProfilerConfig {
  /** Enable memory tracking (default: true) */
  trackMemory: boolean;
  /** Memory snapshot interval in ms (default: 1000) */
  memorySnapshotIntervalMs: number;
  /** Max entries to keep (default: 10000) */
  maxEntries: number;
  /** Hot path analysis depth (default: 10) */
  hotPathDepth: number;
  /** Categories to track (default: all) */
  categories?: string[];
  /** Sampling rate (0-1, default: 1) */
  samplingRate: number;
}

/** Profiler metrics */
export interface ProfilerMetrics {
  /** Active profiles */
  activeProfiles: number;
  /** Total entries */
  totalEntries: number;
  /** Memory snapshots taken */
  memorySnapshots: number;
  /** Dropped entries (due to max limit) */
  droppedEntries: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ProfilerConfig = {
  trackMemory: true,
  memorySnapshotIntervalMs: 1000,
  maxEntries: 10000,
  hotPathDepth: 10,
  samplingRate: 1,
};

// ============================================================================
// Performance Profiler Implementation
// ============================================================================

/**
 * Performance Profiler
 *
 * Profiles function execution time and memory usage.
 */
export class PerformanceProfiler {
  private readonly config: ProfilerConfig;
  private readonly entries = new Map<string, ProfileEntry>();
  private readonly activeStack: string[] = [];
  private readonly memorySnapshots: MemorySnapshot[] = [];
  private memoryInterval: ReturnType<typeof setInterval> | null = null;
  private entryCounter = 0;
  private droppedEntries = 0;
  private reportCounter = 0;
  private sessionStartTime = performance.now();

  constructor(config: Partial<ProfilerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start profiling session.
   */
  startSession(): void {
    this.sessionStartTime = performance.now();
    this.entries.clear();
    this.activeStack.length = 0;
    this.memorySnapshots.length = 0;
    this.entryCounter = 0;
    this.droppedEntries = 0;

    if (this.config.trackMemory) {
      this.startMemoryTracking();
    }
  }

  /**
   * End profiling session and generate report.
   */
  endSession(): ProfileReport {
    this.stopMemoryTracking();

    const endTime = performance.now();
    const entries = Array.from(this.entries.values());

    // Calculate self times
    this.calculateSelfTimes(entries);

    // Generate hot paths
    const hotPaths = this.generateHotPaths(entries);

    // Generate function stats
    const functionStats = this.generateFunctionStats(entries);

    // Generate memory stats
    const memoryStats = this.generateMemoryStats();

    // Generate summary
    const summary = this.generateSummary(entries);

    this.reportCounter++;

    return {
      id: `profile-${this.reportCounter}-${Date.now()}`,
      startTime: this.sessionStartTime,
      endTime,
      totalDuration: endTime - this.sessionStartTime,
      entries,
      hotPaths,
      functionStats,
      memoryStats,
      summary,
    };
  }

  /**
   * Start profiling a function/operation.
   */
  start(name: string, category = "default", metadata?: Record<string, unknown>): string {
    // Check sampling
    if (Math.random() > this.config.samplingRate) {
      return "";
    }

    // Check category filter
    if (this.config.categories && !this.config.categories.includes(category)) {
      return "";
    }

    const id = this.generateId();
    const parentId = this.activeStack[this.activeStack.length - 1];

    const entry: ProfileEntry = {
      id,
      name,
      category,
      startTime: performance.now(),
      parentId,
      childIds: [],
      metadata,
      isAsync: false,
    };

    // Track memory
    if (this.config.trackMemory) {
      entry.memoryBefore = this.takeMemorySnapshot();
    }

    // Add to parent's children
    if (parentId) {
      const parent = this.entries.get(parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    this.entries.set(id, entry);
    this.activeStack.push(id);

    // Enforce max entries
    if (this.entries.size > this.config.maxEntries) {
      const oldestId = this.entries.keys().next().value;
      if (oldestId) {
        this.entries.delete(oldestId);
        this.droppedEntries++;
      }
    }

    return id;
  }

  /**
   * End profiling a function/operation.
   */
  end(id: string, error?: Error): void {
    if (!id) {
      return;
    }

    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.endTime = performance.now();
    entry.duration = entry.endTime - entry.startTime;

    if (error) {
      entry.error = error.message;
    }

    // Track memory
    if (this.config.trackMemory && entry.memoryBefore) {
      entry.memoryAfter = this.takeMemorySnapshot();
      entry.memoryDelta = entry.memoryAfter.usedHeapSize - entry.memoryBefore.usedHeapSize;
    }

    // Pop from stack
    const stackIndex = this.activeStack.indexOf(id);
    if (stackIndex !== -1) {
      this.activeStack.splice(stackIndex, 1);
    }
  }

  /**
   * Profile a synchronous function.
   */
  profile<T>(
    name: string,
    fn: () => T,
    options: { category?: string; metadata?: Record<string, unknown> } = {}
  ): T {
    const id = this.start(name, options.category, options.metadata);

    try {
      const result = fn();
      this.end(id);
      return result;
    } catch (error) {
      this.end(id, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Profile an async function.
   */
  async profileAsync<T>(
    name: string,
    fn: () => Promise<T>,
    options: { category?: string; metadata?: Record<string, unknown> } = {}
  ): Promise<T> {
    const id = this.start(name, options.category, options.metadata);
    const entry = this.entries.get(id);
    if (entry) {
      entry.isAsync = true;
    }

    try {
      const result = await fn();
      this.end(id);
      return result;
    } catch (error) {
      this.end(id, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Create a profiling decorator.
   */
  decorator(name: string, options: { category?: string } = {}): <T>(fn: () => T) => T {
    return <T>(fn: () => T): T => {
      return this.profile(name, fn, options);
    };
  }

  /**
   * Create an async profiling decorator.
   */
  asyncDecorator(
    name: string,
    options: { category?: string } = {}
  ): <T>(fn: () => Promise<T>) => Promise<T> {
    return <T>(fn: () => Promise<T>): Promise<T> => {
      return this.profileAsync(name, fn, options);
    };
  }

  /**
   * Get profiler metrics.
   */
  getMetrics(): ProfilerMetrics {
    return {
      activeProfiles: this.activeStack.length,
      totalEntries: this.entries.size,
      memorySnapshots: this.memorySnapshots.length,
      droppedEntries: this.droppedEntries,
    };
  }

  /**
   * Get current entry.
   */
  getCurrentEntry(): ProfileEntry | undefined {
    const currentId = this.activeStack[this.activeStack.length - 1];
    return currentId ? this.entries.get(currentId) : undefined;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
    this.activeStack.length = 0;
    this.memorySnapshots.length = 0;
    this.droppedEntries = 0;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateId(): string {
    this.entryCounter++;
    return `entry-${this.entryCounter}-${Date.now().toString(36)}`;
  }

  private startMemoryTracking(): void {
    this.stopMemoryTracking();

    this.memoryInterval = setInterval(() => {
      this.memorySnapshots.push(this.takeMemorySnapshot());
    }, this.config.memorySnapshotIntervalMs);
  }

  private stopMemoryTracking(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  private takeMemorySnapshot(): MemorySnapshot {
    // Use Performance API if available, otherwise estimate
    const memory = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      }
    ).memory;

    if (memory) {
      return {
        usedHeapSize: memory.usedJSHeapSize,
        totalHeapSize: memory.totalJSHeapSize,
        heapSizeLimit: memory.jsHeapSizeLimit,
        timestamp: Date.now(),
      };
    }

    // Fallback for environments without memory API
    return {
      usedHeapSize: 0,
      totalHeapSize: 0,
      heapSizeLimit: 0,
      timestamp: Date.now(),
    };
  }

  private calculateSelfTimes(entries: ProfileEntry[]): void {
    for (const entry of entries) {
      if (!entry.duration) {
        continue;
      }

      // Calculate child time
      let childTime = 0;
      for (const childId of entry.childIds) {
        const child = this.entries.get(childId);
        if (child?.duration) {
          childTime += child.duration;
        }
      }

      entry.selfTime = entry.duration - childTime;
    }
  }

  private generateHotPaths(entries: ProfileEntry[]): HotPath[] {
    const pathCounts = new Map<string, { time: number; count: number }>();

    for (const entry of entries) {
      if (!entry.duration) {
        continue;
      }

      // Build path from entry to root
      const path: string[] = [entry.name];
      let current = entry;

      while (current.parentId) {
        const parent = this.entries.get(current.parentId);
        if (!parent) {
          break;
        }
        path.unshift(parent.name);
        current = parent;

        if (path.length >= this.config.hotPathDepth) {
          break;
        }
      }

      const pathKey = path.join(" → ");
      const existing = pathCounts.get(pathKey) || { time: 0, count: 0 };
      pathCounts.set(pathKey, {
        time: existing.time + entry.duration,
        count: existing.count + 1,
      });
    }

    // Calculate total time for percentages
    const totalTime = entries.reduce((sum, e) => sum + (e.selfTime || 0), 0);

    // Convert to hot paths and sort
    return Array.from(pathCounts.entries())
      .map(([pathKey, data]) => ({
        stack: pathKey.split(" → "),
        cumulativeTime: data.time,
        percentage: totalTime > 0 ? (data.time / totalTime) * 100 : 0,
        hitCount: data.count,
      }))
      .sort((a, b) => b.cumulativeTime - a.cumulativeTime)
      .slice(0, 20);
  }

  private generateFunctionStats(entries: ProfileEntry[]): FunctionStats[] {
    const statsByName = new Map<
      string,
      { category: string; times: number[]; selfTimes: number[] }
    >();

    for (const entry of entries) {
      if (!entry.duration) {
        continue;
      }

      const existing = statsByName.get(entry.name) || {
        category: entry.category,
        times: [],
        selfTimes: [],
      };

      existing.times.push(entry.duration);
      if (entry.selfTime !== undefined) {
        existing.selfTimes.push(entry.selfTime);
      }

      statsByName.set(entry.name, existing);
    }

    return Array.from(statsByName.entries())
      .map(([name, data]) => {
        const times = data.times;
        const totalTime = times.reduce((a, b) => a + b, 0);
        const avgTime = totalTime / times.length;
        const selfTime = data.selfTimes.reduce((a, b) => a + b, 0);

        // Calculate standard deviation
        const variance = times.reduce((sum, t) => sum + (t - avgTime) ** 2, 0) / times.length;
        const stdDev = Math.sqrt(variance);

        return {
          name,
          category: data.category,
          callCount: times.length,
          totalTime,
          selfTime,
          avgTime,
          minTime: Math.min(...times),
          maxTime: Math.max(...times),
          stdDev,
        };
      })
      .sort((a, b) => b.totalTime - a.totalTime);
  }

  private generateMemoryStats(): MemoryStats {
    const snapshots = this.memorySnapshots;

    if (snapshots.length === 0) {
      return {
        peakUsage: 0,
        avgUsage: 0,
        allocationCount: 0,
        totalAllocated: 0,
        snapshots: [],
      };
    }

    const usages = snapshots.map((s) => s.usedHeapSize);
    const peakUsage = Math.max(...usages);
    const avgUsage = usages.reduce((a, b) => a + b, 0) / usages.length;

    // Estimate allocations (positive deltas)
    let allocationCount = 0;
    let totalAllocated = 0;

    for (let i = 1; i < snapshots.length; i++) {
      const delta = snapshots[i].usedHeapSize - snapshots[i - 1].usedHeapSize;
      if (delta > 0) {
        allocationCount++;
        totalAllocated += delta;
      }
    }

    return {
      peakUsage,
      avgUsage,
      allocationCount,
      totalAllocated,
      snapshots,
    };
  }

  private generateSummary(entries: ProfileEntry[]): ProfileSummary {
    const successfulOperations = entries.filter((e) => !e.error).length;
    const failedOperations = entries.filter((e) => e.error).length;
    const totalTime = entries.reduce((sum, e) => sum + (e.selfTime || 0), 0);

    // Categories breakdown
    const categoriesBreakdown: Record<string, { count: number; time: number }> = {};
    for (const entry of entries) {
      if (!categoriesBreakdown[entry.category]) {
        categoriesBreakdown[entry.category] = { count: 0, time: 0 };
      }
      categoriesBreakdown[entry.category].count++;
      categoriesBreakdown[entry.category].time += entry.selfTime || 0;
    }

    return {
      totalOperations: entries.length,
      successfulOperations,
      failedOperations,
      totalTime,
      operationsPerSecond: totalTime > 0 ? (entries.length / totalTime) * 1000 : 0,
      categoriesBreakdown,
    };
  }
}

/**
 * Create a performance profiler.
 */
export function createPerformanceProfiler(
  config: Partial<ProfilerConfig> = {}
): PerformanceProfiler {
  return new PerformanceProfiler(config);
}
