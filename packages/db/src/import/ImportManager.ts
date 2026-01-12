/**
 * ImportManager
 *
 * Coordinates import jobs with queue management, concurrency control, and retry logic.
 */

import type { DbDriver, ImportJobRow, ImportJobStatus, ImportSourceType } from "../driver/types";
import { NormalizationService } from "./normalization";
import type { ContentResult } from "./normalization/types";
import type {
  CreateImportJobInput,
  ImportManagerConfig,
  ImportManagerEvents,
  IngestResult,
  IngestorFn,
} from "./types";

/** Generate a unique job ID */
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getRetryDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attempt;
}

function getErrorCode(err: Error): string | null {
  const maybeCode = (err as Error & { code?: unknown }).code;
  return typeof maybeCode === "string" && maybeCode.length > 0 ? maybeCode : null;
}

/**
 * ImportManager manages the lifecycle of import jobs.
 */
export class ImportManager {
  private queue: string[] = [];
  private activeJobs = new Set<string>();
  private cancelledJobs = new Set<string>();
  private ingestors = new Map<ImportSourceType, IngestorFn>();

  private readonly concurrency: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly retryCheckIntervalMs: number;

  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private isShutdown = false;

  /** Event listeners */
  private listeners: {
    [K in keyof ImportManagerEvents]-?: Set<NonNullable<ImportManagerEvents[K]>>;
  } = {
    onJobProgress: new Set(),
    onJobComplete: new Set(),
    onJobFailed: new Set(),
    onJobStatusChange: new Set(),
    onJobDeleted: new Set(),
  };

