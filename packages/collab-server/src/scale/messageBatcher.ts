/**
 * Message Batcher
 *
 * Batches outgoing CRDT_UPDATE messages to reduce network overhead.
 * Configurable batch window and size limits.
 */

import type { CollabMessage } from "../collabRelay";

/** Batch metrics */
export interface BatchMetrics {
  /** Total batches sent */
  batchCount: number;
  /** Total messages batched */
  messageCount: number;
  /** Total bytes batched */
  totalBytes: number;
  /** Average batch size */
  avgBatchSize: number;
  /** Average batch latency (ms) */
  avgBatchLatencyMs: number;
}

/** Message batcher configuration */
export interface MessageBatcherConfig {
  /** Batch window in milliseconds (default: 20ms) */
  batchWindowMs: number;
  /** Maximum messages per batch (default: 50) */
  maxBatchSize: number;
  /** Maximum bytes per batch (default: 64KB) */
  maxBatchBytes: number;
}

/** Pending batch for a document */
interface PendingBatch {
  messages: CollabMessage[];
  totalBytes: number;
  startTime: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Batched message for delivery */
export interface BatchedMessage {
  type: "BATCH";
  docId: string;
  messages: CollabMessage[];
  batchId: string;
  ts: number;
}

const DEFAULT_CONFIG: MessageBatcherConfig = {
  batchWindowMs: 20,
  maxBatchSize: 50,
  maxBatchBytes: 64 * 1024, // 64KB
};

/**
 * Message batcher for reducing network overhead.
 */
export class MessageBatcher {
  private config: MessageBatcherConfig;
  private batches = new Map<string, PendingBatch>();
  private metrics: BatchMetrics = {
    batchCount: 0,
    messageCount: 0,
    totalBytes: 0,
    avgBatchSize: 0,
    avgBatchLatencyMs: 0,
  };
  private totalLatencyMs = 0;

  /** Callback for delivering batched messages */
  private onBatchReady: (docId: string, batch: BatchedMessage) => void;

  constructor(
    onBatchReady: (docId: string, batch: BatchedMessage) => void,
    config: Partial<MessageBatcherConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onBatchReady = onBatchReady;
  }

  /**
   * Queue a message for batching.
   */
  queue(docId: string, message: CollabMessage): void {
    const messageBytes = this.estimateMessageBytes(message);

    let batch = this.batches.get(docId);
    if (!batch) {
      batch = {
        messages: [],
        totalBytes: 0,
        startTime: Date.now(),
        timer: null,
      };
      this.batches.set(docId, batch);
    }

    // Check if adding this message would exceed limits
    if (
      batch.messages.length >= this.config.maxBatchSize ||
      batch.totalBytes + messageBytes > this.config.maxBatchBytes
    ) {
      // Flush current batch first
      this.flushBatch(docId);
      // Create new batch
      batch = {
        messages: [],
        totalBytes: 0,
        startTime: Date.now(),
        timer: null,
      };
      this.batches.set(docId, batch);
    }

    // Add message to batch
    batch.messages.push(message);
    batch.totalBytes += messageBytes;

    // Start timer if not already running
    if (!batch.timer) {
      batch.timer = setTimeout(() => {
        this.flushBatch(docId);
      }, this.config.batchWindowMs);
    }
  }

  /**
   * Flush a specific document's batch immediately.
   */
  flushBatch(docId: string): void {
    const batch = this.batches.get(docId);
    if (!batch || batch.messages.length === 0) {
      return;
    }

    // Clear timer
    if (batch.timer) {
      clearTimeout(batch.timer);
    }

    // Calculate latency
    const latencyMs = Date.now() - batch.startTime;

    // Create batched message
    const batchedMessage: BatchedMessage = {
      type: "BATCH",
      docId,
      messages: batch.messages,
      batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
    };

    // Update metrics
    this.metrics.batchCount++;
    this.metrics.messageCount += batch.messages.length;
    this.metrics.totalBytes += batch.totalBytes;
    this.totalLatencyMs += latencyMs;
    this.metrics.avgBatchSize = this.metrics.messageCount / this.metrics.batchCount;
    this.metrics.avgBatchLatencyMs = this.totalLatencyMs / this.metrics.batchCount;

    // Remove batch
    this.batches.delete(docId);

    // Deliver batch
    this.onBatchReady(docId, batchedMessage);
  }

  /**
   * Flush all pending batches.
   */
  flush(): void {
    for (const docId of this.batches.keys()) {
      this.flushBatch(docId);
    }
  }

  /**
   * Get batch metrics.
   */
  getMetrics(): BatchMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      batchCount: 0,
      messageCount: 0,
      totalBytes: 0,
      avgBatchSize: 0,
      avgBatchLatencyMs: 0,
    };
    this.totalLatencyMs = 0;
  }

  /**
   * Get pending batch count.
   */
  getPendingBatchCount(): number {
    return this.batches.size;
  }

  /**
   * Clear all pending batches without delivering.
   */
  clear(): void {
    for (const batch of this.batches.values()) {
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
    }
    this.batches.clear();
  }

  /**
   * Estimate message size in bytes.
   */
  private estimateMessageBytes(message: CollabMessage): number {
    // Estimate based on JSON serialization
    const base = JSON.stringify(message).length;
    // Add overhead for batching
    return base + 50;
  }
}
