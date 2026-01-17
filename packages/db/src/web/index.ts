/**
 * Web Database Adapter
 *
 * A production-ready IndexedDB-based storage layer for browser environments.
 * Uses Dexie.js under the hood with proper caching, batching, and reactive updates.
 *
 * Features:
 * - Automatic connection management
 * - Write batching for performance
 * - In-memory LRU cache for hot documents
 * - Reactive subscriptions via EventEmitter
 * - Graceful degradation when IndexedDB is unavailable
 */

import { observability } from "@ku0/core";
import { createIndexedDbDriver, type IndexedDbDriver } from "../driver/idb-dexie";
import type {
  AnnotationRow,
  CrdtUpdateRow,
  DbDriver,
  DbHealthInfo,
  DbInitResult,
  DocumentRow,
  ImportJobRow,
  ListAnnotationsOptions,
  ListDocumentsOptions,
  ListTopicsOptions,
  ListUpdatesOptions,
  OutboxRow,
  TopicRow,
} from "../driver/types";

const logger = observability.getLogger();

// ===========================================================================
// Types
// ===========================================================================

export interface ReaderDbConfig {
  /** Enable write batching for improved performance (default: true) */
  enableBatching?: boolean;
  /** Maximum batch size before auto-flush (default: 50) */
  maxBatchSize?: number;
  /** Batch flush interval in ms (default: 100) */
  batchFlushInterval?: number;
  /** Enable in-memory cache (default: true) */
  enableCache?: boolean;
  /** Maximum number of documents to cache (default: 100) */
  maxCacheSize?: number;
  /** Cache TTL in ms (default: 5 minutes) */
  cacheTtl?: number;
}

export interface ReaderDbStatus {
  initialized: boolean;
  driver: "idb-dexie" | "unavailable";
  schemaVersion: number;
  documentCount: number;
  cacheHitRate: number;
  pendingWrites: number;
}

export type DbEventType =
  | "document:created"
  | "document:updated"
  | "document:deleted"
  | "annotation:changed"
  | "topic:changed"
  | "sync:pending"
  | "sync:complete";

export interface DbEvent {
  type: DbEventType;
  payload: unknown;
  timestamp: number;
}

export type DbEventHandler = (event: DbEvent) => void;

// ===========================================================================
// LRU Cache
// ===========================================================================

class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  constructor(
    private maxSize: number,
    private ttl: number
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      } else {
        break;
      }
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }
}

// ===========================================================================
// Write Batcher
// ===========================================================================

interface BatchedWrite {
  type: "document" | "update" | "annotation" | "outbox";
  operation: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

class WriteBatcher {
  private queue: BatchedWrite[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(
    private maxSize: number,
    private flushInterval: number,
    private driver: IndexedDbDriver
  ) {}

  async enqueue(type: BatchedWrite["type"], operation: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ type, operation, resolve, reject });

      if (this.queue.length >= this.maxSize) {
        this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
      }
    });
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.flushing || this.queue.length === 0) {
      return;
    }

    this.flushing = true;
    const batch = this.queue.splice(0, this.maxSize);

    try {
      // Execute all operations in a transaction for atomicity
      await this.driver.batch(batch.map((b) => b.operation));
      for (const item of batch) {
        item.resolve();
      }
    } catch (error) {
      for (const item of batch) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.flushing = false;

      // Continue flushing if there are more items
      if (this.queue.length > 0) {
        this.flush();
      }
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
  }
}

// ===========================================================================
// Event Emitter
// ===========================================================================

class EventEmitter {
  private handlers = new Map<DbEventType, Set<DbEventHandler>>();

