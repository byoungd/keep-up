/**
 * IndexedDB Fallback Driver using Dexie.
 * Used when OPFS/SQLite is not available.
 */

import Dexie, { type Table } from "dexie";
import type {
  AnnotationRow,
  CrdtUpdateRow,
  DbDriver,
  DbInitResult,
  DocumentRow,
  ListAnnotationsOptions,
  ListDocumentsOptions,
  ListTopicsOptions,
  ListUpdatesOptions,
  OutboxRow,
  TopicRow,
} from "../types";

/** Dexie table row types (matching DB schema) */
interface DexieDocument {
  docId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  activePolicyId: string | null;
  headFrontier: Uint8Array | null;
  savedAt: number | null;
}

interface DexieCrdtUpdate {
  docId: string;
  actorId: string;
  seq: number;
  lamport: number;
  update: Uint8Array;
  receivedAt: number;
  source: "local" | "remote" | "replay";
}

interface DexieAnnotation {
  docId: string;
  annotationId: string;
  kind: string;
  threadId: string | null;
  payloadJson: string;
  state: "active" | "active_partial" | "orphan" | "hidden" | "deleted";
  reason: string | null;
  v: number;
  createdAt: number;
  updatedAt: number;
}

interface DexieOutbox {
  outboxId: string;
  docId: string;
  kind: "crdt_update_batch" | "annotation_mutation" | "policy_update";
  payload: Uint8Array;
  attempts: number;
  nextRetryAt: number | null;
  status: "pending" | "in_flight" | "acked" | "failed";
  createdAt: number;
}

export interface DexieImportJob {
  jobId: string;
  sourceType: string;
  sourceRef: string;
  status: string;
  progress: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultDocumentId: string | null;
  assetId: string | null;
  documentVersionId: string | null;
  dedupeHit: boolean | null;
  attemptCount: number;
  nextRetryAt: number | null;
  parserVersion: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DexieRawAsset {
  assetId: string;
  assetHash: string;
  byteSize: number;
  mimeType: string;
  sourceType: string;
  sourceRef: string;
  storageProvider: string;
  storagePath: string;
  parserHint: string | null;
  ingestMetaJson: string | null;
  createdAt: number;
}

export interface DexieDocumentAsset {
  documentId: string;
  assetId: string;
  role: string;
  createdAt: number;
}

export interface DexieTopic {
  topicId: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DexieDocumentTopic {
  documentId: string;
  topicId: string;
  addedAt: number;
}

/**
 * Dexie database schema for LFCC.
 */
class ReaderDatabase extends Dexie {
  documents!: Table<DexieDocument, string>;
  crdtUpdates!: Table<DexieCrdtUpdate, [string, string, number]>;
  annotations!: Table<DexieAnnotation, string>;
  outbox!: Table<DexieOutbox, string>;
  importJobs!: Table<DexieImportJob, string>;
  rawAssets!: Table<DexieRawAsset, string>;
  documentAssets!: Table<DexieDocumentAsset, [string, string]>;
  topics!: Table<DexieTopic, string>;
  documentTopics!: Table<DexieDocumentTopic, [string, string]>;

