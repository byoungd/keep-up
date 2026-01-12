/**
 * Request Queue
 *
 * Manages concurrent AI requests with:
 * - Concurrency limits per provider
 * - Priority queuing
 * - Backpressure handling
 * - Request deduplication
 * - Timeout management
 */

/** Request priority levels */
export type RequestPriority = "critical" | "high" | "normal" | "low";

/** Priority weights for ordering */
const PRIORITY_WEIGHTS: Record<RequestPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

/** Queued request */
interface QueuedRequest<T> {
  id: string;
  priority: RequestPriority;
  timestamp: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeoutMs: number;
  timeoutId?: ReturnType<typeof setTimeout>;
  dedupKey?: string;
}

/** Queue configuration */
export interface RequestQueueConfig {
  /** Maximum concurrent requests (default: 10) */
  maxConcurrent: number;
  /** Maximum queue size (default: 100) */
  maxQueueSize: number;
  /** Default timeout in ms (default: 30000) */
  defaultTimeoutMs: number;
  /** Enable request deduplication (default: true) */
  enableDedup: boolean;
  /** Dedup window in ms (default: 1000) */
  dedupWindowMs: number;
}

/** Queue statistics */
export interface QueueStats {
  /** Current queue length */
  queueLength: number;
  /** Active requests */
  activeRequests: number;
  /** Total processed */
  totalProcessed: number;
  /** Total rejected (queue full) */
  totalRejected: number;
  /** Total timeouts */
  totalTimeouts: number;
  /** Total deduped */
  totalDeduped: number;
  /** Average wait time in ms */
  avgWaitTimeMs: number;
}

/**
 * Request Queue with priority and concurrency control.
 */
export class RequestQueue {
  private readonly config: RequestQueueConfig;
  private readonly queue: QueuedRequest<unknown>[] = [];
  private activeCount = 0;
  private readonly recentRequests = new Map<
    string,
    { result: Promise<unknown>; timestamp: number }
  >();

  // Stats
  private totalProcessed = 0;
  private totalRejected = 0;
  private totalTimeouts = 0;
  private totalDeduped = 0;
  private totalWaitTime = 0;

  constructor(config: Partial<RequestQueueConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 10,
      maxQueueSize: config.maxQueueSize ?? 100,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
      enableDedup: config.enableDedup ?? true,
      dedupWindowMs: config.dedupWindowMs ?? 1000,
    };
  }

  /**
   * Enqueue a request for execution.
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    options: {
      priority?: RequestPriority;
      timeoutMs?: number;
      dedupKey?: string;
    } = {}
  ): Promise<T> {
    const { priority = "normal", timeoutMs = this.config.defaultTimeoutMs, dedupKey } = options;

    // Check for dedup
    if (this.config.enableDedup && dedupKey) {
      const existing = this.recentRequests.get(dedupKey);
      if (existing && Date.now() - existing.timestamp < this.config.dedupWindowMs) {
        this.totalDeduped++;
        return existing.result as Promise<T>;
      }
    }

    // Check queue capacity
    if (this.queue.length >= this.config.maxQueueSize) {
      this.totalRejected++;
      throw new QueueFullError(
        `Request queue is full (${this.queue.length}/${this.config.maxQueueSize})`
      );
    }

    // Create queued request
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    const promise = new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id,
        priority,
        timestamp,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutMs,
        dedupKey,
      };

      // Set timeout
      request.timeoutId = setTimeout(() => {
        this.handleTimeout(request as unknown as QueuedRequest<unknown>);
      }, timeoutMs);

      // Add to queue in priority order
      this.insertByPriority(request as unknown as QueuedRequest<unknown>);
    });

    // Store for dedup
    if (this.config.enableDedup && dedupKey) {
      this.recentRequests.set(dedupKey, { result: promise, timestamp });

      // Cleanup old dedup entries
      setTimeout(() => {
        const entry = this.recentRequests.get(dedupKey);
        if (entry && Date.now() - entry.timestamp >= this.config.dedupWindowMs) {
          this.recentRequests.delete(dedupKey);
        }
      }, this.config.dedupWindowMs + 100);
    }

    // Try to process immediately
    this.processNext();

    return promise;
  }

  /**
   * Insert request in priority order.
   */
  private insertByPriority(request: QueuedRequest<unknown>): void {
    const score = this.calculateScore(request);

    // Find insertion point (higher score = earlier in queue)
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (score > this.calculateScore(this.queue[i])) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, request);
  }

  /**
   * Calculate priority score (higher = more urgent).
   */
  private calculateScore(request: QueuedRequest<unknown>): number {
    const priorityScore = PRIORITY_WEIGHTS[request.priority];
    // Add time factor (older requests get slight boost to prevent starvation)
    const ageBonus = Math.min((Date.now() - request.timestamp) / 1000, 10);
    return priorityScore + ageBonus;
  }

  /**
   * Process next request if capacity allows.
   */
  private processNext(): void {
    if (this.paused) {
      return;
    }
    while (this.activeCount < this.config.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      this.activeCount++;
      const waitTime = Date.now() - request.timestamp;
      this.totalWaitTime += waitTime;

      this.executeRequest(request);
    }
  }

  /**
   * Execute a request.
   */
  private async executeRequest(request: QueuedRequest<unknown>): Promise<void> {
    try {
      const result = await request.execute();

      // Clear timeout
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      this.totalProcessed++;
      request.resolve(result);
    } catch (error) {
      // Clear timeout
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  /**
   * Handle request timeout.
   */
  private handleTimeout(request: QueuedRequest<unknown>): void {
    // Remove from queue if still queued
    const index = this.queue.findIndex((r) => r.id === request.id);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }

    this.totalTimeouts++;
    request.reject(new RequestTimeoutError(`Request timed out after ${request.timeoutMs}ms`));
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeCount,
      totalProcessed: this.totalProcessed,
      totalRejected: this.totalRejected,
      totalTimeouts: this.totalTimeouts,
      totalDeduped: this.totalDeduped,
      avgWaitTimeMs: this.totalProcessed > 0 ? this.totalWaitTime / this.totalProcessed : 0,
    };
  }

  /**
   * Check if queue has capacity.
   */
  hasCapacity(): boolean {
    return this.queue.length < this.config.maxQueueSize;
  }

  /**
   * Get current queue length.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue (rejects all pending requests).
   */
  clear(): void {
    for (const request of this.queue) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error("Queue cleared"));
    }
    this.queue.length = 0;
  }

  /**
   * Pause processing (requests still queue but don't execute).
   */
  private paused = false;

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.processNext();
  }

  isPaused(): boolean {
    return this.paused;
  }
}

/**
 * Error thrown when queue is full.
 */
export class QueueFullError extends Error {
  readonly name = "QueueFullError";
  readonly retryable = true;
}

/**
 * Error thrown when request times out.
 */
export class RequestTimeoutError extends Error {
  readonly name = "RequestTimeoutError";
  readonly retryable = true;
}

/**
 * Create a request queue with default configuration.
 */
export function createRequestQueue(config: Partial<RequestQueueConfig> = {}): RequestQueue {
  return new RequestQueue(config);
}
