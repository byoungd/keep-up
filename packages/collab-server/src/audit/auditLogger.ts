/**
 * Collaboration Audit - Audit Logger
 *
 * Buffered async audit logger that writes events to an AuditStore.
 * Designed to not block message processing.
 */

import { randomUUID } from "node:crypto";
import type { AuditEvent, AuditEventInput, AuditStore } from "./auditTypes";

/** Configuration for the audit logger */
export type AuditLoggerConfig = {
  /** The store to write events to */
  store: AuditStore;
  /** Flush interval in milliseconds (default: 5000) */
  flushIntervalMs?: number;
  /** Maximum buffer size before auto-flush (default: 100) */
  batchSize?: number;
};

/**
 * Buffered audit logger.
 *
 * Features:
 * - Async writes to avoid blocking message processing
 * - Batched writes for efficiency
 * - Auto-flush on buffer size threshold
 * - Periodic flush timer
 * - Graceful error handling (log and continue)
 */
export class AuditLogger {
  private config: Required<AuditLoggerConfig>;
  private buffer: AuditEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private isStopped = false;

  constructor(config: AuditLoggerConfig) {
    this.config = {
      store: config.store,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      batchSize: config.batchSize ?? 100,
    };
    this.startFlushTimer();
  }

  /**
   * Log an audit event.
   *
   * Auto-generates eventId and ts fields.
   * Events are buffered and flushed asynchronously.
   */
  log(input: AuditEventInput): void {
    if (this.isStopped) {
      console.warn("[AuditLogger] Attempted to log after stop");
      return;
    }

    const event: AuditEvent = {
      ...input,
      eventId: randomUUID(),
      ts: Date.now(),
    };

    this.buffer.push(event);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  /**
   * Flush buffered events to the store.
   *
   * Safe to call multiple times - concurrent flushes are prevented.
   */
  async flush(): Promise<void> {
    // Prevent concurrent flushes
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;

    // Take current buffer and clear it
    const events = this.buffer;
    this.buffer = [];

    try {
      await this.config.store.append(events);
    } catch (error) {
      // Log error but don't throw - audit failures shouldn't block collaboration
      console.error("[AuditLogger] Failed to write events:", error);
      // Optionally: could re-add events to buffer for retry
      // For now, we accept potential event loss on persistent failures
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the logger and flush remaining events.
   *
   * Should be called during server shutdown.
   */
  async stop(): Promise<void> {
    this.isStopped = true;

    // Stop the flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();
  }

  /**
   * Get the number of buffered events.
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Check if the logger is stopped.
   */
  isRunning(): boolean {
    return !this.isStopped;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);

    // Don't keep the process alive just for the flush timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}