  constructor(dbName?: string) {
    super(dbName || "reader-db");

    this.version(1).stores({
      documents: "docId",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
    });

    this.version(2).stores({
      documents: "docId",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
      importJobs: "jobId, [sourceType+sourceRef], [status+createdAt]",
    });

    this.version(3)
      .stores({
        documents: "docId",
        crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
        annotations: "annotationId, [docId+state], [docId+kind], threadId",
        outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
        importJobs: "jobId, createdAt, [sourceType+sourceRef], [status+createdAt]",
      })
      .upgrade(async (tx) => {
        const jobs = tx.table("importJobs");
        await jobs.toCollection().modify((job) => {
          if (job.createdAt === undefined) {
            job.createdAt = Date.now();
          }
          if (job.updatedAt === undefined) {
            job.updatedAt = job.createdAt;
          }
        });
      });

    // Version 4: Add raw_assets and document_assets tables
    this.version(4).stores({
      documents: "docId",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
      importJobs: "jobId, createdAt, [sourceType+sourceRef], [status+createdAt]",
      rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
      documentAssets: "[documentId+assetId]",
    });

    this.version(5).stores({
      documents: "docId",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
      importJobs: "jobId, createdAt, status, [sourceType+sourceRef], [status+createdAt]",
      rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
      documentAssets: "[documentId+assetId]",
    });

    // Version 6: Add updatedAt index for documents for efficient listing
    this.version(6).stores({
      documents: "docId, updatedAt, createdAt, title",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
      importJobs: "jobId, createdAt, status, [sourceType+sourceRef], [status+createdAt]",
      rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
      documentAssets: "[documentId+assetId]",
    });

    // Version 7: Add topics table
    this.version(7).stores({
      documents: "docId, updatedAt, createdAt, title",
      crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
      annotations: "annotationId, [docId+state], [docId+kind], threadId",
      outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
      importJobs: "jobId, createdAt, status, [sourceType+sourceRef], [status+createdAt]",
      rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
      documentAssets: "[documentId+assetId]",
      topics: "topicId, createdAt, updatedAt, name",
    });

    // Version 8: Add savedAt column for "Read Later" feature
    this.version(8)
      .stores({
        documents: "docId, updatedAt, createdAt, title, savedAt",
        crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
        annotations: "annotationId, [docId+state], [docId+kind], threadId",
        outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
        importJobs: "jobId, createdAt, status, [sourceType+sourceRef], [status+createdAt]",
        rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
        documentAssets: "[documentId+assetId]",
        topics: "topicId, createdAt, updatedAt, name",
      })
      .upgrade(async (tx) => {
        const docs = tx.table("documents");
        await docs.toCollection().modify((doc) => {
          if (doc.savedAt === undefined) {
            doc.savedAt = null;
          }
        });
      });

    // Version 9: Add document_topics for source reuse, enhance topics with description/color
    this.version(9)
      .stores({
        documents: "docId, updatedAt, createdAt, title, savedAt",
        crdtUpdates: "[docId+actorId+seq], [docId+lamport], [docId+receivedAt]",
        annotations: "annotationId, [docId+state], [docId+kind], threadId",
        outbox: "outboxId, [status+nextRetryAt], [docId+createdAt]",
        importJobs: "jobId, createdAt, status, [sourceType+sourceRef], [status+createdAt]",
        rawAssets: "assetId, assetHash, [sourceType+sourceRef], createdAt",
        documentAssets: "[documentId+assetId]",
        topics: "topicId, createdAt, updatedAt, name, description, color",
        documentTopics: "[documentId+topicId], topicId",
      })
      .upgrade(async (tx) => {
        const topics = tx.table("topics");
        await topics.toCollection().modify((topic) => {
          if (topic.description === undefined) {
            topic.description = null;
          }
          if (topic.color === undefined) {
            topic.color = null;
          }
        });
      });
  }
}

/**
 * IndexedDB driver implementation using Dexie.
 */
export class IndexedDbDriver implements DbDriver {
  private db: ReaderDatabase | null = null;

  constructor(private dbName?: string) {}

