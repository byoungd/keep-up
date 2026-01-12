/**
 * Request Batching
 *
 * Batches multiple requests into single API calls for efficiency.
 * Implements:
 * - Automatic batching with configurable window
 * - Batch size limits
 * - Error propagation to individual requests
 * - Batch key partitioning
 */

/** Batch configuration */
export interface BatchConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  /** Maximum wait time before flushing in ms */
  maxWaitMs: number;
  /** Whether to deduplicate identical requests */
  deduplicate: boolean;
}

/** Pending request */
interface PendingRequest<I, O> {
  input: I;
  resolve: (value: O) => void;
  reject: (error: Error) => void;
  key?: string;
}

const DEFAULT_CONFIG: BatchConfig = {
  maxBatchSize: 50,
  maxWaitMs: 10,
  deduplicate: true,
};

/**
 * Request Batcher
 *
 * Automatically batches requests and executes them together.
 */
export class RequestBatcher<I, O> {
  private readonly config: BatchConfig;
  private readonly batchFn: (inputs: I[]) => Promise<O[]>;
  private readonly keyFn?: (input: I) => string;

  private pending: Array<PendingRequest<I, O>> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  // Statistics
  private totalRequests = 0;
  private totalBatches = 0;
  private totalBatchedItems = 0;

  constructor(
    batchFn: (inputs: I[]) => Promise<O[]>,
    config: Partial<BatchConfig> = {},
    keyFn?: (input: I) => string
  ) {
    this.batchFn = batchFn;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyFn = keyFn;
  }

  /**
   * Add a request to the batch.
   */
  async add(input: I): Promise<O> {
    this.totalRequests++;

    return new Promise<O>((resolve, reject) => {
      const key = this.keyFn ? this.keyFn(input) : undefined;

      // Check for duplicate if deduplication is enabled
      if (this.config.deduplicate && key) {
        const existing = this.pending.find((p) => p.key === key);
        if (existing) {
          // Piggyback on existing request
          const originalResolve = existing.resolve;
          const originalReject = existing.reject;

          existing.resolve = (value: O) => {
            originalResolve(value);
            resolve(value);
          };
          existing.reject = (error: Error) => {
            originalReject(error);
            reject(error);
          };
          return;
        }
      }

      this.pending.push({ input, resolve, reject, key });

      // Schedule flush
      this.scheduleFlush();

      // Flush immediately if batch is full
      if (this.pending.length >= this.config.maxBatchSize) {
        this.flush();
      }
    });
  }

  /**
   * Schedule a flush.
   */
  private scheduleFlush(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.config.maxWaitMs);
  }

  /**
   * Flush pending requests.
   */
  private async flush(): Promise<void> {
    if (this.pending.length === 0 || this.processing) {
      return;
    }

    this.clearTimer();

    // Take current batch
    const batch = this.pending.splice(0, this.config.maxBatchSize);
    this.startBatch(batch.length);

    try {
      // Execute batch
      const inputs = batch.map((p) => p.input);
      const results = await this.batchFn(inputs);
      this.resolveBatch(batch, results);
    } catch (error) {
      this.rejectBatch(batch, error);
    } finally {
      this.processing = false;

      // Process remaining requests
      if (this.pending.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Force flush all pending requests.
   */
  async forceFlush(): Promise<void> {
    while (this.pending.length > 0) {
      await this.flush();
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private startBatch(batchSize: number): void {
    this.processing = true;
    this.totalBatches++;
    this.totalBatchedItems += batchSize;
  }

  private resolveBatch(batch: Array<PendingRequest<I, O>>, results: O[]): void {
    if (results.length !== batch.length) {
      const error = new Error(
        `Batch function returned ${results.length} results for ${batch.length} inputs`
      );
      this.rejectBatch(batch, error);
      return;
    }

    for (let i = 0; i < batch.length; i++) {
      batch[i].resolve(results[i]);
    }
  }

  private rejectBatch(batch: Array<PendingRequest<I, O>>, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    for (const request of batch) {
      request.reject(err);
    }
  }

  /**
   * Get statistics.
   */
  getStats(): {
    totalRequests: number;
    totalBatches: number;
    averageBatchSize: number;
    pendingRequests: number;
  } {
    return {
      totalRequests: this.totalRequests,
      totalBatches: this.totalBatches,
      averageBatchSize: this.totalBatches > 0 ? this.totalBatchedItems / this.totalBatches : 0,
      pendingRequests: this.pending.length,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.totalRequests = 0;
    this.totalBatches = 0;
    this.totalBatchedItems = 0;
  }
}

/**
 * Create a batched function.
 */
export function batchify<I, O>(
  batchFn: (inputs: I[]) => Promise<O[]>,
  config: Partial<BatchConfig> = {},
  keyFn?: (input: I) => string
): (input: I) => Promise<O> {
  const batcher = new RequestBatcher(batchFn, config, keyFn);
  return (input: I) => batcher.add(input);
}

/**
 * Batch multiple calls and execute together.
 */
export async function batch<I, O>(
  inputs: I[],
  batchFn: (inputs: I[]) => Promise<O[]>,
  maxBatchSize = 50
): Promise<O[]> {
  if (inputs.length === 0) {
    return [];
  }

  const results: O[] = [];

  for (let i = 0; i < inputs.length; i += maxBatchSize) {
    const chunk = inputs.slice(i, i + maxBatchSize);
    const chunkResults = await batchFn(chunk);
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Parallel batch execution with concurrency limit.
 */
export async function parallelBatch<I, O>(
  inputs: I[],
  batchFn: (inputs: I[]) => Promise<O[]>,
  options: {
    maxBatchSize?: number;
    maxConcurrency?: number;
  } = {}
): Promise<O[]> {
  const { maxBatchSize = 50, maxConcurrency = 3 } = options;

  if (inputs.length === 0) {
    return [];
  }

  // Split into batches
  const batches: I[][] = [];
  for (let i = 0; i < inputs.length; i += maxBatchSize) {
    batches.push(inputs.slice(i, i + maxBatchSize));
  }

  // Process with concurrency limit
  const results: O[][] = [];
  let index = 0;

  const processNext = async (): Promise<void> => {
    while (index < batches.length) {
      const currentIndex = index++;
      const batchInputs = batches[currentIndex];
      const batchResults = await batchFn(batchInputs);
      results[currentIndex] = batchResults;
    }
  };

  // Start concurrent workers
  const workers = Array.from({ length: Math.min(maxConcurrency, batches.length) }, () =>
    processNext()
  );

  await Promise.all(workers);

  // Flatten results in order
  return results.flat();
}
