/**
 * ProxyImportManager
 *
 * Client-side implementation of ImportManager that delegates to the Web Worker.
 * Maintains the same public API as the original ImportManager.
 */

import { observability } from "@ku0/core";
import type { WorkerDbClient } from "../client";
import type { ImportSourceType } from "../driver/types";
import type { WorkerEvent } from "../worker/index";
import type { CreateImportJobInput, ImportManagerEvents, IngestorFn } from "./types";

const logger = observability.getLogger();

export class ProxyImportManager {
  private eventListeners: {
    [K in keyof ImportManagerEvents]-?: Set<NonNullable<ImportManagerEvents[K]>>;
  } = {
    onJobProgress: new Set(),
    onJobComplete: new Set(),
    onJobFailed: new Set(),
    onJobStatusChange: new Set(),
    onJobDeleted: new Set(),
  };

  constructor(private client: WorkerDbClient) {
    // Listen for events from the worker
    this.client.onEvent(this.handleWorkerEvent);
  }

  private handleWorkerEvent = (event: WorkerEvent) => {
    switch (event.type) {
      case "onJobProgress":
        this.emit("onJobProgress", event.jobId, event.progress);
        break;
      case "onJobStatusChange":
        this.emit("onJobStatusChange", event.jobId, event.status);
        break;
      case "onJobComplete":
        this.emit("onJobComplete", event.jobId, event.documentId);
        break;
      case "onJobFailed":
        this.emit("onJobFailed", event.jobId, new Error(event.error));
        break;
    }
  };

  /**
   * Subscribe to an event.
   */
  public on<K extends keyof ImportManagerEvents>(
    event: K,
    handler: NonNullable<ImportManagerEvents[K]>
  ): () => void {
    const set = this.eventListeners[event] as Set<NonNullable<ImportManagerEvents[K]>>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit<K extends keyof ImportManagerEvents>(
    event: K,
    ...args: Parameters<NonNullable<ImportManagerEvents[K]>>
  ): void {
    const set = this.eventListeners[event];
    for (const handler of set) {
      try {
        (handler as unknown as (...args: unknown[]) => void)(...args);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("ingest", "ProxyImportManager event handler error", error);
      }
    }
  }

  /**
   * Resume pending jobs.
   */
  async resume(): Promise<void> {
    await this.client.importResume();
  }

  /**
   * Shutdown manager.
   */
  shutdown(): void {
    // No-op for proxy, or could unsubscribe from client events if needed
  }

  /**
   * Enqueue a new import job.
   */
  async enqueue(input: CreateImportJobInput): Promise<string> {
    return this.client.importEnqueue(input);
  }

  /**
   * Cancel a job.
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.client.importCancel(jobId);
  }

  /**
   * Retry a failed job.
   */
  async retryJob(jobId: string): Promise<void> {
    await this.client.importRetry(jobId);
  }

  /**
   * List import jobs.
   */
  async listJobs(
    options?: import("../driver/types").ListImportJobsOptions
  ): Promise<import("../driver/types").ImportJobRow[]> {
    return this.client.listImportJobs(options);
  }

  /**
   * Cleanup old jobs (No-op for proxy, managed by worker).
   */
  async cleanupOldJobs(_maxAgeMs: number): Promise<void> {
    // No-op
  }

  /**
   * Delete a completed/failed/canceled job.
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      await this.client.deleteImportJob(jobId);
      this.emit("onJobDeleted", jobId);
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("ingest", "ProxyImportManager deleteJob failed", err, { jobId });
      return false;
    }
  }

  /**
   * Register ingestor (No-op on client side, as ingestors run in worker).
   */
  registerIngestor(_sourceType: ImportSourceType, _ingestor: IngestorFn): void {
    logger.warn(
      "ingest",
      "registerIngestor called on client; ingestors should be registered in the worker"
    );
  }
}