  async init(): Promise<DbInitResult> {
    const start = performance.now();
    this.db = new ReaderDatabase(this.dbName);
    try {
      await this.db.open();
    } catch (error) {
      // Handle schema migration failures by resetting the database
      // This can happen when:
      // 1. Index type changes that Dexie can't patch in-place
      // 2. Adding indexes on fields that don't exist in old records
      if (error instanceof Dexie.SchemaError || (error as Error)?.name === "SchemaError") {
        console.warn(
          "[IndexedDB] Schema migration failed, resetting database:",
          (error as Error).message
        );
        await this.db.delete();
        this.db = new ReaderDatabase();
        await this.db.open();
      } else {
        throw error;
      }
    }
    const schemaVersion = Math.trunc(this.db.verno);
    return {
      driver: "idb-dexie",
      schemaVersion,
      initTimeMs: performance.now() - start,
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private ensureDb(): ReaderDatabase {
    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }
    return this.db;
  }

  async getDocument(docId: string): Promise<DocumentRow | null> {
    const doc = await this.ensureDb().documents.get(docId);
    if (!doc) {
      return null;
    }
    return {
      ...doc,
      savedAt: doc.savedAt ?? null,
    };
  }

  async listDocuments(options?: ListDocumentsOptions): Promise<DocumentRow[]> {
    const db = this.ensureDb();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? "updatedAt";
    const order = options?.order ?? "desc";
    const savedOnly = options?.savedOnly ?? false;

    let collection = db.documents.orderBy(orderBy);
    if (order === "desc") {
      collection = collection.reverse();
    }

    let docs: DexieDocument[];
    if (savedOnly) {
      docs = await collection
        .filter((doc) => doc.savedAt !== null && doc.savedAt !== undefined)
        .offset(offset)
        .limit(limit)
        .toArray();
    } else {
      docs = await collection.offset(offset).limit(limit).toArray();
    }

    return docs.map((doc) => ({
      ...doc,
      savedAt: doc.savedAt ?? null,
    }));
  }

  async upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void> {
    const now = Date.now();
    const existing = await this.ensureDb().documents.get(doc.docId);

    await this.ensureDb().documents.put({
      docId: doc.docId,
      title: doc.title ?? null,
      createdAt: existing?.createdAt ?? doc.createdAt ?? now,
      updatedAt: doc.updatedAt ?? now,
      activePolicyId: doc.activePolicyId ?? null,
      headFrontier: doc.headFrontier ?? null,
      savedAt: doc.savedAt ?? existing?.savedAt ?? null,
    });
  }

  async deleteDocument(docId: string): Promise<void> {
    const db = this.ensureDb();

    // Delete all related data in a transaction
    await db.transaction(
      "rw",
      [
        db.documents,
        db.crdtUpdates,
        db.annotations,
        db.outbox,
        db.documentAssets,
        db.documentTopics,
      ],
      async () => {
        // Delete annotations for this document
        await db.annotations.where("docId").equals(docId).delete();

        // Delete CRDT updates for this document
        await db.crdtUpdates
          .where("[docId+actorId+seq]")
          .between([docId, "", 0], [docId, "\uffff", Number.MAX_SAFE_INTEGER])
          .delete();

        // Delete outbox items for this document
        await db.outbox.where("docId").equals(docId).delete();

        // Delete document-asset links
        await db.documentAssets
          .where("[documentId+assetId]")
          .between([docId, ""], [docId, "\uffff"])
          .delete();

        // Delete document-topic links
        await db.documentTopics
          .where("[documentId+topicId]")
          .between([docId, ""], [docId, "\uffff"])
          .delete();

        // Delete the document itself
        await db.documents.delete(docId);
      }
    );
  }

  async updateDocumentTitle(docId: string, title: string): Promise<void> {
    const db = this.ensureDb();
    const existing = await db.documents.get(docId);
    if (!existing) {
      throw new Error(`Document not found: ${docId}`);
    }
    await db.documents.update(docId, {
      title,
      updatedAt: Date.now(),
    });
  }

  async updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void> {
    const db = this.ensureDb();
    const existing = await db.documents.get(docId);
    if (!existing) {
      throw new Error(`Document not found: ${docId}`);
    }
    await db.documents.update(docId, {
      savedAt,
      updatedAt: Date.now(),
    });
  }

  // --- Topic operations ---
  async createTopic(topic: Omit<TopicRow, "createdAt" | "updatedAt">): Promise<void> {
    const now = Date.now();
    await this.ensureDb().topics.put({
      topicId: topic.topicId,
      name: topic.name,
      description: topic.description ?? null,
      color: topic.color ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateTopic(
    topicId: string,
    updates: Partial<Pick<TopicRow, "name" | "description" | "color">>
  ): Promise<void> {
    const db = this.ensureDb();
    await db.topics.update(topicId, { ...updates, updatedAt: Date.now() });
  }

  async deleteTopic(topicId: string): Promise<void> {
    const db = this.ensureDb();
    await db.transaction("rw", [db.topics, db.documentTopics], async () => {
      await db.documentTopics.where("topicId").equals(topicId).delete();
      await db.topics.delete(topicId);
    });
  }

  async getTopic(topicId: string): Promise<TopicRow | null> {
    const topic = await this.ensureDb().topics.get(topicId);
    if (!topic) {
      return null;
    }
    return {
      topicId: topic.topicId,
      name: topic.name,
      description: topic.description ?? null,
      color: topic.color ?? null,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    };
  }

  async listTopics(options?: ListTopicsOptions): Promise<TopicRow[]> {
    const db = this.ensureDb();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? "updatedAt";
    const order = options?.order ?? "desc";

    let collection = db.topics.orderBy(orderBy);
    if (order === "desc") {
      collection = collection.reverse();
    }

    const topics = await collection.offset(offset).limit(limit).toArray();
    return topics.map((t) => ({
      topicId: t.topicId,
      name: t.name,
      description: t.description ?? null,
      color: t.color ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  // --- Document-Topic link operations ---
  async addDocumentToTopic(documentId: string, topicId: string): Promise<void> {
    const now = Date.now();
    await this.ensureDb().documentTopics.put({
      documentId,
      topicId,
      addedAt: now,
    });
  }

  async removeDocumentFromTopic(documentId: string, topicId: string): Promise<void> {
    await this.ensureDb().documentTopics.delete([documentId, topicId]);
  }

  async listDocumentsByTopic(
    topicId: string,
    options?: ListDocumentsOptions
  ): Promise<DocumentRow[]> {
    const db = this.ensureDb();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const links = await db.documentTopics.where("topicId").equals(topicId).toArray();
    const docIds = links.map((l) => l.documentId);

    if (docIds.length === 0) {
      return [];
    }

    const docs = await db.documents.where("docId").anyOf(docIds).toArray();
    return docs.slice(offset, offset + limit).map((doc) => ({
      ...doc,
      savedAt: doc.savedAt ?? null,
    }));
  }

  async listTopicsByDocument(documentId: string): Promise<TopicRow[]> {
    const db = this.ensureDb();
    const links = await db.documentTopics
      .where("[documentId+topicId]")
      .between([documentId, ""], [documentId, "\uffff"])
      .toArray();

    if (links.length === 0) {
      return [];
    }

    const topicIds = links.map((l) => l.topicId);
    const topics = await db.topics.where("topicId").anyOf(topicIds).toArray();
    return topics.map((t) => ({
      topicId: t.topicId,
      name: t.name,
      description: t.description ?? null,
      color: t.color ?? null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async addSubscriptionToTopic(_subscriptionId: string, _topicId: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async removeSubscriptionFromTopic(_subscriptionId: string, _topicId: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async listSubscriptionsByTopic(
    _topicId: string
  ): Promise<import("../types").RssSubscriptionRow[]> {
    throw new Error("Method not implemented.");
  }

  async listTopicsBySubscription(_subscriptionId: string): Promise<TopicRow[]> {
    throw new Error("Method not implemented.");
  }

  async appendUpdate(update: CrdtUpdateRow): Promise<void> {
    // Use put with ignore if exists (Dexie doesn't have INSERT OR IGNORE)
    const existing = await this.ensureDb().crdtUpdates.get([
      update.docId,
      update.actorId,
      update.seq,
    ]);
    if (!existing) {
      await this.ensureDb().crdtUpdates.add(update);
    }
  }

  async listUpdates(options: ListUpdatesOptions): Promise<CrdtUpdateRow[]> {
    let collection = this.ensureDb()
      .crdtUpdates.where("[docId+lamport]")
      .between(
        [options.docId, options.afterLamport ?? Dexie.minKey],
        [options.docId, Dexie.maxKey],
        options.afterLamport === undefined // include lower bound only if no afterLamport
      );

    if (options.limit) {
      collection = collection.limit(options.limit);
    }

    return collection.toArray();
  }

  async getAnnotation(annotationId: string): Promise<AnnotationRow | null> {
    const ann = await this.ensureDb().annotations.get(annotationId);
    return ann ?? null;
  }

  async upsertAnnotation(annotation: AnnotationRow): Promise<void> {
    await this.ensureDb().annotations.put(annotation);
  }

  async listAnnotations(options: ListAnnotationsOptions): Promise<AnnotationRow[]> {
    const db = this.ensureDb();

    if (options.state && options.kind) {
      // Need to filter manually for compound conditions
      return db.annotations
        .where("[docId+state]")
        .equals([options.docId, options.state])
        .filter((a) => a.kind === options.kind)
        .toArray();
    }

    if (options.state) {
      return db.annotations.where("[docId+state]").equals([options.docId, options.state]).toArray();
    }

    if (options.kind) {
      return db.annotations.where("[docId+kind]").equals([options.docId, options.kind]).toArray();
    }

    return db.annotations.where("docId").equals(options.docId).toArray();
  }

  async enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void> {
    await this.ensureDb().outbox.add({
      ...item,
      attempts: 0,
      nextRetryAt: null,
      status: "pending",
      createdAt: Date.now(),
    });
  }

  async claimOutboxItems(limit: number): Promise<OutboxRow[]> {
    const now = Date.now();
    const items = await this.ensureDb()
      .outbox.where("[status+nextRetryAt]")
      .between(["pending", Dexie.minKey], ["pending", now], true, true)
      .limit(limit)
      .toArray();

    // Also get items with null nextRetryAt
    const pendingNullRetry = await this.ensureDb()
      .outbox.where("status")
      .equals("pending")
      .filter((item) => item.nextRetryAt === null)
      .limit(limit)
      .toArray();

    const allItems = [...items, ...pendingNullRetry].slice(0, limit);

    // Mark as in_flight
    await this.ensureDb().transaction("rw", this.ensureDb().outbox, async () => {
      for (const item of allItems) {
        await this.ensureDb().outbox.update(item.outboxId, {
          status: "in_flight",
          attempts: item.attempts + 1,
        });
      }
    });

    return allItems.map((item) => ({
      ...item,
      status: "in_flight" as const,
      attempts: item.attempts + 1,
    }));
  }

  async ackOutboxItem(outboxId: string): Promise<void> {
    await this.ensureDb().outbox.update(outboxId, { status: "acked" });
  }

  async failOutboxItem(outboxId: string, nextRetryAt: number): Promise<void> {
    await this.ensureDb().outbox.update(outboxId, {
      status: "pending",
      nextRetryAt,
    });
  }

  async healthCheck(): Promise<import("../types").DbHealthInfo> {
    return {
      driver: "idb-dexie",
      schemaVersion: Math.trunc(this.db?.verno ?? 0),
      isLeader: false, // Will be managed by AutoSwitchDbClient
      opfsAvailable: false,
      idbAvailable: true,
    };
  }

  async reset(): Promise<void> {
    if (this.db) {
      this.db.close();
      await this.db.delete();
      this.db = null;
    }
  }

  async batch<T>(ops: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];
    for (const op of ops) {
      results.push(await op());
    }
    return results;
  }

  async transaction<T>(fn: (tx: import("../types").DbTransaction) => Promise<T>): Promise<T> {
    const db = this.ensureDb();
    return db.transaction(
      "rw",
      [db.documents, db.crdtUpdates, db.annotations, db.outbox],
      async () => {
        const tx: import("../types").DbTransaction = {
          upsertDocument: (doc) => this.upsertDocument(doc),
          appendUpdate: (update) => this.appendUpdate(update),
          upsertAnnotation: (ann) => this.upsertAnnotation(ann),
          enqueueOutbox: (item) => this.enqueueOutbox(item),
        };
        return fn(tx);
      }
    );
  }

  async createImportJob(
    job: Omit<import("../types").ImportJobRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    const db = this.ensureDb();
    const now = Date.now();
    await db.importJobs.add({
      jobId: job.jobId,
      sourceType: job.sourceType,
      sourceRef: job.sourceRef,
      status: job.status,
      progress: job.progress,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      resultDocumentId: job.resultDocumentId,
      assetId: job.assetId,
      documentVersionId: job.documentVersionId,
      dedupeHit: job.dedupeHit,
      attemptCount: job.attemptCount,
      nextRetryAt: job.nextRetryAt,
      parserVersion: job.parserVersion,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateImportJob(
    jobId: string,
    updates: Partial<
      Pick<
        import("../types").ImportJobRow,
        | "status"
        | "progress"
        | "errorCode"
        | "errorMessage"
        | "resultDocumentId"
        | "assetId"
        | "documentVersionId"
        | "dedupeHit"
        | "attemptCount"
        | "nextRetryAt"
        | "parserVersion"
      >
    >
  ): Promise<void> {
    const db = this.ensureDb();
    await db.importJobs.update(jobId, { ...updates, updatedAt: Date.now() });
  }

  async getImportJob(jobId: string): Promise<import("../types").ImportJobRow | null> {
    const db = this.ensureDb();
    const row = await db.importJobs.get(jobId);
    if (!row) {
      return null;
    }
    return {
      jobId: row.jobId,
      sourceType: row.sourceType as import("../types").ImportSourceType,
      sourceRef: row.sourceRef,
      status: row.status as import("../types").ImportJobStatus,
      progress: row.progress,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      resultDocumentId: row.resultDocumentId,
      assetId: row.assetId ?? null,
      documentVersionId: row.documentVersionId ?? null,
      dedupeHit: row.dedupeHit ?? null,
      attemptCount: row.attemptCount ?? 0,
      nextRetryAt: row.nextRetryAt ?? null,
      parserVersion: row.parserVersion ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listImportJobs(
    options?: import("../types").ListImportJobsOptions
  ): Promise<import("../types").ImportJobRow[]> {
    const db = this.ensureDb();
    const limit = options?.limit ?? 100;
    const mapRow = (r: DexieImportJob): import("../types").ImportJobRow => ({
      jobId: r.jobId,
      sourceType: r.sourceType as import("../types").ImportSourceType,
      sourceRef: r.sourceRef,
      status: r.status as import("../types").ImportJobStatus,
      progress: r.progress,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      resultDocumentId: r.resultDocumentId,
      assetId: r.assetId ?? null,
      documentVersionId: r.documentVersionId ?? null,
      dedupeHit: r.dedupeHit ?? null,
      attemptCount: r.attemptCount ?? 0,
      nextRetryAt: r.nextRetryAt ?? null,
      parserVersion: r.parserVersion ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
    const fallback = async () => {
      const rows = await db.importJobs.toArray();
      const sorted = rows
        .filter((row) => (options?.status ? row.status === options.status : true))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
      return sorted.map(mapRow);
    };
    const hasCreatedAtIndex = (() => {
      for (const index of db.importJobs.schema.indexes) {
        if (index.name === "createdAt") {
          return true;
        }
      }
      return false;
    })();
    try {
      if (options?.status) {
        const rows = await db.importJobs
          .where("[status+createdAt]")
          .between([options.status, Dexie.minKey], [options.status, Dexie.maxKey], true, true)
          .reverse()
          .limit(limit)
          .toArray();
        return rows.map(mapRow);
      }
      if (!hasCreatedAtIndex) {
        return await fallback();
      }
      const rows = await db.importJobs.orderBy("createdAt").reverse().limit(limit).toArray();
      return rows.map(mapRow);
    } catch (_error) {
      // Fallback for legacy databases missing the createdAt index
      return await fallback();
    }
  }

  async getImportJobBySource(
    sourceType: import("../types").ImportSourceType,
    sourceRef: string
  ): Promise<import("../types").ImportJobRow | null> {
    const db = this.ensureDb();
    const row = await db.importJobs.where({ sourceType, sourceRef }).first();
    if (!row) {
      return null;
    }
    return {
      jobId: row.jobId,
      sourceType: row.sourceType as import("../types").ImportSourceType,
      sourceRef: row.sourceRef,
      status: row.status as import("../types").ImportJobStatus,
      progress: row.progress,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      resultDocumentId: row.resultDocumentId,
      assetId: row.assetId ?? null,
      documentVersionId: row.documentVersionId ?? null,
      dedupeHit: row.dedupeHit ?? null,
      attemptCount: row.attemptCount ?? 0,
      nextRetryAt: row.nextRetryAt ?? null,
      parserVersion: row.parserVersion ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async deleteImportJob(jobId: string): Promise<void> {
    const db = this.ensureDb();
    await db.importJobs.delete(jobId);
  }

  async createRawAsset(asset: import("../types").RawAssetRow): Promise<void> {
    const db = this.ensureDb();
    await db.rawAssets.add({
      assetId: asset.assetId,
      assetHash: asset.assetHash,
      byteSize: asset.byteSize,
      mimeType: asset.mimeType,
      sourceType: asset.sourceType,
      sourceRef: asset.sourceRef,
      storageProvider: asset.storageProvider,
      storagePath: asset.storagePath,
      parserHint: asset.parserHint,
      ingestMetaJson: asset.ingestMetaJson,
      createdAt: asset.createdAt,
    });
  }

  async getRawAssetByHash(assetHash: string): Promise<import("../types").RawAssetRow | null> {
    const db = this.ensureDb();
    const row = await db.rawAssets.where("assetHash").equals(assetHash).first();
    if (!row) {
      return null;
    }
    return {
      assetId: row.assetId,
      assetHash: row.assetHash,
      byteSize: row.byteSize,
      mimeType: row.mimeType,
      sourceType: row.sourceType as import("../types").ImportSourceType,
      sourceRef: row.sourceRef,
      storageProvider: row.storageProvider as "opfs" | "idb",
      storagePath: row.storagePath,
      parserHint: row.parserHint,
      ingestMetaJson: row.ingestMetaJson,
      createdAt: row.createdAt,
    };
  }

  async linkDocumentAsset(documentId: string, assetId: string, role = "primary"): Promise<void> {
    const db = this.ensureDb();
    await db.documentAssets.put({
      documentId,
      assetId,
      role,
      createdAt: Date.now(),
    });
  }

  // --- RSS Subscription operations (stubs for IndexedDB fallback) ---
  async createRssSubscription(
    _subscription: Omit<import("../types").RssSubscriptionRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
  }

  async listRssSubscriptions(
    _options?: import("../types").ListRssSubscriptionsOptions
  ): Promise<import("../types").RssSubscriptionRow[]> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return [];
  }

  async getRssSubscription(
    _subscriptionId: string
  ): Promise<import("../types").RssSubscriptionRow | null> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return null;
  }

  async getRssSubscriptionByUrl(
    _url: string
  ): Promise<import("../types").RssSubscriptionRow | null> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return null;
  }

  async updateRssSubscription(
    _subscriptionId: string,
    _updates: Partial<
      Pick<
        import("../types").RssSubscriptionRow,
        | "displayName"
        | "folderId"
        | "enabled"
        | "lastFetchedAt"
        | "status"
        | "errorMessage"
        | "etag"
        | "lastModified"
      >
    >
  ): Promise<void> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
  }

  async deleteRssSubscription(_subscriptionId: string): Promise<void> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
  }

  // --- Feed Item operations (stubs for IndexedDB fallback) ---
  async getFeedItemByGuid(
    _subscriptionId: string,
    _guid: string
  ): Promise<import("../types").FeedItemRow | null> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return null;
  }

  async createFeedItem(
    _item: Omit<import("../types").FeedItemRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
  }

  async updateFeedItem(
    _itemId: string,
    _updates: Partial<
      Pick<import("../types").FeedItemRow, "readState" | "saved" | "documentId" | "contentHtml">
    >
  ): Promise<void> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
  }

  async listFeedItems(
    _options?: import("../types").ListFeedItemsOptions
  ): Promise<import("../types").FeedItemRow[]> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return [];
  }

  async countUnreadFeedItems(_subscriptionId?: string): Promise<number> {
    console.warn("[IndexedDbDriver] RSS operations not fully supported in fallback driver");
    return 0;
  }

  // --- Content Item operations (not implemented for IndexedDB fallback) ---
  async upsertContentItem(_item: import("../types").ContentItemRow): Promise<void> {
    console.warn("[IndexedDbDriver] Content item operations not supported in fallback driver");
  }

  async getContentItem(_itemId: string): Promise<import("../types").ContentItemRow | null> {
    console.warn("[IndexedDbDriver] Content item operations not supported in fallback driver");
    return null;
  }

  async getContentItemByHash(
    _canonicalHash: string
  ): Promise<import("../types").ContentItemRow | null> {
    console.warn("[IndexedDbDriver] Content item operations not supported in fallback driver");
    return null;
  }

  async listContentItems(
    _options?: import("../types").ListContentItemsOptions
  ): Promise<import("../types").ContentItemRow[]> {
    console.warn("[IndexedDbDriver] Content item operations not supported in fallback driver");
    return [];
  }

  async deleteContentItem(_itemId: string): Promise<void> {
    console.warn("[IndexedDbDriver] Content item operations not supported in fallback driver");
  }

  // --- Digest operations (not implemented for IndexedDB fallback) ---
  async createDigest(
    _digest: Omit<import("../types").DigestRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
  }

  async updateDigest(
    _digestId: string,
    _updates: Partial<
      Pick<
        import("../types").DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
  }

  async getDigest(_digestId: string): Promise<import("../types").DigestRow | null> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
    return null;
  }

  async getDigestByDate(
    _userId: string,
    _date: string
  ): Promise<import("../types").DigestRow | null> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
    return null;
  }

  async listDigests(
    _options: import("../types").ListDigestsOptions
  ): Promise<import("../types").DigestRow[]> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
    return [];
  }

  async deleteDigest(_digestId: string): Promise<void> {
    console.warn("[IndexedDbDriver] Digest operations not supported in fallback driver");
  }

  // --- Digest Card operations (not implemented for IndexedDB fallback) ---
  async createDigestCard(_card: import("../types").DigestCardRow): Promise<void> {
    console.warn("[IndexedDbDriver] Digest card operations not supported in fallback driver");
  }

  async listDigestCards(_digestId: string): Promise<import("../types").DigestCardRow[]> {
    console.warn("[IndexedDbDriver] Digest card operations not supported in fallback driver");
    return [];
  }

  async linkCardSource(_cardId: string, _sourceItemId: string, _sourceType: string): Promise<void> {
    console.warn("[IndexedDbDriver] Digest card operations not supported in fallback driver");
  }

  async getCardSourceIds(_cardId: string): Promise<string[]> {
    console.warn("[IndexedDbDriver] Digest card operations not supported in fallback driver");
    return [];
  }

  // --- Brief operations (not implemented for IndexedDB fallback) ---
  async createBrief(
    _brief: Omit<import("../types").BriefRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    console.warn("[IndexedDbDriver] Brief operations not supported in fallback driver");
  }

  async updateBrief(
    _briefId: string,
    _updates: Partial<
      Pick<
        import("../types").BriefRow,
        "title" | "description" | "coverImageUrl" | "isPublic" | "documentId"
      >
    >
  ): Promise<void> {
    console.warn("[IndexedDbDriver] Brief operations not supported in fallback driver");
  }

  async getBrief(_briefId: string): Promise<import("../types").BriefRow | null> {
    console.warn("[IndexedDbDriver] Brief operations not supported in fallback driver");
    return null;
  }

  async listBriefs(
    _options?: import("../types").ListBriefsOptions
  ): Promise<import("../types").BriefRow[]> {
    console.warn("[IndexedDbDriver] Brief operations not supported in fallback driver");
    return [];
  }

  async deleteBrief(_briefId: string): Promise<void> {
    console.warn("[IndexedDbDriver] Brief operations not supported in fallback driver");
  }

  // --- Brief Item operations (not implemented for IndexedDB fallback) ---
  async addBriefItem(_item: import("../types").BriefItemRow): Promise<void> {
    console.warn("[IndexedDbDriver] Brief item operations not supported in fallback driver");
  }

  async updateBriefItem(
    _briefId: string,
    _itemId: string,
    _updates: Partial<Pick<import("../types").BriefItemRow, "note" | "orderIndex">>
  ): Promise<void> {
    console.warn("[IndexedDbDriver] Brief item operations not supported in fallback driver");
  }

  async removeBriefItem(_briefId: string, _itemId: string): Promise<void> {
    console.warn("[IndexedDbDriver] Brief item operations not supported in fallback driver");
  }

  async listBriefItems(_briefId: string): Promise<import("../types").BriefItemRow[]> {
    console.warn("[IndexedDbDriver] Brief item operations not supported in fallback driver");
    return [];
  }
}

/**
 * Create an IndexedDB driver instance.
 */
export function createIndexedDbDriver(): IndexedDbDriver {
  return new IndexedDbDriver();
}