  /**
   * Subscribe to an event.
   * Returns unsubscribe function.
   */
  public on<K extends keyof ImportManagerEvents>(
    event: K,
    handler: NonNullable<ImportManagerEvents[K]>
  ): () => void {
    const set = this.listeners[event] as Set<NonNullable<ImportManagerEvents[K]>>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  /**
   * Remove all event listeners.
   * Call this before disposing the manager to prevent memory leaks.
   */
  public removeAllListeners(): void {
    this.listeners.onJobProgress.clear();
    this.listeners.onJobComplete.clear();
    this.listeners.onJobFailed.clear();
    this.listeners.onJobStatusChange.clear();
    this.listeners.onJobDeleted.clear();
  }

  private emit<K extends keyof ImportManagerEvents>(
    event: K,
    ...args: Parameters<NonNullable<ImportManagerEvents[K]>>
  ): void {
    const set = this.listeners[event];
    for (const handler of set) {
      try {
        (handler as unknown as (...args: unknown[]) => void)(...args);
      } catch (err) {
        console.error("[ImportManager] Event handler error:", err);
      }
    }
  }

  constructor(
    private db: DbDriver,
    config: ImportManagerConfig = {}
  ) {
    this.concurrency = config.concurrency ?? 2;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.retryCheckIntervalMs = config.retryCheckIntervalMs ?? 5000;
  }

  /**
   * Initialize manager and resume any pending jobs from DB.
   * Call this after construction to restore durable state.
   */
  async resume(): Promise<void> {
    // Find jobs that were in progress or queued
    const pendingJobs = await this.db.listImportJobs({ status: "queued" });
    const ingestingJobs = await this.db.listImportJobs({ status: "ingesting" });
    const normalizingJobs = await this.db.listImportJobs({ status: "normalizing" });
    const storingJobs = await this.db.listImportJobs({ status: "storing" });

    // Re-queue pending jobs (avoiding duplicates)
    for (const job of pendingJobs) {
      this.addToQueueIfNotPresent(job.jobId);
    }

    // Jobs that were mid-process need to be re-queued from the start
    for (const job of [...ingestingJobs, ...normalizingJobs, ...storingJobs]) {
      await this.db.updateImportJob(job.jobId, { status: "queued", progress: 0 });
      this.addToQueueIfNotPresent(job.jobId);
    }

    // Check for jobs pending retry
    await this.checkRetryJobs();

    // Start the retry scheduler
    this.startRetryScheduler();

    this.processQueue();
  }

  /**
   * Shutdown the manager - stop retry scheduler and cleanup.
   */
  shutdown(): void {
    this.isShutdown = true;
    this.stopRetryScheduler();
    this.removeAllListeners();
  }

  /**
   * Start periodic retry job checker.
   */
  private startRetryScheduler(): void {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = setInterval(() => {
      this.checkRetryJobs();
    }, this.retryCheckIntervalMs);
  }

  /**
   * Stop the retry scheduler.
   */
  private stopRetryScheduler(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Check for failed jobs that are ready to retry.
   */
  private async checkRetryJobs(): Promise<void> {
    const failedJobs = await this.db.listImportJobs({ status: "failed" });
    const now = Date.now();
    for (const job of failedJobs) {
      if (job.nextRetryAt && job.nextRetryAt <= now && job.attemptCount < this.maxRetries) {
        await this.db.updateImportJob(job.jobId, { status: "queued" });
        this.addToQueueIfNotPresent(job.jobId);
      }
    }
    this.processQueue();
  }

  /**
   * Add job to queue only if not already present.
   */
  private addToQueueIfNotPresent(jobId: string): void {
    if (!this.queue.includes(jobId) && !this.activeJobs.has(jobId)) {
      this.queue.push(jobId);
    }
  }

  /**
   * Register an ingestor for a source type.
   */
  registerIngestor(sourceType: ImportSourceType, ingestor: IngestorFn): void {
    this.ingestors.set(sourceType, ingestor);
  }

  /**
   * Enqueue a new import job.
   * Returns the job ID. If duplicate source exists with a completed document, returns existing job ID.
   * Set `forceReimport` to true to re-import even if a document already exists.
   */
  async enqueue(input: CreateImportJobInput & { forceReimport?: boolean }): Promise<string> {
    // Check for existing job with same source
    const existing = await this.db.getImportJobBySource(input.sourceType, input.sourceRef);
    if (existing) {
      // If already completed with a document, return existing job (deduplication)
      // unless forceReimport is explicitly requested
      if (existing.status === "done" && existing.resultDocumentId && !input.forceReimport) {
        return existing.jobId;
      }

      if (
        existing.status === "done" ||
        existing.status === "failed" ||
        existing.status === "canceled"
      ) {
        // Reset the job for retry
        await this.db.updateImportJob(existing.jobId, {
          status: "queued",
          progress: 0,
          errorCode: null,
          errorMessage: null,
        });
        this.addToQueueIfNotPresent(existing.jobId);
        this.processQueue();
        return existing.jobId;
      }
      // Job is in progress or queued - return existing
      return existing.jobId;
    }

    const jobId = generateJobId();
    await this.db.createImportJob({
      jobId,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      status: "queued",
      progress: null,
      errorCode: null,
      errorMessage: null,
      resultDocumentId: null,
      assetId: null,
      documentVersionId: null,
      dedupeHit: null,
      attemptCount: 0,
      nextRetryAt: null,
      parserVersion: input.parserVersion ?? null,
    });

    this.addToQueueIfNotPresent(jobId);
    this.processQueue();
    return jobId;
  }

  /**
   * Process jobs from queue respecting concurrency limit.
   */
  private async processQueue(): Promise<void> {
    if (this.isShutdown) {
      return;
    }
    while (this.queue.length > 0 && this.activeJobs.size < this.concurrency) {
      const jobId = this.queue.shift();
      if (!jobId) {
        break;
      }
      // Skip if job was cancelled while in queue
      if (this.cancelledJobs.has(jobId)) {
        this.cancelledJobs.delete(jobId);
        continue;
      }
      this.activeJobs.add(jobId);
      this.processJob(jobId).finally(() => {
        this.activeJobs.delete(jobId);
        this.cancelledJobs.delete(jobId);
        this.processQueue();
      });
    }
  }

  /**
   * Check if a job has been cancelled.
   */
  private isCancelled(jobId: string): boolean {
    return this.cancelledJobs.has(jobId);
  }

  /**
   * Process a single import job.
   */
  private async processJob(jobId: string): Promise<void> {
    // Check if already cancelled
    if (this.isCancelled(jobId)) {
      return;
    }

    const job = await this.db.getImportJob(jobId);
    if (!job) {
      return;
    }

    // Check if job was cancelled in DB
    if (job.status === "canceled") {
      return;
    }

    const ingestor = this.ingestors.get(job.sourceType);
    if (!ingestor) {
      await this.failJob(jobId, "UNSUPPORTED_SOURCE", `No ingestor for ${job.sourceType}`);
      return;
    }

    try {
      // Update status to ingesting
      await this.updateStatus(jobId, "ingesting");

      // Run ingestor with progress callback
      const onProgress = async (progress: number) => {
        // Check for cancellation during progress updates
        if (this.isCancelled(jobId)) {
          throw new Error("Job cancelled");
        }
        await this.db.updateImportJob(jobId, { progress });
        this.emit("onJobProgress", jobId, progress);
      };

      const result = await ingestor(job.sourceRef, onProgress);

      // Check for cancellation after ingest
      if (this.isCancelled(jobId)) {
        return;
      }

      // Update status to normalizing
      await this.updateStatus(jobId, "normalizing");

      // Store result
      const documentId = await this.storeResult(job, result);

      // Check for cancellation after store
      if (this.isCancelled(jobId)) {
        return;
      }

      // Update status to done
      await this.updateStatus(jobId, "storing");
      await this.db.updateImportJob(jobId, {
        status: "done",
        progress: 100,
        resultDocumentId: documentId,
      });
      this.emit("onJobComplete", jobId, documentId);
    } catch (err) {
      // Don't fail if cancelled
      if (this.isCancelled(jobId)) {
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      const errorCode = getErrorCode(error) ?? "INGEST_ERROR";
      await this.failJob(jobId, errorCode, error.message);
    }
  }

  /**
   * Update job status and emit event.
   */
  private async updateStatus(jobId: string, status: ImportJobStatus): Promise<void> {
    await this.db.updateImportJob(jobId, { status });
    this.emit("onJobStatusChange", jobId, status);
  }

  /**
   * Mark job as failed with optional retry scheduling.
   */
  private async failJob(jobId: string, errorCode: string, errorMessage: string): Promise<void> {
    const job = await this.db.getImportJob(jobId);
    const attemptCount = (job?.attemptCount ?? 0) + 1;

    if (attemptCount < this.maxRetries) {
      // Schedule retry with exponential backoff
      const nextRetryAt = Date.now() + getRetryDelay(attemptCount, this.retryDelayMs);
      await this.db.updateImportJob(jobId, {
        status: "failed",
        errorCode,
        errorMessage,
        attemptCount,
        nextRetryAt,
      });
    } else {
      // Max retries reached
      await this.db.updateImportJob(jobId, {
        status: "failed",
        errorCode,
        errorMessage,
        attemptCount,
        nextRetryAt: null,
      });
    }
    this.emit("onJobFailed", jobId, new Error(`${errorCode}: ${errorMessage}`));
  }

  /**
   * Store ingested content as a document.
   */
  private async storeResult(job: ImportJobRow, result: IngestResult): Promise<string> {
    const normalizer = new NormalizationService();
    const contentResult = normalizer.normalize(result);
    const docId = await deriveImportDocumentId(job, contentResult);

    await this.db.transaction(async (tx) => {
      // 1. Create document metadata
      await tx.upsertDocument({
        docId,
        title: contentResult.title,
        activePolicyId: null,
        headFrontier: null, // Initial frontier will be computed by client or sync
        savedAt: null,
      });

      // 2. Append CRDT update
      // We use a generated actor ID for the import process
      const actorId = `import_${job.jobId.slice(-8)}`;

      await tx.appendUpdate({
        docId,
        actorId,
        seq: 1, // Initial sequence number
        lamport: 1,
        update: contentResult.crdtUpdate,
        receivedAt: Date.now(),
        source: "local", // It is a local import
      });

      // 3. Store any annotations (optional - if ingestor provided them, though currently it doesn't)
    });

    return docId;
  }

  /**
   * Retry a failed or canceled job.
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.db.getImportJob(jobId);
    if (!job || (job.status !== "failed" && job.status !== "canceled")) {
      return;
    }

    await this.db.updateImportJob(jobId, { status: "queued", errorCode: null, errorMessage: null });
    this.addToQueueIfNotPresent(jobId);
    this.processQueue();
  }

  /**
   * Cancel a pending or active job.
   * Uses the proper "canceled" status instead of "failed".
   */
  async cancelJob(jobId: string): Promise<void> {
    // Remove from queue if present
    const idx = this.queue.indexOf(jobId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }

    // Mark as cancelled so active jobs will stop
    this.cancelledJobs.add(jobId);

    // Update DB with proper canceled status
    await this.db.updateImportJob(jobId, {
      status: "canceled",
      errorCode: "CANCELLED",
      errorMessage: "Job cancelled by user",
    });

    this.emit("onJobStatusChange", jobId, "canceled");
  }

  /**
   * Delete old completed/failed/canceled jobs from the database.
   * @param olderThanMs - Delete jobs older than this many milliseconds
   * @returns Number of jobs deleted
   */
  async cleanupOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const jobs = await this.db.listImportJobs();
    let deleted = 0;

    for (const job of jobs) {
      if (
        (job.status === "done" || job.status === "failed" || job.status === "canceled") &&
        job.updatedAt < cutoff
      ) {
        await this.db.deleteImportJob(job.jobId);
        this.emit("onJobDeleted", job.jobId);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get all jobs.
   */
  async listJobs(options?: { status?: ImportJobStatus; limit?: number }): Promise<ImportJobRow[]> {
    return this.db.listImportJobs(options);
  }

  /**
   * Get a single job by ID.
   */
  async getJob(jobId: string): Promise<ImportJobRow | null> {
    return this.db.getImportJob(jobId);
  }

  /**
   * Delete a single job by ID.
   * Only completed/failed/canceled jobs can be deleted.
   * Active jobs must be canceled first.
   */
  async deleteJob(jobId: string): Promise<boolean> {
    const job = await this.db.getImportJob(jobId);
    if (!job) {
      return false;
    }

    // Only allow deletion of terminal states
    if (job.status !== "done" && job.status !== "failed" && job.status !== "canceled") {
      // Cannot delete active jobs - must cancel first
      return false;
    }

    await this.db.deleteImportJob(jobId);
    this.emit("onJobDeleted", jobId);
    return true;
  }
}

/**
 * Generate a deterministic document ID based on source and normalized content.
 */
export async function deriveImportDocumentId(
  job: ImportJobRow,
  content: ContentResult
): Promise<string> {
  const payload = `${job.sourceType}:${job.sourceRef}|${content.title}|${content.textContent}`;
  const hash = await computeHash(payload);
  return `doc_${hash}`;
}

async function computeHash(value: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return fnv1a(value);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16);
}
