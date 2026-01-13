/**
 * Performance Profiler
 *
 * Lightweight profiling utilities for measuring and analyzing
 * agent runtime performance characteristics.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Profile entry for a single operation.
 */
export interface ProfileEntry {
  /** Operation name */
  name: string;
  /** Category for grouping */
  category: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp */
  endTime?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Parent entry ID for nested operations */
  parentId?: string;
  /** Entry ID */
  id: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Profile statistics.
 */
export interface ProfileStats {
  /** Total calls */
  count: number;
  /** Total duration */
  totalMs: number;
  /** Average duration */
  avgMs: number;
  /** Min duration */
  minMs: number;
  /** Max duration */
  maxMs: number;
  /** Percentile 50 */
  p50Ms: number;
  /** Percentile 95 */
  p95Ms: number;
  /** Percentile 99 */
  p99Ms: number;
}

/**
 * Profile report.
 */
export interface ProfileReport {
  /** Profile name */
  name: string;
  /** Start time */
  startedAt: number;
  /** End time */
  endedAt?: number;
  /** Total duration */
  totalDurationMs: number;
  /** Stats by category */
  byCategory: Map<string, ProfileStats>;
  /** Stats by operation */
  byOperation: Map<string, ProfileStats>;
  /** All entries */
  entries: ProfileEntry[];
}

/**
 * Profiler configuration.
 */
export interface ProfilerConfig {
  /** Enable profiling */
  enabled: boolean;
  /** Maximum entries to keep */
  maxEntries?: number;
  /** Categories to profile (empty = all) */
  categories?: string[];
}

// ============================================================================
// Profiler Implementation
// ============================================================================

/**
 * Performance profiler for measuring operation timings.
 */
export class Profiler {
  private readonly entries: ProfileEntry[] = [];
  private readonly config: Required<ProfilerConfig>;
  private readonly activeSpans = new Map<string, ProfileEntry>();
  private idCounter = 0;

  constructor(config: ProfilerConfig = { enabled: true }) {
    this.config = {
      enabled: config.enabled,
      maxEntries: config.maxEntries ?? 10000,
      categories: config.categories ?? [],
    };
  }

  /**
   * Profile a synchronous function.
   */
  profile<T>(name: string, category: string, fn: () => T): T {
    if (!this.config.enabled) {
      return fn();
    }

    const id = this.nextId();
    const startTime = performance.now();

    try {
      const result = fn();
      this.recordEntry({
        id,
        name,
        category,
        startTime,
        endTime: performance.now(),
        durationMs: performance.now() - startTime,
      });
      return result;
    } catch (error) {
      this.recordEntry({
        id,
        name,
        category,
        startTime,
        endTime: performance.now(),
        durationMs: performance.now() - startTime,
        metadata: { error: true },
      });
      throw error;
    }
  }

  /**
   * Profile an async function.
   */
  async profileAsync<T>(name: string, category: string, fn: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return fn();
    }

    const id = this.nextId();
    const startTime = performance.now();

    try {
      const result = await fn();
      this.recordEntry({
        id,
        name,
        category,
        startTime,
        endTime: performance.now(),
        durationMs: performance.now() - startTime,
      });
      return result;
    } catch (error) {
      this.recordEntry({
        id,
        name,
        category,
        startTime,
        endTime: performance.now(),
        durationMs: performance.now() - startTime,
        metadata: { error: true },
      });
      throw error;
    }
  }

  /**
   * Start a profiling span (for manual timing).
   */
  startSpan(name: string, category: string, parentId?: string): string {
    if (!this.config.enabled) {
      return "";
    }

    const id = this.nextId();
    const entry: ProfileEntry = {
      id,
      name,
      category,
      startTime: performance.now(),
      parentId,
    };

    this.activeSpans.set(id, entry);
    return id;
  }

  /**
   * End a profiling span.
   */
  endSpan(id: string, metadata?: Record<string, unknown>): void {
    if (!this.config.enabled || !id) {
      return;
    }

    const entry = this.activeSpans.get(id);
    if (!entry) {
      return;
    }

    entry.endTime = performance.now();
    entry.durationMs = entry.endTime - entry.startTime;
    entry.metadata = { ...entry.metadata, ...metadata };

    this.activeSpans.delete(id);
    this.recordEntry(entry);
  }

