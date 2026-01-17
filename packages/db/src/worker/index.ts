/**
 * DB Worker Entry Point
 *
 * This worker hosts the SQLite WASM engine and handles RPC requests from the main thread.
 */

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
} from "../driver/types";
import { CURRENT_SCHEMA_VERSION, runMigrations } from "../schema";
import { handleWorkerRequest } from "./rpcHandler";
import type { WorkerRequest } from "./rpcTypes";

// We'll dynamically import @sqlite.org/sqlite-wasm when available.
// For now, define a placeholder interface.
interface Sqlite3Static {
  oo1: {
    OpfsDb: new (filename: string) => OpfsDbHandle;
    DB: new (filename: string) => OpfsDbHandle;
  };
}

interface OpfsDbHandle {
  exec(
    sql: string,
    options?: { returnValue?: string; rowMode?: string; bind?: unknown[] }
  ): unknown;
  close(): void;
}

let db: OpfsDbHandle | null = null;
let driverReady = false;
let opfsAvailable = false;

function hasOpfsSupport(sqlite3: Sqlite3Static): boolean {
  const hasOpfsDb = Boolean(sqlite3.oo1?.OpfsDb);
  const storageAvailable =
    typeof navigator !== "undefined" &&
    typeof navigator.storage !== "undefined" &&
    typeof navigator.storage.getDirectory === "function";
  return hasOpfsDb && storageAvailable;
}

/**
 * Initialize SQLite with OPFS persistence.
 */
async function initSqlite(): Promise<void> {
  if (driverReady) {
    return;
  }

  try {
    // Dynamic import of sqlite-wasm
    const sqlite3Module = await import("@sqlite.org/sqlite-wasm");
    const sqlite3: Sqlite3Static = await (sqlite3Module.default as () => Promise<Sqlite3Static>)();

    // Check if OPFS is available
    if (hasOpfsSupport(sqlite3)) {
      db = new sqlite3.oo1.OpfsDb("/reader.db");
      opfsAvailable = true;
    } else {
      // Fallback to in-memory if OPFS not available
      db = new sqlite3.oo1.DB(":memory:");
      opfsAvailable = false;
    }

    // Run migrations
    const versionResult = db.exec("PRAGMA user_version;", {
      returnValue: "resultRows",
      rowMode: "array",
    }) as number[][];
    const currentVersion = versionResult?.[0]?.[0] ?? 0;

    await runMigrations(currentVersion, async (sql: string) => {
      if (!db) {
        throw new Error("Database not initialized during migration");
      }
      db.exec(sql);
    });

    driverReady = true;
  } catch (error) {
    console.error("[db-worker] initSqlite failed", error);
    throw error;
  }
}