  on(type: DbEventType, handler: DbEventHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)?.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  emit(type: DbEventType, payload: unknown): void {
    const event: DbEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    for (const handler of this.handlers.get(type) ?? []) {
      try {
        handler(event);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("persistence", "ReaderDb event handler error", err, { type });
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// ===========================================================================
// Main ReaderDb Class
// ===========================================================================

/**
 * Web-optimized database adapter for the Reader app.
 *
 * @example
 * ```typescript
 * const db = createDb();
 * await db.initialize();
 *
 * // Create a document
 * await db.upsertDocument({
 *   docId: 'doc-1',
 *   title: 'My Document',
 * });
 *
 * // Subscribe to changes
 * db.on('document:updated', (event) => {
 *   console.log('Document updated:', event.payload);
 * });
 *
 * // Check status
 * const status = await db.getStatus();
 * console.log('Cache hit rate:', status.cacheHitRate);
 * ```
 */
export class ReaderDb {
  private driver: IndexedDbDriver | null = null;
  private initialized = false;
  private schemaVersion = 0;
  private config: Required<ReaderDbConfig>;
  private cache: LRUCache<string, DocumentRow> | null = null;
  private batcher: WriteBatcher | null = null;
  private emitter = new EventEmitter();

  constructor(config: ReaderDbConfig = {}) {
    this.config = {
      enableBatching: config.enableBatching ?? true,
      maxBatchSize: config.maxBatchSize ?? 50,
      batchFlushInterval: config.batchFlushInterval ?? 100,
      enableCache: config.enableCache ?? true,
      maxCacheSize: config.maxCacheSize ?? 100,
      cacheTtl: config.cacheTtl ?? 5 * 60 * 1000, // 5 minutes
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the database connection.
   * Must be called before any other operations.
   */
  async initialize(): Promise<DbInitResult> {
    if (this.initialized) {
      return {
        driver: "idb-dexie",
        schemaVersion: this.schemaVersion,
        initTimeMs: 0,
      };
    }

    const _start = performance.now();

    try {
      this.driver = createIndexedDbDriver();
      const result = await this.driver.init();
      this.schemaVersion = result.schemaVersion;

      // Initialize cache
      if (this.config.enableCache) {
        this.cache = new LRUCache(this.config.maxCacheSize, this.config.cacheTtl);
      }

      // Initialize batcher
      if (this.config.enableBatching) {
        this.batcher = new WriteBatcher(
          this.config.maxBatchSize,
          this.config.batchFlushInterval,
          this.driver
        );
      }

      this.initialized = true;
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("persistence", "ReaderDb initialization failed", err);
      throw error;
    }
  }

  /**
   * Close the database connection and clean up resources.
   */
  async close(): Promise<void> {
    if (this.batcher) {
      await this.batcher.flush();
      this.batcher.destroy();
      this.batcher = null;
    }

    this.cache?.clear();
    this.cache = null;

    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }

    this.emitter.clear();
    this.initialized = false;
  }

  /**
   * Get current database status.
   */
  async getStatus(): Promise<ReaderDbStatus> {
    const health = this.driver
      ? await this.driver.healthCheck()
      : { driver: "idb-dexie" as const, schemaVersion: 0 };

    const docs = this.driver ? await this.driver.listDocuments({ limit: 1 }) : [];

    return {
      initialized: this.initialized,
      driver: this.initialized ? "idb-dexie" : "unavailable",
      schemaVersion: health.schemaVersion,
      documentCount: docs.length > 0 ? -1 : 0, // Would need COUNT query
      cacheHitRate: this.cache?.getHitRate() ?? 0,
      pendingWrites: this.batcher?.pendingCount ?? 0,
    };
  }

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  /**
   * Subscribe to database events.
   * @returns Unsubscribe function
   */
  on(type: DbEventType, handler: DbEventHandler): () => void {
    return this.emitter.on(type, handler);
  }

  // ===========================================================================
  // Document Operations
  // ===========================================================================

  async getDocument(docId: string): Promise<DocumentRow | null> {
    this.ensureInitialized();
    const driver = this.getDriver();

    // Check cache first
    const cached = this.cache?.get(`doc:${docId}`);
    if (cached) {
      return cached;
    }

    const doc = await driver.getDocument(docId);
    if (doc && this.cache) {
      this.cache.set(`doc:${docId}`, doc);
    }
    return doc;
  }

  async listDocuments(options?: ListDocumentsOptions): Promise<DocumentRow[]> {
    this.ensureInitialized();
    return this.getDriver().listDocuments(options);
  }

  async upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void> {
    this.ensureInitialized();
    const driver = this.getDriver();

    const isNew = !(await driver.getDocument(doc.docId));

    if (this.batcher) {
      await this.batcher.enqueue("document", () => driver.upsertDocument(doc));
    } else {
      await driver.upsertDocument(doc);
    }

    // Invalidate cache
    this.cache?.delete(`doc:${doc.docId}`);

    // Emit event
    this.emitter.emit(isNew ? "document:created" : "document:updated", {
      docId: doc.docId,
      title: doc.title,
    });
  }

  async deleteDocument(docId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().deleteDocument(docId);

    // Invalidate cache
    this.cache?.delete(`doc:${docId}`);

    // Emit event
    this.emitter.emit("document:deleted", { docId });
  }

  async updateDocumentTitle(docId: string, title: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().updateDocumentTitle(docId, title);

    // Invalidate cache
    this.cache?.delete(`doc:${docId}`);

    // Emit event
    this.emitter.emit("document:updated", { docId, title });
  }

  async updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().updateDocumentSavedAt(docId, savedAt);

    // Invalidate cache
    this.cache?.delete(`doc:${docId}`);

    // Emit event
    this.emitter.emit("document:updated", { docId, savedAt });
  }

  // ===========================================================================
  // Topic Operations
  // ===========================================================================

  async createTopic(topic: Omit<TopicRow, "createdAt" | "updatedAt">): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().createTopic(topic);
    this.emitter.emit("topic:changed", { action: "created", topicId: topic.topicId });
  }

  async updateTopic(
    topicId: string,
    updates: Partial<Pick<TopicRow, "name" | "description" | "color">>
  ): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().updateTopic(topicId, updates);
    this.emitter.emit("topic:changed", { action: "updated", topicId });
  }

  async deleteTopic(topicId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().deleteTopic(topicId);
    this.emitter.emit("topic:changed", { action: "deleted", topicId });
  }

  async getTopic(topicId: string): Promise<TopicRow | null> {
    this.ensureInitialized();
    return this.getDriver().getTopic(topicId);
  }

  async listTopics(options?: ListTopicsOptions): Promise<TopicRow[]> {
    this.ensureInitialized();
    return this.getDriver().listTopics(options);
  }

  async addDocumentToTopic(documentId: string, topicId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().addDocumentToTopic(documentId, topicId);
    this.emitter.emit("topic:changed", { action: "document_added", topicId, documentId });
  }

  async removeDocumentFromTopic(documentId: string, topicId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().removeDocumentFromTopic(documentId, topicId);
    this.emitter.emit("topic:changed", { action: "document_removed", topicId, documentId });
  }

  async listDocumentsByTopic(
    topicId: string,
    options?: ListDocumentsOptions
  ): Promise<DocumentRow[]> {
    this.ensureInitialized();
    return this.getDriver().listDocumentsByTopic(topicId, options);
  }

  async listTopicsByDocument(documentId: string): Promise<TopicRow[]> {
    this.ensureInitialized();
    return this.getDriver().listTopicsByDocument(documentId);
  }

  // ===========================================================================
  // CRDT Update Operations
  // ===========================================================================

  async appendUpdate(update: CrdtUpdateRow): Promise<void> {
    this.ensureInitialized();
    const driver = this.getDriver();

    if (this.batcher) {
      await this.batcher.enqueue("update", () => driver.appendUpdate(update));
    } else {
      await driver.appendUpdate(update);
    }

    // Invalidate document cache
    this.cache?.delete(`doc:${update.docId}`);

    this.emitter.emit("sync:pending", { docId: update.docId });
  }

  async listUpdates(options: ListUpdatesOptions): Promise<CrdtUpdateRow[]> {
    this.ensureInitialized();
    return this.getDriver().listUpdates(options);
  }

  // ===========================================================================
  // Annotation Operations
  // ===========================================================================

  async getAnnotation(annotationId: string): Promise<AnnotationRow | null> {
    this.ensureInitialized();
    return this.getDriver().getAnnotation(annotationId);
  }

  async upsertAnnotation(annotation: AnnotationRow): Promise<void> {
    this.ensureInitialized();
    const driver = this.getDriver();

    if (this.batcher) {
      await this.batcher.enqueue("annotation", () => driver.upsertAnnotation(annotation));
    } else {
      await driver.upsertAnnotation(annotation);
    }

    this.emitter.emit("annotation:changed", {
      annotationId: annotation.annotationId,
      docId: annotation.docId,
      state: annotation.state,
    });
  }

  async listAnnotations(options: ListAnnotationsOptions): Promise<AnnotationRow[]> {
    this.ensureInitialized();
    return this.getDriver().listAnnotations(options);
  }

  // ===========================================================================
  // Outbox Operations
  // ===========================================================================

  async enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void> {
    this.ensureInitialized();
    const driver = this.getDriver();

    if (this.batcher) {
      await this.batcher.enqueue("outbox", () => driver.enqueueOutbox(item));
    } else {
      await driver.enqueueOutbox(item);
    }
  }

  async claimOutboxItems(limit: number): Promise<OutboxRow[]> {
    this.ensureInitialized();
    return this.getDriver().claimOutboxItems(limit);
  }

  async ackOutboxItem(outboxId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().ackOutboxItem(outboxId);
    this.emitter.emit("sync:complete", { outboxId });
  }

  async failOutboxItem(outboxId: string, nextRetryAt: number): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().failOutboxItem(outboxId, nextRetryAt);
  }

  // ===========================================================================
  // Import Job Operations
  // ===========================================================================

  async createImportJob(job: Omit<ImportJobRow, "createdAt" | "updatedAt">): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().createImportJob(job);
  }

