/**
 * Batch Processing Utilities
 *
 * Utilities for processing multiple tool calls efficiently.
 * Supports batching, debouncing, and parallel execution with limits.
 */

import type { MCPToolCall, MCPToolResult, ToolContext } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Batch processor configuration.
 */
export interface BatchConfig {
  /** Maximum batch size */
  maxSize: number;
  /** Maximum wait time before flushing (ms) */
  maxWaitMs: number;
  /** Maximum concurrent batches */
  concurrency?: number;
}

/**
 * Batch result with individual results.
 */
export interface BatchResult<T> {
  /** Results in order */
  results: T[];
  /** Number of items processed */
  processed: number;
  /** Number of failed items */
  failed: number;
  /** Total duration in ms */
  durationMs: number;
}

/**
 * Debounce configuration.
 */
export interface DebounceConfig {
  /** Delay before execution (ms) */
  delayMs: number;
  /** Maximum wait time (ms) */
  maxWaitMs?: number;
  /** Whether to call on leading edge */
  leading?: boolean;
}

// ============================================================================
// Batch Processor
// ============================================================================

/**
 * Batches tool calls for efficient processing.
 */
export class BatchProcessor<T, R> {
  private batch: T[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private flushRequested = false;
  private pendingResolvers: Array<{
    index: number;
    resolve: (result: R) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(
    private readonly config: BatchConfig,
    private readonly processor: (batch: T[]) => Promise<R[]>
  ) {}

  /**
   * Add item to batch.
   */
  add(item: T): Promise<R> {
    this.batch.push(item);
    const index = this.batch.length - 1;

    // Start timer if not already running
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.maxWaitMs);
    }

    const promise = new Promise<R>((resolve, reject) => {
      this.pendingResolvers.push({ index, resolve, reject });
    });

    // Flush if batch is full
    if (this.batch.length >= this.config.maxSize) {
      void this.flush();
    }

    return promise;
  }

  /**
   * Add multiple items to batch.
   */
  addMany(items: T[]): Promise<R[]> {
    return Promise.all(items.map((item) => this.add(item)));
  }

  /**
   * Flush the current batch.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.processing) {
      this.flushRequested = true;
      return;
    }

    if (this.batch.length === 0) {
      return;
    }

    this.processing = true;
    const currentBatch = this.batch;
    const currentResolvers = this.pendingResolvers;
    this.batch = [];
    this.pendingResolvers = [];

    try {
      const results = await this.processor(currentBatch);

      // Resolve pending promises
      for (const resolver of currentResolvers) {
        resolver.resolve(results[resolver.index]);
      }
    } catch (error) {
      for (const resolver of currentResolvers) {
        resolver.reject(error as Error);
      }
    } finally {
      this.processing = false;
      this.scheduleNextFlush();
    }
  }

  private scheduleNextFlush(): void {
    if (this.batch.length === 0) {
      this.flushRequested = false;
      return;
    }

    if (this.batch.length >= this.config.maxSize || this.flushRequested) {
      this.flushRequested = false;
      void this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.maxWaitMs);
    }
  }

  /**
   * Get current batch size.
   */
  get size(): number {
    return this.batch.length;
  }
}

// ============================================================================
// Debounce
// ============================================================================

/**
 * Debounce function calls.
 */
export function debounce<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  config: DebounceConfig
): (...args: TArgs) => Promise<TResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let pending: {
    args: TArgs;
    resolve: (value: TResult) => void;
    reject: (error: Error) => void;
  } | null = null;
  let lastCallTime = 0;

  const execute = async (): Promise<void> => {
    if (!pending) {
      return;
    }

    const { args, resolve, reject } = pending;
    pending = null;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }

    try {
      const result = await fn(...args);
      resolve(result);
    } catch (error) {
      reject(error as Error);
    }
  };

  return (...args: TArgs): Promise<TResult> => {
    const now = Date.now();

    return new Promise((resolve, reject) => {
      // Leading edge call
      if (config.leading && now - lastCallTime > config.delayMs) {
        lastCallTime = now;
        Promise.resolve(fn(...args))
          .then(resolve)
          .catch(reject);
        return;
      }

      // Cancel previous pending
      if (pending) {
        pending.reject(new Error("Debounced"));
      }

      pending = { args, resolve, reject };
      lastCallTime = now;

      // Set delay timer
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(execute, config.delayMs);

      // Set max wait timer
      if (config.maxWaitMs && !maxTimer) {
        maxTimer = setTimeout(execute, config.maxWaitMs);
      }
    });
  };
}

/**
 * Throttle function calls.
 */
export function throttle<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
  intervalMs: number
): (...args: TArgs) => Promise<TResult> {
  let lastCallTime = 0;
  let pending: Promise<TResult> | null = null;

  return async (...args: TArgs): Promise<TResult> => {
    const now = Date.now();
    const elapsed = now - lastCallTime;

    if (elapsed >= intervalMs) {
      lastCallTime = now;
      return fn(...args);
    }

    // Wait for remaining time
    if (!pending) {
      pending = new Promise((resolve, reject) => {
        setTimeout(async () => {
          lastCallTime = Date.now();
          pending = null;
          try {
            resolve(await fn(...args));
          } catch (error) {
            reject(error);
          }
        }, intervalMs - elapsed);
      });
    }

    return pending;
  };
}

// ============================================================================
// Parallel Batch Processing
// ============================================================================

/**
 * Process items in parallel with concurrency limit.
 */
export async function parallelBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency = 5
): Promise<BatchResult<R>> {
  const startTime = performance.now();
  const results: R[] = new Array(items.length);
  let failed = 0;
  let index = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        results[currentIndex] = await processor(items[currentIndex], currentIndex);
      } catch {
        failed++;
        results[currentIndex] = undefined as unknown as R;
      }
    }
  });

  await Promise.all(workers);

  return {
    results,
    processed: items.length,
    failed,
    durationMs: performance.now() - startTime,
  };
}

/**
 * Process tool calls in parallel batches.
 */
export async function batchToolCalls(
  calls: MCPToolCall[],
  executor: (call: MCPToolCall, context: ToolContext) => Promise<MCPToolResult>,
  context: ToolContext,
  concurrency = 3
): Promise<BatchResult<MCPToolResult>> {
  return parallelBatch(calls, (call) => executor(call, context), concurrency);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a batch processor.
 */
export function createBatchProcessor<T, R>(
  config: BatchConfig,
  processor: (batch: T[]) => Promise<R[]>
): BatchProcessor<T, R> {
  return new BatchProcessor(config, processor);
}

/**
 * Create a debounced tool executor.
 */
export function createDebouncedExecutor(
  executor: (call: MCPToolCall, context: ToolContext) => Promise<MCPToolResult>,
  delayMs: number
): (call: MCPToolCall, context: ToolContext) => Promise<MCPToolResult> {
  const debounced = debounce(
    (params: { call: MCPToolCall; context: ToolContext }) => executor(params.call, params.context),
    { delayMs }
  );

  return (call, context) => debounced({ call, context });
}