  /**
   * Get statistics for a category.
   */
  getStats(category?: string): ProfileStats | undefined {
    const entries = category
      ? this.entries.filter((e) => e.category === category && e.durationMs !== undefined)
      : this.entries.filter((e) => e.durationMs !== undefined);

    if (entries.length === 0) {
      return undefined;
    }

    return this.calculateStats(entries);
  }

  /**
   * Generate a profile report.
   */
  getReport(name = "Profile Report"): ProfileReport {
    const byCategory = new Map<string, ProfileEntry[]>();
    const byOperation = new Map<string, ProfileEntry[]>();

    for (const entry of this.entries) {
      if (entry.durationMs === undefined) {
        continue;
      }

      // Group by category
      const catEntries = byCategory.get(entry.category) ?? [];
      catEntries.push(entry);
      byCategory.set(entry.category, catEntries);

      // Group by operation
      const opKey = `${entry.category}:${entry.name}`;
      const opEntries = byOperation.get(opKey) ?? [];
      opEntries.push(entry);
      byOperation.set(opKey, opEntries);
    }

    const startedAt = this.entries.length > 0 ? this.entries[0].startTime : Date.now();
    const lastEntry = this.entries[this.entries.length - 1];
    const endedAt = lastEntry?.endTime;

    return {
      name,
      startedAt,
      endedAt,
      totalDurationMs: endedAt ? endedAt - startedAt : 0,
      byCategory: new Map([...byCategory.entries()].map(([k, v]) => [k, this.calculateStats(v)])),
      byOperation: new Map([...byOperation.entries()].map(([k, v]) => [k, this.calculateStats(v)])),
      entries: [...this.entries],
    };
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.length = 0;
    this.activeSpans.clear();
  }

  /**
   * Get entry count.
   */
  get entryCount(): number {
    return this.entries.length;
  }

  private recordEntry(entry: ProfileEntry): void {
    if (!this.shouldRecord(entry.category)) {
      return;
    }

    this.entries.push(entry);

    // Trim if over limit
    if (this.entries.length > this.config.maxEntries) {
      this.entries.splice(0, this.entries.length - this.config.maxEntries);
    }
  }

  private shouldRecord(category: string): boolean {
    return this.config.categories.length === 0 || this.config.categories.includes(category);
  }

  private calculateStats(entries: ProfileEntry[]): ProfileStats {
    const durations = entries
      .map((e) => e.durationMs)
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);

    const count = durations.length;
    const totalMs = durations.reduce((a, b) => a + b, 0);

    return {
      count,
      totalMs,
      avgMs: count > 0 ? totalMs / count : 0,
      minMs: durations[0] ?? 0,
      maxMs: durations[count - 1] ?? 0,
      p50Ms: this.percentile(durations, 50),
      p95Ms: this.percentile(durations, 95),
      p99Ms: this.percentile(durations, 99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  private nextId(): string {
    return `prof_${++this.idCounter}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a profiler.
 */
export function createProfiler(config?: ProfilerConfig): Profiler {
  return new Profiler(config);
}

/**
 * Create a disabled profiler (for production).
 */
export function createNoopProfiler(): Profiler {
  return new Profiler({ enabled: false });
}

/**
 * Global profiler instance.
 */
let globalProfiler: Profiler | null = null;

/**
 * Get or create the global profiler.
 */
export function getGlobalProfiler(): Profiler {
  if (!globalProfiler) {
    globalProfiler = createProfiler();
  }
  return globalProfiler;
}

/**
 * Set the global profiler.
 */
export function setGlobalProfiler(profiler: Profiler): void {
  globalProfiler = profiler;
}

/**
 * Profile decorator for methods.
 */
export function profileMethod(category: string) {
  return <T extends (...args: unknown[]) => unknown>(
    _target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> => {
    const original = descriptor.value;
    if (!original) {
      return descriptor;
    }

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      const profiler = getGlobalProfiler();
      const name = propertyKey;

      const result = original.apply(this, args);

      if (result instanceof Promise) {
        const id = profiler.startSpan(name, category);
        return result
          .then((value) => {
            profiler.endSpan(id);
            return value;
          })
          .catch((error) => {
            profiler.endSpan(id, { error: true });
            throw error;
          }) as ReturnType<T>;
      }

      return profiler.profile(name, category, () => result) as ReturnType<T>;
    } as T;

    return descriptor;
  };
}