  async updateImportJob(
    jobId: string,
    updates: Parameters<DbDriver["updateImportJob"]>[1]
  ): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().updateImportJob(jobId, updates);
  }

  async getImportJob(jobId: string): Promise<ImportJobRow | null> {
    this.ensureInitialized();
    return this.getDriver().getImportJob(jobId);
  }

  async listImportJobs(
    options?: Parameters<DbDriver["listImportJobs"]>[0]
  ): Promise<ImportJobRow[]> {
    this.ensureInitialized();
    return this.getDriver().listImportJobs(options);
  }

  async deleteImportJob(jobId: string): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().deleteImportJob(jobId);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Force flush any pending writes.
   */
  async flush(): Promise<void> {
    await this.batcher?.flush();
  }

  /**
   * Clear the in-memory cache.
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Get health check information.
   */
  async healthCheck(): Promise<DbHealthInfo> {
    this.ensureInitialized();
    return this.getDriver().healthCheck();
  }

  /**
   * Reset the database (delete all data).
   * Use with caution!
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    await this.getDriver().reset();
    this.cache?.clear();
  }

  /**
   * Get the underlying driver for advanced operations.
   */
  getDriver(): IndexedDbDriver {
    this.ensureInitialized();
    if (!this.driver) {
      throw new Error("ReaderDb driver unavailable after initialization");
    }
    return this.driver;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.driver) {
      throw new Error("ReaderDb not initialized. Call initialize() before using.");
    }
  }
}

// ===========================================================================
// Factory Function
// ===========================================================================

/**
 * Create a new ReaderDb instance.
 *
 * @param config Optional configuration
 * @returns A new ReaderDb instance (call initialize() before use)
 *
 * @example
 * ```typescript
 * const db = createDb();
 * await db.initialize();
 *
 * const doc = await db.getDocument('my-doc');
 * ```
 */
export function createDb(config?: ReaderDbConfig): ReaderDb {
  return new ReaderDb(config);
}

// Re-export types for convenience
export type {
  AnnotationRow,
  CrdtUpdateRow,
  DbDriver,
  DbHealthInfo,
  DbInitResult,
  DocumentRow,
  ImportJobRow,
  ListAnnotationsOptions,
  ListDocumentsOptions,
  ListTopicsOptions,
  ListUpdatesOptions,
  OutboxRow,
  TopicRow,
} from "../driver/types";