function getDb(): OpfsDbHandle {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

/**
 * Execute a SQL query and return results.
 */
function execSql<T>(sql: string, bind?: unknown[]): T[] {
  const db = getDb();
  const result = db.exec(sql, {
    returnValue: "resultRows",
    rowMode: "object",
    bind,
  });
  return result as T[];
}

/**
 * Execute a SQL statement (no return).
 */
function execStatement(sql: string, bind?: unknown[]): void {
  const db = getDb();
  db.exec(sql, { bind });
}

// --- Driver implementation ---

const driver: DbDriver = {
  async init(): Promise<DbInitResult> {
    const start = performance.now();
    await initSqlite();
    const schemaVersionResult = db?.exec("PRAGMA user_version;", {
      returnValue: "resultRows",
      rowMode: "array",
    }) as number[][] | undefined;
    const schemaVersion = schemaVersionResult?.[0]?.[0] ?? CURRENT_SCHEMA_VERSION;
    return {
      driver: "sqlite-opfs",
      schemaVersion,
      initTimeMs: performance.now() - start,
    };
  },

  async close() {
    if (db) {
      db.close();
      db = null;
      driverReady = false;
    }
  },

  async getDocument(docId: string): Promise<DocumentRow | null> {
    const rows = execSql<{
      doc_id: string;
      title: string | null;
      created_at: number;
      updated_at: number;
      active_policy_id: string | null;
      head_frontier: Uint8Array | null;
      saved_at: number | null;
    }>(
      "SELECT doc_id, title, created_at, updated_at, active_policy_id, head_frontier, saved_at FROM documents WHERE doc_id = ?",
      [docId]
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      docId: row.doc_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activePolicyId: row.active_policy_id,
      headFrontier: row.head_frontier,
      savedAt: row.saved_at,
    };
  },

  async deleteDocument(docId: string): Promise<void> {
    const db = getDb();
    db.exec("BEGIN TRANSACTION");
    try {
      // Delete related data
      execStatement("DELETE FROM crdt_updates WHERE doc_id = ?", [docId]);
      execStatement("DELETE FROM annotations WHERE doc_id = ?", [docId]);
      execStatement("DELETE FROM outbox WHERE doc_id = ?", [docId]);
      execStatement("DELETE FROM document_assets WHERE document_id = ?", [docId]);

      // Delete basic document
      execStatement("DELETE FROM documents WHERE doc_id = ?", [docId]);

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },

  async updateDocumentTitle(docId: string, title: string): Promise<void> {
    const now = Date.now();
    execStatement("UPDATE documents SET title = ?, updated_at = ? WHERE doc_id = ?", [
      title,
      now,
      docId,
    ]);
  },

  async updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void> {
    const now = Date.now();
    execStatement("UPDATE documents SET saved_at = ?, updated_at = ? WHERE doc_id = ?", [
      savedAt,
      now,
      docId,
    ]);
  },

  async createTopic(topic: Omit<TopicRow, "createdAt" | "updatedAt">): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO topics (topic_id, name, description, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [topic.topicId, topic.name, topic.description ?? null, topic.color ?? null, now, now]
    );
  },

  async updateTopic(
    topicId: string,
    updates: Partial<Pick<TopicRow, "name" | "description" | "color">>
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) {
      sets.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push("description = ?");
      values.push(updates.description);
    }
    if (updates.color !== undefined) {
      sets.push("color = ?");
      values.push(updates.color);
    }
    if (sets.length === 0) {
      return;
    }
    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(topicId);
    execStatement(`UPDATE topics SET ${sets.join(", ")} WHERE topic_id = ?`, values);
  },

  async deleteTopic(topicId: string): Promise<void> {
    execStatement("DELETE FROM topics WHERE topic_id = ?", [topicId]);
  },

  async getTopic(topicId: string): Promise<TopicRow | null> {
    const rows = execSql<{
      topic_id: string;
      name: string;
      description: string | null;
      color: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM topics WHERE topic_id = ?", [topicId]);
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      topicId: row.topic_id,
      name: row.name,
      description: row.description,
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async listTopics(options?: ListTopicsOptions): Promise<TopicRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? "updatedAt";
    const order = options?.order ?? "desc";

    const columnMap: Record<string, string> = {
      updatedAt: "updated_at",
      createdAt: "created_at",
      name: "name",
    };
    const orderColumn = columnMap[orderBy] ?? "updated_at";
    const orderDir = order === "asc" ? "ASC" : "DESC";

    const rows = execSql<{
      topic_id: string;
      name: string;
      description: string | null;
      color: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT topic_id, name, description, color, created_at, updated_at
       FROM topics
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map((row) => ({
      topicId: row.topic_id,
      name: row.name,
      description: row.description,
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addDocumentToTopic(documentId: string, topicId: string): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT OR IGNORE INTO document_topics (document_id, topic_id, added_at)
       VALUES (?, ?, ?)`,
      [documentId, topicId, now]
    );
  },

  async removeDocumentFromTopic(documentId: string, topicId: string): Promise<void> {
    execStatement("DELETE FROM document_topics WHERE document_id = ? AND topic_id = ?", [
      documentId,
      topicId,
    ]);
  },

  async listDocumentsByTopic(
    topicId: string,
    options?: ListDocumentsOptions
  ): Promise<DocumentRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? "updatedAt";
    const order = options?.order ?? "desc";

    const columnMap: Record<string, string> = {
      updatedAt: "d.updated_at",
      createdAt: "d.created_at",
      title: "d.title",
      savedAt: "d.saved_at",
    };
    const orderColumn = columnMap[orderBy] ?? "d.updated_at";
    const orderDir = order === "asc" ? "ASC" : "DESC";

    const rows = execSql<{
      doc_id: string;
      title: string | null;
      created_at: number;
      updated_at: number;
      active_policy_id: string | null;
      head_frontier: Uint8Array | null;
      saved_at: number | null;
    }>(
      `SELECT d.doc_id, d.title, d.created_at, d.updated_at, d.active_policy_id, d.head_frontier, d.saved_at
       FROM documents d
       INNER JOIN document_topics dt ON d.doc_id = dt.document_id
       WHERE dt.topic_id = ?
       ORDER BY ${orderColumn} ${orderDir}
       LIMIT ? OFFSET ?`,
      [topicId, limit, offset]
    );

    return rows.map((row) => ({
      docId: row.doc_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activePolicyId: row.active_policy_id,
      headFrontier: row.head_frontier,
      savedAt: row.saved_at,
    }));
  },

  async listTopicsByDocument(documentId: string): Promise<TopicRow[]> {
    const rows = execSql<{
      topic_id: string;
      name: string;
      description: string | null;
      color: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT t.topic_id, t.name, t.description, t.color, t.created_at, t.updated_at
       FROM topics t
       INNER JOIN document_topics dt ON t.topic_id = dt.topic_id
       WHERE dt.document_id = ?
       ORDER BY dt.added_at DESC`,
      [documentId]
    );

    return rows.map((row) => ({
      topicId: row.topic_id,
      name: row.name,
      description: row.description,
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async addSubscriptionToTopic(subscriptionId: string, topicId: string): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT OR IGNORE INTO subscription_topics (subscription_id, topic_id, added_at)
       VALUES (?, ?, ?)`,
      [subscriptionId, topicId, now]
    );
  },

  async removeSubscriptionFromTopic(subscriptionId: string, topicId: string): Promise<void> {
    execStatement("DELETE FROM subscription_topics WHERE subscription_id = ? AND topic_id = ?", [
      subscriptionId,
      topicId,
    ]);
  },

  async listSubscriptionsByTopic(
    topicId: string
  ): Promise<import("../driver/types").RssSubscriptionRow[]> {
    const rows = execSql<{
      subscription_id: string;
      url: string;
      title: string | null;
      display_name: string | null;
      site_url: string | null;
      folder_id: string | null;
      enabled: number;
      last_fetched_at: number | null;
      status: string;
      error_message: string | null;
      etag: string | null;
      last_modified: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT s.*
       FROM rss_subscriptions s
       INNER JOIN subscription_topics st ON s.subscription_id = st.subscription_id
       WHERE st.topic_id = ?
       ORDER BY st.added_at DESC`,
      [topicId]
    );

    return rows.map((r) => ({
      subscriptionId: r.subscription_id,
      url: r.url,
      title: r.title,
      displayName: r.display_name,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      enabled: r.enabled === 1,
      lastFetchedAt: r.last_fetched_at,
      status: r.status as "ok" | "error",
      errorMessage: r.error_message,
      etag: r.etag,
      lastModified: r.last_modified,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async listTopicsBySubscription(subscriptionId: string): Promise<TopicRow[]> {
    const rows = execSql<{
      topic_id: string;
      name: string;
      description: string | null;
      color: string | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT t.*
       FROM topics t
       INNER JOIN subscription_topics st ON t.topic_id = st.topic_id
       WHERE st.subscription_id = ?
       ORDER BY st.added_at DESC`,
      [subscriptionId]
    );

    return rows.map((r) => ({
      topicId: r.topic_id,
      name: r.name,
      description: r.description,
      color: r.color,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async upsertDocument(doc) {
    const now = Date.now();
    execStatement(
      `INSERT INTO documents (doc_id, title, created_at, updated_at, active_policy_id, head_frontier)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET
         title = excluded.title,
         updated_at = excluded.updated_at,
         active_policy_id = excluded.active_policy_id,
         head_frontier = excluded.head_frontier`,
      [
        doc.docId,
        doc.title ?? null,
        doc.createdAt ?? now,
        doc.updatedAt ?? now,
        doc.activePolicyId ?? null,
        doc.headFrontier ?? null,
      ]
    );
  },

  async appendUpdate(update: CrdtUpdateRow) {
    execStatement(
      `INSERT OR IGNORE INTO crdt_updates (doc_id, actor_id, seq, lamport, update, received_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        update.docId,
        update.actorId,
        update.seq,
        update.lamport,
        update.update,
        update.receivedAt,
        update.source,
      ]
    );
  },

  async listUpdates(options: ListUpdatesOptions): Promise<CrdtUpdateRow[]> {
    let sql = "SELECT * FROM crdt_updates WHERE doc_id = ?";
    const bind: unknown[] = [options.docId];

    if (options.afterLamport !== undefined) {
      sql += " AND lamport > ?";
      bind.push(options.afterLamport);
    }
    sql += " ORDER BY lamport ASC";
    if (options.limit !== undefined) {
      sql += " LIMIT ?";
      bind.push(options.limit);
    }

    const rows = execSql<{
      doc_id: string;
      actor_id: string;
      seq: number;
      lamport: number;
      update: Uint8Array;
      received_at: number;
      source: string;
    }>(sql, bind);

    return rows.map((r) => ({
      docId: r.doc_id,
      actorId: r.actor_id,
      seq: r.seq,
      lamport: r.lamport,
      update: r.update,
      receivedAt: r.received_at,
      source: r.source as CrdtUpdateRow["source"],
    }));
  },

  async getAnnotation(annotationId: string): Promise<AnnotationRow | null> {
    const rows = execSql<{
      doc_id: string;
      annotation_id: string;
      kind: string;
      thread_id: string | null;
      payload_json: string;
      state: string;
      reason: string | null;
      v: number;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM annotations WHERE annotation_id = ?", [annotationId]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      docId: r.doc_id,
      annotationId: r.annotation_id,
      kind: r.kind,
      threadId: r.thread_id,
      payloadJson: r.payload_json,
      state: r.state as AnnotationRow["state"],
      reason: r.reason,
      v: r.v,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async upsertAnnotation(annotation: AnnotationRow) {
    execStatement(
      `INSERT INTO annotations (doc_id, annotation_id, kind, thread_id, payload_json, state, reason, v, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(annotation_id) DO UPDATE SET
         kind = excluded.kind,
         thread_id = excluded.thread_id,
         payload_json = excluded.payload_json,
         state = excluded.state,
         reason = excluded.reason,
         v = excluded.v,
         updated_at = excluded.updated_at`,
      [
        annotation.docId,
        annotation.annotationId,
        annotation.kind,
        annotation.threadId,
        annotation.payloadJson,
        annotation.state,
        annotation.reason,
        annotation.v,
        annotation.createdAt,
        annotation.updatedAt,
      ]
    );
  },

  async listAnnotations(options: ListAnnotationsOptions): Promise<AnnotationRow[]> {
    let sql = "SELECT * FROM annotations WHERE doc_id = ?";
    const bind: unknown[] = [options.docId];

    if (options.state) {
      sql += " AND state = ?";
      bind.push(options.state);
    }
    if (options.kind) {
      sql += " AND kind = ?";
      bind.push(options.kind);
    }
    sql += " ORDER BY created_at ASC";

    const rows = execSql<{
      doc_id: string;
      annotation_id: string;
      kind: string;
      thread_id: string | null;
      payload_json: string;
      state: string;
      reason: string | null;
      v: number;
      created_at: number;
      updated_at: number;
    }>(sql, bind);

    return rows.map((r) => ({
      docId: r.doc_id,
      annotationId: r.annotation_id,
      kind: r.kind,
      threadId: r.thread_id,
      payloadJson: r.payload_json,
      state: r.state as AnnotationRow["state"],
      reason: r.reason,
      v: r.v,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async enqueueOutbox(item) {
    const now = Date.now();
    execStatement(
      `INSERT INTO outbox (outbox_id, doc_id, kind, payload, attempts, next_retry_at, status, created_at)
       VALUES (?, ?, ?, ?, 0, NULL, 'pending', ?)`,
      [item.outboxId, item.docId, item.kind, item.payload, now]
    );
  },

  async claimOutboxItems(limit: number): Promise<OutboxRow[]> {
    const now = Date.now();
    const rows = execSql<{
      outbox_id: string;
      doc_id: string;
      kind: string;
      payload: Uint8Array;
      attempts: number;
      next_retry_at: number | null;
      status: string;
      created_at: number;
    }>(
      `SELECT * FROM outbox 
       WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [now, limit]
    );

    // Mark as in_flight
    for (const r of rows) {
      execStatement(
        "UPDATE outbox SET status = 'in_flight', attempts = attempts + 1 WHERE outbox_id = ?",
        [r.outbox_id]
      );
    }

    return rows.map((r) => ({
      outboxId: r.outbox_id,
      docId: r.doc_id,
      kind: r.kind as OutboxRow["kind"],
      payload: r.payload,
      attempts: r.attempts + 1,
      nextRetryAt: r.next_retry_at,
      status: "in_flight" as const,
      createdAt: r.created_at,
    }));
  },

  async ackOutboxItem(outboxId: string) {
    execStatement("UPDATE outbox SET status = 'acked' WHERE outbox_id = ?", [outboxId]);
  },

  async failOutboxItem(outboxId: string, nextRetryAt: number) {
    execStatement("UPDATE outbox SET status = 'pending', next_retry_at = ? WHERE outbox_id = ?", [
      nextRetryAt,
      outboxId,
    ]);
  },

  async healthCheck(): Promise<import("../driver/types").DbHealthInfo> {
    const versionResult = db?.exec("PRAGMA user_version;", {
      returnValue: "resultRows",
      rowMode: "array",
    }) as number[][] | undefined;
    const schemaVersion = versionResult?.[0]?.[0] ?? 0;

    return {
      driver: "sqlite-opfs",
      schemaVersion,
      isLeader: false, // Will be managed by AutoSwitchDbClient
      opfsAvailable,
      idbAvailable: typeof indexedDB !== "undefined",
    };
  },

  async reset(): Promise<void> {
    if (db) {
      // Drop all tables
      const tables = execSql<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      for (const t of tables) {
        execStatement(`DROP TABLE IF EXISTS ${t.name}`);
      }
      db.close();
      db = null;
      driverReady = false;
    }
  },

  async createImportJob(
    job: Omit<import("../driver/types").ImportJobRow, "createdAt" | "updatedAt">
  ) {
    const now = Date.now();
    execStatement(
      `INSERT INTO import_jobs (job_id, source_type, source_ref, status, progress, error_code, error_message, result_document_id, asset_id, document_version_id, dedupe_hit, attempt_count, next_retry_at, parser_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.jobId,
        job.sourceType,
        job.sourceRef,
        job.status,
        job.progress,
        job.errorCode,
        job.errorMessage,
        job.resultDocumentId,
        job.assetId,
        job.documentVersionId,
        job.dedupeHit,
        job.attemptCount,
        job.nextRetryAt,
        job.parserVersion,
        now,
        now,
      ]
    );
  },

  async updateImportJob(
    jobId: string,
    updates: Partial<
      Pick<
        import("../driver/types").ImportJobRow,
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
  ) {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.status !== undefined) {
      sets.push("status = ?");
      values.push(updates.status);
    }
    if (updates.progress !== undefined) {
      sets.push("progress = ?");
      values.push(updates.progress);
    }
    if (updates.errorCode !== undefined) {
      sets.push("error_code = ?");
      values.push(updates.errorCode);
    }
    if (updates.errorMessage !== undefined) {
      sets.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    if (updates.resultDocumentId !== undefined) {
      sets.push("result_document_id = ?");
      values.push(updates.resultDocumentId);
    }
    if (updates.assetId !== undefined) {
      sets.push("asset_id = ?");
      values.push(updates.assetId);
    }
    if (updates.documentVersionId !== undefined) {
      sets.push("document_version_id = ?");
      values.push(updates.documentVersionId);
    }
    if (updates.dedupeHit !== undefined) {
      sets.push("dedupe_hit = ?");
      values.push(updates.dedupeHit);
    }
    if (updates.attemptCount !== undefined) {
      sets.push("attempt_count = ?");
      values.push(updates.attemptCount);
    }
    if (updates.nextRetryAt !== undefined) {
      sets.push("next_retry_at = ?");
      values.push(updates.nextRetryAt);
    }
    if (updates.parserVersion !== undefined) {
      sets.push("parser_version = ?");
      values.push(updates.parserVersion);
    }
    if (sets.length === 0) {
      return;
    }
    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(jobId);
    execStatement(`UPDATE import_jobs SET ${sets.join(", ")} WHERE job_id = ?`, values);
  },

  async getImportJob(jobId: string): Promise<import("../driver/types").ImportJobRow | null> {
    const rows = execSql<{
      job_id: string;
      source_type: string;
      source_ref: string;
      status: string;
      progress: number | null;
      error_code: string | null;
      error_message: string | null;
      result_document_id: string | null;
      asset_id: string | null;
      document_version_id: string | null;
      dedupe_hit: number | null;
      attempt_count: number | null;
      next_retry_at: number | null;
      parser_version: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM import_jobs WHERE job_id = ?", [jobId]);
    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      jobId: r.job_id,
      sourceType: r.source_type as import("../driver/types").ImportSourceType,
      sourceRef: r.source_ref,
      status: r.status as import("../driver/types").ImportJobStatus,
      progress: r.progress,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      resultDocumentId: r.result_document_id,
      assetId: r.asset_id ?? null,
      documentVersionId: r.document_version_id ?? null,
      dedupeHit: r.dedupe_hit === null ? null : Boolean(r.dedupe_hit),
      attemptCount: r.attempt_count ?? 0,
      nextRetryAt: r.next_retry_at ?? null,
      parserVersion: r.parser_version ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async listImportJobs(
    options?: import("../driver/types").ListImportJobsOptions
  ): Promise<import("../driver/types").ImportJobRow[]> {
    let sql = "SELECT * FROM import_jobs WHERE 1=1";
    const params: unknown[] = [];
    if (options?.status) {
      sql += " AND status = ?";
      params.push(options.status);
    }
    if (options?.sourceType) {
      sql += " AND source_type = ?";
      params.push(options.sourceType);
    }
    sql += " ORDER BY created_at DESC";
    if (options?.limit) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    const rows = execSql<{
      job_id: string;
      source_type: string;
      source_ref: string;
      status: string;
      progress: number | null;
      error_code: string | null;
      error_message: string | null;
      result_document_id: string | null;
      asset_id: string | null;
      document_version_id: string | null;
      dedupe_hit: number | null;
      attempt_count: number | null;
      next_retry_at: number | null;
      parser_version: string | null;
      created_at: number;
      updated_at: number;
    }>(sql, params);
    return rows.map((r) => ({
      jobId: r.job_id,
      sourceType: r.source_type as import("../driver/types").ImportSourceType,
      sourceRef: r.source_ref,
      status: r.status as import("../driver/types").ImportJobStatus,
      progress: r.progress,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      resultDocumentId: r.result_document_id,
      assetId: r.asset_id ?? null,
      documentVersionId: r.document_version_id ?? null,
      dedupeHit: r.dedupe_hit === null ? null : Boolean(r.dedupe_hit),
      attemptCount: r.attempt_count ?? 0,
      nextRetryAt: r.next_retry_at ?? null,
      parserVersion: r.parser_version ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async getImportJobBySource(
    sourceType: import("../driver/types").ImportSourceType,
    sourceRef: string
  ): Promise<import("../driver/types").ImportJobRow | null> {
    const rows = execSql<{
      job_id: string;
      source_type: string;
      source_ref: string;
      status: string;
      progress: number | null;
      error_code: string | null;
      error_message: string | null;
      result_document_id: string | null;
      asset_id: string | null;
      document_version_id: string | null;
      dedupe_hit: number | null;
      attempt_count: number | null;
      next_retry_at: number | null;
      parser_version: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM import_jobs WHERE source_type = ? AND source_ref = ?", [
      sourceType,
      sourceRef,
    ]);
    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      jobId: r.job_id,
      sourceType: r.source_type as import("../driver/types").ImportSourceType,
      sourceRef: r.source_ref,
      status: r.status as import("../driver/types").ImportJobStatus,
      progress: r.progress,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      resultDocumentId: r.result_document_id,
      assetId: r.asset_id ?? null,
      documentVersionId: r.document_version_id ?? null,
      dedupeHit: r.dedupe_hit === null ? null : Boolean(r.dedupe_hit),
      attemptCount: r.attempt_count ?? 0,
      nextRetryAt: r.next_retry_at ?? null,
      parserVersion: r.parser_version ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async batch<T>(ops: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];
    for (const op of ops) {
      results.push(await op());
    }
    return results;
  },

  async transaction<T>(
    fn: (tx: import("../driver/types").DbTransaction) => Promise<T>
  ): Promise<T> {
    if (!db) {
      throw new Error("Database not initialized");
    }

    execStatement("BEGIN TRANSACTION");
    try {
      const tx: import("../driver/types").DbTransaction = {
        upsertDocument: (doc) => driver.upsertDocument(doc),
        appendUpdate: (update) => driver.appendUpdate(update),
        upsertAnnotation: (ann) => driver.upsertAnnotation(ann),
        enqueueOutbox: (item) => driver.enqueueOutbox(item),
      };
      const result = await fn(tx);
      execStatement("COMMIT");
      return result;
    } catch (err) {
      execStatement("ROLLBACK");
      throw err;
    }
  },

  // --- Raw Asset operations ---
  async createRawAsset(asset: import("../driver/types").RawAssetRow): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO raw_assets (asset_id, asset_hash, byte_size, mime_type, source_type, source_ref, storage_provider, storage_path, parser_hint, ingest_meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.assetId,
        asset.assetHash,
        asset.byteSize,
        asset.mimeType,
        asset.sourceType,
        asset.sourceRef,
        asset.storageProvider,
        asset.storagePath,
        asset.parserHint,
        asset.ingestMetaJson,
        asset.createdAt ?? now,
      ]
    );
  },

  async getRawAssetByHash(
    assetHash: string
  ): Promise<import("../driver/types").RawAssetRow | null> {
    const rows = execSql<{
      asset_id: string;
      asset_hash: string;
      byte_size: number;
      mime_type: string;
      source_type: string;
      source_ref: string;
      storage_provider: string;
      storage_path: string;
      parser_hint: string | null;
      ingest_meta_json: string | null;
      created_at: number;
    }>("SELECT * FROM raw_assets WHERE asset_hash = ?", [assetHash]);
    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      assetId: r.asset_id,
      assetHash: r.asset_hash,
      byteSize: r.byte_size,
      mimeType: r.mime_type,
      sourceType: r.source_type as import("../driver/types").ImportSourceType,
      sourceRef: r.source_ref,
      storageProvider: r.storage_provider as "opfs" | "idb",
      storagePath: r.storage_path,
      parserHint: r.parser_hint,
      ingestMetaJson: r.ingest_meta_json,
      createdAt: r.created_at,
    };
  },

  async deleteImportJob(jobId: string): Promise<void> {
    execStatement("DELETE FROM import_jobs WHERE job_id = ?", [jobId]);
  },

  async linkDocumentAsset(documentId: string, assetId: string, role = "primary"): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT OR REPLACE INTO document_assets (document_id, asset_id, role, created_at)
       VALUES (?, ?, ?, ?)`,
      [documentId, assetId, role, now]
    );
  },

  async listDocuments(options?: ListDocumentsOptions): Promise<DocumentRow[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? "updatedAt";
    const order = options?.order ?? "desc";
    const savedOnly = options?.savedOnly ?? false;

    // Map camelCase field names to snake_case column names
    const columnMap: Record<string, string> = {
      updatedAt: "updated_at",
      createdAt: "created_at",
      title: "title",
      savedAt: "saved_at",
    };

    // For saved documents, default to ordering by saved_at DESC
    const effectiveOrderBy = savedOnly && orderBy === "updatedAt" ? "savedAt" : orderBy;
    const orderColumn = columnMap[effectiveOrderBy] ?? "updated_at";
    const orderDir = order === "asc" ? "ASC" : "DESC";

    let sql = `SELECT doc_id, title, created_at, updated_at, active_policy_id, head_frontier, saved_at
       FROM documents`;
    const params: unknown[] = [];

    if (savedOnly) {
      sql += " WHERE saved_at IS NOT NULL";
    }

    sql += ` ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = execSql<{
      doc_id: string;
      title: string | null;
      created_at: number;
      updated_at: number;
      active_policy_id: string | null;
      head_frontier: Uint8Array | null;
      saved_at: number | null;
    }>(sql, params);

    return rows.map((row) => ({
      docId: row.doc_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activePolicyId: row.active_policy_id,
      headFrontier: row.head_frontier,
      savedAt: row.saved_at,
    }));
  },

  // --- RSS Subscription operations ---
  async listRssSubscriptions(
    options?: import("../driver/types").ListRssSubscriptionsOptions
  ): Promise<import("../driver/types").RssSubscriptionRow[]> {
    let sql = "SELECT * FROM rss_subscriptions WHERE 1=1";
    const params: unknown[] = [];

    if (options?.enabled !== undefined) {
      sql += " AND enabled = ?";
      params.push(options.enabled ? 1 : 0);
    }
    if (options?.folderId !== undefined) {
      sql += " AND folder_id = ?";
      params.push(options.folderId);
    }
    if (options?.status !== undefined) {
      sql += " AND status = ?";
      params.push(options.status);
    }
    sql += " ORDER BY created_at DESC";

    const rows = execSql<{
      subscription_id: string;
      url: string;
      title: string | null;
      display_name: string | null;
      site_url: string | null;
      folder_id: string | null;
      enabled: number;
      last_fetched_at: number | null;
      status: string;
      error_message: string | null;
      etag: string | null;
      last_modified: string | null;
      created_at: number;
      updated_at: number;
    }>(sql, params);

    return rows.map((r) => ({
      subscriptionId: r.subscription_id,
      url: r.url,
      title: r.title,
      displayName: r.display_name,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      enabled: Boolean(r.enabled),
      lastFetchedAt: r.last_fetched_at,
      status: r.status as "ok" | "error",
      errorMessage: r.error_message,
      etag: r.etag,
      lastModified: r.last_modified,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async getRssSubscription(
    subscriptionId: string
  ): Promise<import("../driver/types").RssSubscriptionRow | null> {
    const rows = execSql<{
      subscription_id: string;
      url: string;
      title: string | null;
      display_name: string | null;
      site_url: string | null;
      folder_id: string | null;
      enabled: number;
      last_fetched_at: number | null;
      status: string;
      error_message: string | null;
      etag: string | null;
      last_modified: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM rss_subscriptions WHERE subscription_id = ?", [subscriptionId]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      subscriptionId: r.subscription_id,
      url: r.url,
      title: r.title,
      displayName: r.display_name,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      enabled: Boolean(r.enabled),
      lastFetchedAt: r.last_fetched_at,
      status: r.status as "ok" | "error",
      errorMessage: r.error_message,
      etag: r.etag,
      lastModified: r.last_modified,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async updateRssSubscription(
    subscriptionId: string,
    updates: Partial<
      Pick<
        import("../driver/types").RssSubscriptionRow,
        "lastFetchedAt" | "status" | "errorMessage" | "etag" | "lastModified"
      >
    >
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.lastFetchedAt !== undefined) {
      sets.push("last_fetched_at = ?");
      values.push(updates.lastFetchedAt);
    }
    if (updates.status !== undefined) {
      sets.push("status = ?");
      values.push(updates.status);
    }
    if (updates.errorMessage !== undefined) {
      sets.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    if (updates.etag !== undefined) {
      sets.push("etag = ?");
      values.push(updates.etag);
    }
    if (updates.lastModified !== undefined) {
      sets.push("last_modified = ?");
      values.push(updates.lastModified);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(subscriptionId);

    execStatement(
      `UPDATE rss_subscriptions SET ${sets.join(", ")} WHERE subscription_id = ?`,
      values
    );
  },

  // --- Feed Item operations ---
  async getFeedItemByGuid(
    subscriptionId: string,
    guid: string
  ): Promise<import("../driver/types").FeedItemRow | null> {
    const rows = execSql<{
      item_id: string;
      subscription_id: string;
      guid: string | null;
      title: string | null;
      link: string | null;
      author: string | null;
      published_at: number | null;
      content_html: string | null;
      excerpt: string | null;
      read_state: string;
      saved: number;
      document_id: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM feed_items WHERE subscription_id = ? AND guid = ?", [subscriptionId, guid]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      itemId: r.item_id,
      subscriptionId: r.subscription_id,
      guid: r.guid,
      title: r.title,
      link: r.link,
      author: r.author,
      publishedAt: r.published_at,
      contentHtml: r.content_html,
      excerpt: r.excerpt,
      readState: r.read_state as "unread" | "read",
      saved: Boolean(r.saved),
      documentId: r.document_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async createFeedItem(
    item: Omit<import("../driver/types").FeedItemRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO feed_items (item_id, subscription_id, guid, title, link, author, published_at, content_html, excerpt, read_state, saved, document_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.itemId,
        item.subscriptionId,
        item.guid,
        item.title,
        item.link,
        item.author,
        item.publishedAt,
        item.contentHtml,
        item.excerpt,
        item.readState,
        item.saved ? 1 : 0,
        item.documentId,
        now,
        now,
      ]
    );
  },

  async updateFeedItem(
    itemId: string,
    updates: Partial<
      Pick<
        import("../driver/types").FeedItemRow,
        "readState" | "saved" | "documentId" | "contentHtml"
      >
    >
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.readState !== undefined) {
      sets.push("read_state = ?");
      values.push(updates.readState);
    }
    if (updates.saved !== undefined) {
      sets.push("saved = ?");
      values.push(updates.saved ? 1 : 0);
    }
    if (updates.documentId !== undefined) {
      sets.push("document_id = ?");
      values.push(updates.documentId);
    }
    if (updates.contentHtml !== undefined) {
      sets.push("content_html = ?");
      values.push(updates.contentHtml);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(itemId);

    execStatement(`UPDATE feed_items SET ${sets.join(", ")} WHERE item_id = ?`, values);
  },

  async listFeedItems(
    options?: import("../driver/types").ListFeedItemsOptions
  ): Promise<import("../driver/types").FeedItemRow[]> {
    let sql = "SELECT f.* FROM feed_items f";
    const params: unknown[] = [];

    if (options?.topicId) {
      sql += " INNER JOIN subscription_topics st ON f.subscription_id = st.subscription_id";
    }

    sql += " WHERE 1=1";

    if (options?.topicId) {
      sql += " AND st.topic_id = ?";
      params.push(options.topicId);
    }

    if (options?.subscriptionId) {
      sql += " AND f.subscription_id = ?";
      params.push(options.subscriptionId);
    }
    if (options?.readState) {
      sql += " AND f.read_state = ?";
      params.push(options.readState);
    }
    if (options?.saved !== undefined) {
      sql += " AND f.saved = ?";
      params.push(options.saved ? 1 : 0);
    }

    sql += " ORDER BY f.published_at DESC";

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const rows = execSql<{
      item_id: string;
      subscription_id: string;
      guid: string | null;
      title: string | null;
      link: string | null;
      author: string | null;
      published_at: number | null;
      content_html: string | null;
      excerpt: string | null;
      read_state: string;
      saved: number;
      document_id: string | null;
      created_at: number;
      updated_at: number;
    }>(sql, params);

    return rows.map((r) => ({
      itemId: r.item_id,
      subscriptionId: r.subscription_id,
      guid: r.guid,
      title: r.title,
      link: r.link,
      author: r.author,
      publishedAt: r.published_at,
      contentHtml: r.content_html,
      excerpt: r.excerpt,
      readState: r.read_state as "unread" | "read",
      saved: Boolean(r.saved),
      documentId: r.document_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async countUnreadFeedItems(subscriptionId?: string): Promise<number> {
    let sql = "SELECT COUNT(*) as count FROM feed_items WHERE read_state = 'unread'";
    const params: unknown[] = [];

    if (subscriptionId) {
      sql += " AND subscription_id = ?";
      params.push(subscriptionId);
    }

    const rows = execSql<{ count: number }>(sql, params);
    return rows[0]?.count ?? 0;
  },

  async createRssSubscription(
    subscription: Omit<import("../driver/types").RssSubscriptionRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO rss_subscriptions (
        subscription_id, url, title, display_name, site_url, folder_id, enabled,
        last_fetched_at, status, error_message, etag, last_modified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscription.subscriptionId,
        subscription.url,
        subscription.title,
        subscription.displayName,
        subscription.siteUrl,
        subscription.folderId,
        subscription.enabled ? 1 : 0,
        subscription.lastFetchedAt,
        subscription.status,
        subscription.errorMessage,
        subscription.etag,
        subscription.lastModified,
        now,
        now,
      ]
    );
  },

  async getRssSubscriptionByUrl(
    url: string
  ): Promise<import("../driver/types").RssSubscriptionRow | null> {
    const rows = execSql<{
      subscription_id: string;
      url: string;
      title: string | null;
      display_name: string | null;
      site_url: string | null;
      folder_id: string | null;
      enabled: number;
      last_fetched_at: number | null;
      status: string;
      error_message: string | null;
      etag: string | null;
      last_modified: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM rss_subscriptions WHERE url = ?", [url]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      subscriptionId: r.subscription_id,
      url: r.url,
      title: r.title,
      displayName: r.display_name,
      siteUrl: r.site_url,
      folderId: r.folder_id,
      enabled: Boolean(r.enabled),
      lastFetchedAt: r.last_fetched_at,
      status: r.status as "ok" | "error",
      errorMessage: r.error_message,
      etag: r.etag,
      lastModified: r.last_modified,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async deleteRssSubscription(subscriptionId: string): Promise<void> {
    // Feed items are deleted via ON DELETE CASCADE in the schema
    execStatement("DELETE FROM rss_subscriptions WHERE subscription_id = ?", [subscriptionId]);
  },

  // --- Content Item operations ---
  async upsertContentItem(item: import("../driver/types").ContentItemRow): Promise<void> {
    execStatement(
      `INSERT INTO content_items (
        item_id, source, source_url, feed_id, title, content, snippet, author,
        published_at, ingested_at, topics_json, canonical_hash, word_count, has_full_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        source = excluded.source,
        source_url = excluded.source_url,
        feed_id = excluded.feed_id,
        title = excluded.title,
        content = excluded.content,
        snippet = excluded.snippet,
        author = excluded.author,
        published_at = excluded.published_at,
        ingested_at = excluded.ingested_at,
        topics_json = excluded.topics_json,
        canonical_hash = excluded.canonical_hash,
        word_count = excluded.word_count,
        has_full_text = excluded.has_full_text`,
      [
        item.itemId,
        item.source,
        item.sourceUrl,
        item.feedId,
        item.title,
        item.content,
        item.snippet,
        item.author,
        item.publishedAt,
        item.ingestedAt,
        item.topicsJson,
        item.canonicalHash,
        item.wordCount,
        item.hasFullText ? 1 : 0,
      ]
    );
  },

  async getContentItem(itemId: string): Promise<import("../driver/types").ContentItemRow | null> {
    const rows = execSql<{
      item_id: string;
      source: string;
      source_url: string | null;
      feed_id: string | null;
      title: string;
      content: string;
      snippet: string | null;
      author: string | null;
      published_at: number | null;
      ingested_at: number;
      topics_json: string;
      canonical_hash: string;
      word_count: number;
      has_full_text: number;
    }>("SELECT * FROM content_items WHERE item_id = ?", [itemId]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      itemId: r.item_id,
      source: r.source as import("../driver/types").ContentSource,
      sourceUrl: r.source_url,
      feedId: r.feed_id,
      title: r.title,
      content: r.content,
      snippet: r.snippet,
      author: r.author,
      publishedAt: r.published_at,
      ingestedAt: r.ingested_at,
      topicsJson: r.topics_json,
      canonicalHash: r.canonical_hash,
      wordCount: r.word_count,
      hasFullText: Boolean(r.has_full_text),
    };
  },

  async getContentItemByHash(
    canonicalHash: string
  ): Promise<import("../driver/types").ContentItemRow | null> {
    const rows = execSql<{
      item_id: string;
      source: string;
      source_url: string | null;
      feed_id: string | null;
      title: string;
      content: string;
      snippet: string | null;
      author: string | null;
      published_at: number | null;
      ingested_at: number;
      topics_json: string;
      canonical_hash: string;
      word_count: number;
      has_full_text: number;
    }>("SELECT * FROM content_items WHERE canonical_hash = ?", [canonicalHash]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      itemId: r.item_id,
      source: r.source as import("../driver/types").ContentSource,
      sourceUrl: r.source_url,
      feedId: r.feed_id,
      title: r.title,
      content: r.content,
      snippet: r.snippet,
      author: r.author,
      publishedAt: r.published_at,
      ingestedAt: r.ingested_at,
      topicsJson: r.topics_json,
      canonicalHash: r.canonical_hash,
      wordCount: r.word_count,
      hasFullText: Boolean(r.has_full_text),
    };
  },

  async listContentItems(
    options?: import("../driver/types").ListContentItemsOptions
  ): Promise<import("../driver/types").ContentItemRow[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.startTime !== undefined) {
      conditions.push("ingested_at >= ?");
      params.push(options.startTime);
    }
    if (options?.endTime !== undefined) {
      conditions.push("ingested_at < ?");
      params.push(options.endTime);
    }
    if (options?.source !== undefined) {
      conditions.push("source = ?");
      params.push(options.source);
    }
    if (options?.feedId !== undefined) {
      conditions.push("feed_id = ?");
      params.push(options.feedId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = execSql<{
      item_id: string;
      source: string;
      source_url: string | null;
      feed_id: string | null;
      title: string;
      content: string;
      snippet: string | null;
      author: string | null;
      published_at: number | null;
      ingested_at: number;
      topics_json: string;
      canonical_hash: string;
      word_count: number;
      has_full_text: number;
    }>(`SELECT * FROM content_items ${whereClause} ORDER BY ingested_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);

    return rows.map((r) => ({
      itemId: r.item_id,
      source: r.source as import("../driver/types").ContentSource,
      sourceUrl: r.source_url,
      feedId: r.feed_id,
      title: r.title,
      content: r.content,
      snippet: r.snippet,
      author: r.author,
      publishedAt: r.published_at,
      ingestedAt: r.ingested_at,
      topicsJson: r.topics_json,
      canonicalHash: r.canonical_hash,
      wordCount: r.word_count,
      hasFullText: Boolean(r.has_full_text),
    }));
  },

  async deleteContentItem(itemId: string): Promise<void> {
    execStatement("DELETE FROM content_items WHERE item_id = ?", [itemId]);
  },

  // --- Digest operations ---
  async createDigest(
    digest: Omit<import("../driver/types").DigestRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO digests (
        digest_id, user_id, date, title, status, error, source_item_count,
        token_usage_json, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        digest.digestId,
        digest.userId,
        digest.date,
        digest.title,
        digest.status,
        digest.error,
        digest.sourceItemCount,
        digest.tokenUsageJson,
        digest.startedAt,
        digest.completedAt,
        now,
        now,
      ]
    );
  },

  async updateDigest(
    digestId: string,
    updates: Partial<
      Pick<
        import("../driver/types").DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.status !== undefined) {
      sets.push("status = ?");
      values.push(updates.status);
    }
    if (updates.error !== undefined) {
      sets.push("error = ?");
      values.push(updates.error);
    }
    if (updates.sourceItemCount !== undefined) {
      sets.push("source_item_count = ?");
      values.push(updates.sourceItemCount);
    }
    if (updates.tokenUsageJson !== undefined) {
      sets.push("token_usage_json = ?");
      values.push(updates.tokenUsageJson);
    }
    if (updates.startedAt !== undefined) {
      sets.push("started_at = ?");
      values.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      sets.push("completed_at = ?");
      values.push(updates.completedAt);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(digestId);

    execStatement(`UPDATE digests SET ${sets.join(", ")} WHERE digest_id = ?`, values);
  },

  async getDigest(digestId: string): Promise<import("../driver/types").DigestRow | null> {
    const rows = execSql<{
      digest_id: string;
      user_id: string;
      date: string;
      title: string;
      status: string;
      error: string | null;
      source_item_count: number;
      token_usage_json: string | null;
      started_at: number | null;
      completed_at: number | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM digests WHERE digest_id = ?", [digestId]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      digestId: r.digest_id,
      userId: r.user_id,
      date: r.date,
      title: r.title,
      status: r.status as import("../driver/types").DigestStatus,
      error: r.error,
      sourceItemCount: r.source_item_count,
      tokenUsageJson: r.token_usage_json,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async getDigestByDate(
    userId: string,
    date: string
  ): Promise<import("../driver/types").DigestRow | null> {
    const rows = execSql<{
      digest_id: string;
      user_id: string;
      date: string;
      title: string;
      status: string;
      error: string | null;
      source_item_count: number;
      token_usage_json: string | null;
      started_at: number | null;
      completed_at: number | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM digests WHERE user_id = ? AND date = ?", [userId, date]);

    if (rows.length === 0) {
      return null;
    }
    const r = rows[0];
    return {
      digestId: r.digest_id,
      userId: r.user_id,
      date: r.date,
      title: r.title,
      status: r.status as import("../driver/types").DigestStatus,
      error: r.error,
      sourceItemCount: r.source_item_count,
      tokenUsageJson: r.token_usage_json,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async listDigests(
    options: import("../driver/types").ListDigestsOptions
  ): Promise<import("../driver/types").DigestRow[]> {
    const conditions: string[] = ["user_id = ?"];
    const params: (string | number)[] = [options.userId];

    if (options.status !== undefined) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const rows = execSql<{
      digest_id: string;
      user_id: string;
      date: string;
      title: string;
      status: string;
      error: string | null;
      source_item_count: number;
      token_usage_json: string | null;
      started_at: number | null;
      completed_at: number | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM digests WHERE ${conditions.join(" AND ")} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return rows.map((r) => ({
      digestId: r.digest_id,
      userId: r.user_id,
      date: r.date,
      title: r.title,
      status: r.status as import("../driver/types").DigestStatus,
      error: r.error,
      sourceItemCount: r.source_item_count,
      tokenUsageJson: r.token_usage_json,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async deleteDigest(digestId: string): Promise<void> {
    // Cards are deleted via ON DELETE CASCADE
    execStatement("DELETE FROM digests WHERE digest_id = ?", [digestId]);
  },

  // --- Digest Card operations ---
  async createDigestCard(card: import("../driver/types").DigestCardRow): Promise<void> {
    execStatement(
      `INSERT INTO digest_cards (
        card_id, digest_id, card_type, headline, summary, why_it_matters,
        confidence, priority_score, topics_json, citations_json, order_index, generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.cardId,
        card.digestId,
        card.cardType,
        card.headline,
        card.summary,
        card.whyItMatters,
        card.confidence,
        card.priorityScore,
        card.topicsJson,
        card.citationsJson,
        card.orderIndex,
        card.generatedAt,
      ]
    );
  },

  async listDigestCards(digestId: string): Promise<import("../driver/types").DigestCardRow[]> {
    const rows = execSql<{
      card_id: string;
      digest_id: string;
      card_type: string;
      headline: string;
      summary: string;
      why_it_matters: string | null;
      confidence: string;
      priority_score: number;
      topics_json: string;
      citations_json: string;
      order_index: number;
      generated_at: number;
    }>("SELECT * FROM digest_cards WHERE digest_id = ? ORDER BY order_index", [digestId]);

    return rows.map((r) => ({
      cardId: r.card_id,
      digestId: r.digest_id,
      cardType: r.card_type as import("../driver/types").DigestCardType,
      headline: r.headline,
      summary: r.summary,
      whyItMatters: r.why_it_matters,
      confidence: r.confidence as import("../driver/types").ConfidenceLevel,
      priorityScore: r.priority_score,
      topicsJson: r.topics_json,
      citationsJson: r.citations_json,
      orderIndex: r.order_index,
      generatedAt: r.generated_at,
    }));
  },

  async linkCardSource(cardId: string, sourceItemId: string, sourceType: string): Promise<void> {
    execStatement(
      `INSERT OR IGNORE INTO digest_card_sources (card_id, source_item_id, source_type, added_at)
       VALUES (?, ?, ?, ?)`,
      [cardId, sourceItemId, sourceType, Date.now()]
    );
  },

  async getCardSourceIds(cardId: string): Promise<string[]> {
    const rows = execSql<{ source_item_id: string }>(
      "SELECT source_item_id FROM digest_card_sources WHERE card_id = ?",
      [cardId]
    );
    return rows.map((r) => r.source_item_id);
  },

  // --- Brief operations ---
  async createBrief(
    brief: Omit<import("../driver/types").BriefRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    const now = Date.now();
    execStatement(
      `INSERT INTO briefs (brief_id, title, description, cover_image_url, is_public, owner_id, document_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        brief.briefId,
        brief.title,
        brief.description,
        brief.coverImageUrl,
        brief.isPublic ? 1 : 0,
        brief.ownerId,
        brief.documentId,
        now,
        now,
      ]
    );
  },

  async updateBrief(
    briefId: string,
    updates: Partial<
      Pick<
        import("../driver/types").BriefRow,
        "title" | "description" | "coverImageUrl" | "isPublic" | "documentId"
      >
    >
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      sets.push("title = ?");
      params.push(updates.title);
    }
    if (updates.description !== undefined) {
      sets.push("description = ?");
      params.push(updates.description);
    }
    if (updates.coverImageUrl !== undefined) {
      sets.push("cover_image_url = ?");
      params.push(updates.coverImageUrl);
    }
    if (updates.isPublic !== undefined) {
      sets.push("is_public = ?");
      params.push(updates.isPublic ? 1 : 0);
    }
    if (updates.documentId !== undefined) {
      sets.push("document_id = ?");
      params.push(updates.documentId);
    }

    if (sets.length === 0) {
      return;
    }

    sets.push("updated_at = ?");
    params.push(Date.now());
    params.push(briefId);

    execStatement(`UPDATE briefs SET ${sets.join(", ")} WHERE brief_id = ?`, params);
  },

  async getBrief(briefId: string): Promise<import("../driver/types").BriefRow | null> {
    const rows = execSql<{
      brief_id: string;
      title: string;
      description: string | null;
      cover_image_url: string | null;
      is_public: number;
      owner_id: string;
      document_id: string | null;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM briefs WHERE brief_id = ?", [briefId]);

    if (rows.length === 0) {
      return null;
    }

    const r = rows[0];
    return {
      briefId: r.brief_id,
      title: r.title,
      description: r.description,
      coverImageUrl: r.cover_image_url,
      isPublic: r.is_public === 1,
      ownerId: r.owner_id,
      documentId: r.document_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  async listBriefs(
    options?: import("../driver/types").ListBriefsOptions
  ): Promise<import("../driver/types").BriefRow[]> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.ownerId) {
      conditions.push("owner_id = ?");
      params.push(options.ownerId);
    }
    if (options?.isPublic !== undefined) {
      conditions.push("is_public = ?");
      params.push(options.isPublic ? 1 : 0);
    }

    let sql = "SELECT * FROM briefs";
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
    sql += " ORDER BY updated_at DESC";

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
    }

    const rows = execSql<{
      brief_id: string;
      title: string;
      description: string | null;
      cover_image_url: string | null;
      is_public: number;
      owner_id: string;
      document_id: string | null;
      created_at: number;
      updated_at: number;
    }>(sql, params);

    return rows.map((r) => ({
      briefId: r.brief_id,
      title: r.title,
      description: r.description,
      coverImageUrl: r.cover_image_url,
      isPublic: r.is_public === 1,
      ownerId: r.owner_id,
      documentId: r.document_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async deleteBrief(briefId: string): Promise<void> {
    execStatement("DELETE FROM briefs WHERE brief_id = ?", [briefId]);
  },

  // --- Brief Item operations ---
  async addBriefItem(item: import("../driver/types").BriefItemRow): Promise<void> {
    execStatement(
      `INSERT INTO brief_items (brief_id, item_id, item_type, title, source_url, excerpt, note, order_index, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.briefId,
        item.itemId,
        item.itemType,
        item.title,
        item.sourceUrl,
        item.excerpt,
        item.note,
        item.orderIndex,
        item.addedAt,
      ]
    );
  },

  async updateBriefItem(
    briefId: string,
    itemId: string,
    updates: Partial<Pick<import("../driver/types").BriefItemRow, "note" | "orderIndex">>
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.note !== undefined) {
      sets.push("note = ?");
      params.push(updates.note);
    }
    if (updates.orderIndex !== undefined) {
      sets.push("order_index = ?");
      params.push(updates.orderIndex);
    }

    if (sets.length === 0) {
      return;
    }

    params.push(briefId);
    params.push(itemId);

    execStatement(
      `UPDATE brief_items SET ${sets.join(", ")} WHERE brief_id = ? AND item_id = ?`,
      params
    );
  },

  async removeBriefItem(briefId: string, itemId: string): Promise<void> {
    execStatement("DELETE FROM brief_items WHERE brief_id = ? AND item_id = ?", [briefId, itemId]);
  },

  async listBriefItems(briefId: string): Promise<import("../driver/types").BriefItemRow[]> {
    const rows = execSql<{
      brief_id: string;
      item_id: string;
      item_type: string;
      title: string;
      source_url: string | null;
      excerpt: string | null;
      note: string | null;
      order_index: number;
      added_at: number;
    }>("SELECT * FROM brief_items WHERE brief_id = ? ORDER BY order_index", [briefId]);

    return rows.map((r) => ({
      briefId: r.brief_id,
      itemId: r.item_id,
      itemType: r.item_type as import("../driver/types").BriefItemType,
      title: r.title,
      sourceUrl: r.source_url,
      excerpt: r.excerpt,
      note: r.note,
      orderIndex: r.order_index,
      addedAt: r.added_at,
    }));
  },
};

export { handleWorkerRequest } from "./rpcHandler";
export type {
  WorkerEvent,
  WorkerIncomingMessage,
  WorkerMessage,
  WorkerRequest,
  WorkerResponse,
} from "./rpcTypes";

const workerScope: typeof self | undefined = typeof self !== "undefined" ? self : undefined;

if (workerScope) {
  // Lazy load ImportManager to avoid circular dependencies during initial load
  let importManager: import("../import/ImportManager").ImportManager | undefined;

  // Initialize ImportManager when DB is initialized
  const initImportManager = async () => {
    if (importManager) {
      return importManager;
    }

    // Dynamically import dependencies
    const { ImportManager } = await import("../import/ImportManager");
    const { createUrlIngestor } = await import("../import/ingestors/urlIngestor");
    const { createFileIngestor } = await import("../import/ingestors/fileIngestor");
    const { createRssIngestor } = await import("../import/ingestors/rssIngestor");
    const { createYouTubeIngestor } = await import("../import/ingestors/youtubeIngestor");
    // Feature flags (injected at build time by Next.js)
    const readBooleanFlag = (value: string | undefined, fallback: boolean): boolean => {
      if (value === undefined) {
        return fallback;
      }
      return value.toLowerCase() === "true";
    };

    const importFeatureFlags = {
      url: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_URL_ENABLED, false),
      rss: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_RSS_ENABLED, false),
      youtube: readBooleanFlag(process.env.NEXT_PUBLIC_IMPORT_YOUTUBE_ENABLED, false),
    };

    importManager = new ImportManager(driver as unknown as DbDriver, {
      concurrency: 2,
    });

    // Register ingestors conditionally
    importManager.registerIngestor("file", createFileIngestor());

    if (importFeatureFlags.url) {
      importManager.registerIngestor("url", createUrlIngestor({}));
    }
    if (importFeatureFlags.rss) {
      importManager.registerIngestor(
        "rss",
        createRssIngestor({ db: driver as unknown as DbDriver })
      );
    }
    if (importFeatureFlags.youtube) {
      importManager.registerIngestor("youtube", createYouTubeIngestor({}));
    }

    // Hook up events to postMessage
    importManager.on("onJobProgress", (jobId, progress) => {
      workerScope?.postMessage({
        type: "event",
        event: { type: "onJobProgress", jobId, progress },
      });
    });
    importManager.on("onJobStatusChange", (jobId, status) => {
      workerScope?.postMessage({
        type: "event",
        event: { type: "onJobStatusChange", jobId, status },
      });
    });
    importManager.on("onJobComplete", (jobId, documentId) => {
      workerScope?.postMessage({
        type: "event",
        event: { type: "onJobComplete", jobId, documentId },
      });
    });
    importManager.on("onJobFailed", (jobId, error) => {
      workerScope?.postMessage({
        type: "event",
        event: { type: "onJobFailed", jobId, error: error.message },
      });
    });

    // Auto-resume pending jobs after initialization
    // This ensures jobs interrupted by page reload continue processing
    await importManager.resume();

    return importManager;
  };

  workerScope.onmessage = async (event: MessageEvent<{ id: number; request: WorkerRequest }>) => {
    const { id, request } = event.data;

    if (request.type === "init") {
      await initImportManager();
    }

    // Ensure ImportManager is resumed if we receive resume request
    // (Actual resume handles idempotent calls)

    const response = await handleWorkerRequest(request, driver, importManager);
    workerScope.postMessage({ id, response });
  };
}
