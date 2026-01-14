/**
 * DB Client - Main thread interface to the DB Worker.
 * This is the primary public API for consumers of @ku0/db.
 */
import { IndexedDbDriver } from "./driver/idb-dexie/index";
import type {
  AnnotationRow,
  CrdtUpdateRow,
  DbDriver,
  DbInitResult,
  DocumentRow,
  ListAnnotationsOptions,
  ListUpdatesOptions,
  OutboxRow,
} from "./driver/types";
import type { LeaderChangeCallback, LeaderElectionResult } from "./leaderElection";
import { acquireLeadership } from "./leaderElection";
import type { WorkerRequest, WorkerResponse } from "./worker/index";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

/**
 * Worker-based Client for SQLite/OPFS.
 */
export class WorkerDbClient implements DbDriver {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private initPromise: Promise<DbInitResult> | null = null;
  private eventListeners: Set<(event: import("./worker/index").WorkerEvent) => void> = new Set();

  constructor(private workerUrl: string | URL) {}

  /**
   * Register a listener for worker events (push notifications).
   */
  public onEvent(callback: (event: import("./worker/index").WorkerEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private sendRequest<T>(request: WorkerRequest): Promise<T> {
    const worker = this.worker;
    if (!worker) {
      throw new Error("WorkerDbClient not initialized. Call init() first.");
    }

    const id = ++this.requestId;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.postMessage({ id, request });
    });
  }

  private handleMessage = (
    event: MessageEvent<{
      id?: number;
      response?: WorkerResponse;
      type?: string;
      event?: import("./worker/index").WorkerEvent;
    }>
  ) => {
    const data = event.data;

    // Handle push events (no ID)
    if (data.type === "event" && data.event) {
      for (const listener of this.eventListeners) {
        listener(data.event);
      }
      return;
    }

    // Handle RPC responses
    if (data.id && data.response) {
      const { id, response } = data;
      const pending = this.pendingRequests.get(id);

      if (pending) {
        this.pendingRequests.delete(id);
        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error));
        }
      }
    }
  };

  async init(): Promise<DbInitResult> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const start = performance.now();

    this.initPromise = (async () => {
      this.worker = new Worker(this.workerUrl, { type: "module" });
      this.worker.onmessage = this.handleMessage;
      this.worker.onerror = (err) => {
        const reason = err instanceof ErrorEvent ? err.message : "Worker error";
        this.rejectAllPending(new Error(`[WorkerDbClient] ${reason}`));
      };
      this.worker.onmessageerror = () => {
        this.rejectAllPending(new Error("[WorkerDbClient] failed to deserialize worker message"));
      };

      const workerInit = await this.sendRequest<DbInitResult>({ type: "init" });

      return { ...workerInit, initTimeMs: performance.now() - start };
    })();

    return this.initPromise;
  }

  async close(): Promise<void> {
    if (!this.worker) {
      return;
    }
    await this.sendRequest<void>({ type: "close" });
    this.worker.terminate();
    this.worker = null;
    this.initPromise = null;
  }

  async getDocument(docId: string): Promise<DocumentRow | null> {
    return this.sendRequest<DocumentRow | null>({ type: "getDocument", docId });
  }

  async upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void> {
    return this.sendRequest<void>({ type: "upsertDocument", doc });
  }

  async deleteDocument(docId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteDocument", docId });
  }

  async updateDocumentTitle(docId: string, title: string): Promise<void> {
    return this.sendRequest<void>({ type: "updateDocumentTitle", docId, title });
  }

  async createTopic(
    topic: Omit<import("./driver/types").TopicRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createTopic", topic });
  }

  async listTopics(
    options?: import("./driver/types").ListTopicsOptions
  ): Promise<import("./driver/types").TopicRow[]> {
    return this.sendRequest<import("./driver/types").TopicRow[]>({ type: "listTopics", options });
  }

  async updateTopic(
    topicId: string,
    updates: Partial<Pick<import("./driver/types").TopicRow, "name" | "description" | "color">>
  ): Promise<void> {
    return this.sendRequest<void>({ type: "updateTopic", topicId, updates });
  }

  async deleteTopic(topicId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteTopic", topicId });
  }

  async getTopic(topicId: string): Promise<import("./driver/types").TopicRow | null> {
    return this.sendRequest<import("./driver/types").TopicRow | null>({
      type: "getTopic",
      topicId,
    });
  }

  async addDocumentToTopic(documentId: string, topicId: string): Promise<void> {
    return this.sendRequest<void>({ type: "addDocumentToTopic", documentId, topicId });
  }

  async removeDocumentFromTopic(documentId: string, topicId: string): Promise<void> {
    return this.sendRequest<void>({ type: "removeDocumentFromTopic", documentId, topicId });
  }

  async listDocumentsByTopic(
    topicId: string,
    options?: import("./driver/types").ListDocumentsOptions
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.sendRequest<import("./driver/types").DocumentRow[]>({
      type: "listDocumentsByTopic",
      topicId,
      options,
    });
  }

  async listTopicsByDocument(documentId: string): Promise<import("./driver/types").TopicRow[]> {
    return this.sendRequest<import("./driver/types").TopicRow[]>({
      type: "listTopicsByDocument",
      documentId,
    });
  }

  async addSubscriptionToTopic(subscriptionId: string, topicId: string): Promise<void> {
    return this.sendRequest<void>({ type: "addSubscriptionToTopic", subscriptionId, topicId });
  }

  async removeSubscriptionFromTopic(subscriptionId: string, topicId: string): Promise<void> {
    return this.sendRequest<void>({ type: "removeSubscriptionFromTopic", subscriptionId, topicId });
  }

  async listSubscriptionsByTopic(
    topicId: string
  ): Promise<import("./driver/types").RssSubscriptionRow[]> {
    return this.sendRequest<import("./driver/types").RssSubscriptionRow[]>({
      type: "listSubscriptionsByTopic",
      topicId,
    });
  }

  async listTopicsBySubscription(
    subscriptionId: string
  ): Promise<import("./driver/types").TopicRow[]> {
    return this.sendRequest<import("./driver/types").TopicRow[]>({
      type: "listTopicsBySubscription",
      subscriptionId,
    });
  }

  async appendUpdate(update: CrdtUpdateRow): Promise<void> {
    return this.sendRequest<void>({ type: "appendUpdate", update });
  }

  async listUpdates(options: ListUpdatesOptions): Promise<CrdtUpdateRow[]> {
    return this.sendRequest<CrdtUpdateRow[]>({ type: "listUpdates", options });
  }

  async getAnnotation(annotationId: string): Promise<AnnotationRow | null> {
    return this.sendRequest<AnnotationRow | null>({ type: "getAnnotation", annotationId });
  }

  async upsertAnnotation(annotation: AnnotationRow): Promise<void> {
    return this.sendRequest<void>({ type: "upsertAnnotation", annotation });
  }

  async listAnnotations(options: ListAnnotationsOptions): Promise<AnnotationRow[]> {
    return this.sendRequest<AnnotationRow[]>({ type: "listAnnotations", options });
  }

  async enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "enqueueOutbox", item });
  }

  async claimOutboxItems(limit: number): Promise<OutboxRow[]> {
    return this.sendRequest<OutboxRow[]>({ type: "claimOutboxItems", limit });
  }

  async ackOutboxItem(outboxId: string): Promise<void> {
    return this.sendRequest<void>({ type: "ackOutboxItem", outboxId });
  }

  async failOutboxItem(outboxId: string, nextRetryAt: number): Promise<void> {
    return this.sendRequest<void>({ type: "failOutboxItem", outboxId, nextRetryAt });
  }

  async healthCheck(): Promise<import("./driver/types").DbHealthInfo> {
    return this.sendRequest<import("./driver/types").DbHealthInfo>({ type: "healthCheck" });
  }

  async reset(): Promise<void> {
    return this.sendRequest<void>({ type: "reset" });
  }

  async batch<T>(ops: Array<() => Promise<T>>): Promise<T[]> {
    // Execute sequentially - worker handles actual batching
    const results: T[] = [];
    for (const op of ops) {
      results.push(await op());
    }
    return results;
  }

  async transaction<T>(fn: (tx: import("./driver/types").DbTransaction) => Promise<T>): Promise<T> {
    // For worker client, we execute the transaction function locally
    // The underlying driver calls go through the worker
    const tx: import("./driver/types").DbTransaction = {
      upsertDocument: (doc) => this.upsertDocument(doc),
      appendUpdate: (update) => this.appendUpdate(update),
      upsertAnnotation: (ann) => this.upsertAnnotation(ann),
      enqueueOutbox: (item) => this.enqueueOutbox(item),
    };
    return fn(tx);
  }

  async createImportJob(
    job: Omit<import("./driver/types").ImportJobRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createImportJob", job });
  }

  async updateImportJob(
    jobId: string,
    updates: Partial<
      Pick<
        import("./driver/types").ImportJobRow,
        "status" | "progress" | "errorCode" | "errorMessage" | "resultDocumentId"
      >
    >
  ): Promise<void> {
    return this.sendRequest<void>({ type: "updateImportJob", jobId, updates });
  }

  async getImportJob(jobId: string): Promise<import("./driver/types").ImportJobRow | null> {
    return this.sendRequest<import("./driver/types").ImportJobRow | null>({
      type: "getImportJob",
      jobId,
    });
  }

  async listImportJobs(
    options?: import("./driver/types").ListImportJobsOptions
  ): Promise<import("./driver/types").ImportJobRow[]> {
    return this.sendRequest<import("./driver/types").ImportJobRow[]>({
      type: "listImportJobs",
      options,
    });
  }

  async getImportJobBySource(
    sourceType: import("./driver/types").ImportSourceType,
    sourceRef: string
  ): Promise<import("./driver/types").ImportJobRow | null> {
    return this.sendRequest<import("./driver/types").ImportJobRow | null>({
      type: "getImportJobBySource",
      sourceType,
      sourceRef,
    });
  }

  async deleteImportJob(jobId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteImportJob", jobId });
  }

  async createRawAsset(asset: import("./driver/types").RawAssetRow): Promise<void> {
    return this.sendRequest<void>({ type: "createRawAsset", asset });
  }

  async getRawAssetByHash(assetHash: string): Promise<import("./driver/types").RawAssetRow | null> {
    return this.sendRequest<import("./driver/types").RawAssetRow | null>({
      type: "getRawAssetByHash",
      assetHash,
    });
  }

  async linkDocumentAsset(documentId: string, assetId: string, role?: string): Promise<void> {
    return this.sendRequest<void>({ type: "linkDocumentAsset", documentId, assetId, role });
  }

  async listDocuments(
    options?: import("./driver/types").ListDocumentsOptions
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.sendRequest<import("./driver/types").DocumentRow[]>({
      type: "listDocuments",
      options,
    });
  }

  // --- Import Control Methods ---
  async importEnqueue(input: import("./import/types").CreateImportJobInput): Promise<string> {
    return this.sendRequest<string>({ type: "import_enqueue", input });
  }

  async importCancel(jobId: string): Promise<void> {
    return this.sendRequest<void>({ type: "import_cancel", jobId });
  }

  async importResume(): Promise<void> {
    return this.sendRequest<void>({ type: "import_resume" });
  }

  async importRetry(jobId: string): Promise<void> {
    return this.sendRequest<void>({ type: "import_retry", jobId });
  }

  async importDelete(jobId: string): Promise<boolean> {
    return this.sendRequest<boolean>({ type: "import_delete", jobId });
  }

  async updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void> {
    return this.sendRequest<void>({ type: "updateDocumentSavedAt", docId, savedAt });
  }

  /**
   * Toggle the saved state of a document.
   * If currently saved, removes from saved. If not saved, saves with current timestamp.
   */
  async toggleDocumentSaved(docId: string, save: boolean): Promise<void> {
    const savedAt = save ? Date.now() : null;
    return this.updateDocumentSavedAt(docId, savedAt);
  }

  /**
   * List only saved documents, ordered by savedAt descending.
   */
  async listSavedDocuments(
    options?: Omit<import("./driver/types").ListDocumentsOptions, "savedOnly">
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.listDocuments({
      ...options,
      savedOnly: true,
      orderBy: options?.orderBy ?? "savedAt",
      order: options?.order ?? "desc",
    });
  }

  // --- RSS Subscription Methods ---
  async createRssSubscription(
    subscription: Omit<import("./driver/types").RssSubscriptionRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createRssSubscription", subscription });
  }

  async listRssSubscriptions(
    options?: import("./driver/types").ListRssSubscriptionsOptions
  ): Promise<import("./driver/types").RssSubscriptionRow[]> {
    return this.sendRequest<import("./driver/types").RssSubscriptionRow[]>({
      type: "listRssSubscriptions",
      options,
    });
  }

  async getRssSubscription(
    subscriptionId: string
  ): Promise<import("./driver/types").RssSubscriptionRow | null> {
    return this.sendRequest<import("./driver/types").RssSubscriptionRow | null>({
      type: "getRssSubscription",
      subscriptionId,
    });
  }

  async getRssSubscriptionByUrl(
    url: string
  ): Promise<import("./driver/types").RssSubscriptionRow | null> {
    return this.sendRequest<import("./driver/types").RssSubscriptionRow | null>({
      type: "getRssSubscriptionByUrl",
      url,
    });
  }

  async updateRssSubscription(
    subscriptionId: string,
    updates: Partial<
      Pick<
        import("./driver/types").RssSubscriptionRow,
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
    return this.sendRequest<void>({
      type: "updateRssSubscription",
      subscriptionId,
      updates,
    });
  }

  async deleteRssSubscription(subscriptionId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteRssSubscription", subscriptionId });
  }

  // --- Feed Item Methods ---
  async getFeedItemByGuid(
    subscriptionId: string,
    guid: string
  ): Promise<import("./driver/types").FeedItemRow | null> {
    return this.sendRequest<import("./driver/types").FeedItemRow | null>({
      type: "getFeedItemByGuid",
      subscriptionId,
      guid,
    });
  }

  async createFeedItem(
    item: Omit<import("./driver/types").FeedItemRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createFeedItem", item });
  }

  async updateFeedItem(
    itemId: string,
    updates: Partial<
      Pick<
        import("./driver/types").FeedItemRow,
        "readState" | "saved" | "documentId" | "contentHtml"
      >
    >
  ): Promise<void> {
    return this.sendRequest<void>({ type: "updateFeedItem", itemId, updates });
  }

  async listFeedItems(
    options?: import("./driver/types").ListFeedItemsOptions
  ): Promise<import("./driver/types").FeedItemRow[]> {
    return this.sendRequest<import("./driver/types").FeedItemRow[]>({
      type: "listFeedItems",
      options,
    });
  }

  async countUnreadFeedItems(subscriptionId?: string): Promise<number> {
    return this.sendRequest<number>({ type: "countUnreadFeedItems", subscriptionId });
  }

  // --- Content Item Methods ---
  async upsertContentItem(item: import("./driver/types").ContentItemRow): Promise<void> {
    return this.sendRequest<void>({ type: "upsertContentItem", item });
  }

  async getContentItem(itemId: string): Promise<import("./driver/types").ContentItemRow | null> {
    return this.sendRequest<import("./driver/types").ContentItemRow | null>({
      type: "getContentItem",
      itemId,
    });
  }

  async getContentItemByHash(
    canonicalHash: string
  ): Promise<import("./driver/types").ContentItemRow | null> {
    return this.sendRequest<import("./driver/types").ContentItemRow | null>({
      type: "getContentItemByHash",
      canonicalHash,
    });
  }

  async listContentItems(
    options?: import("./driver/types").ListContentItemsOptions
  ): Promise<import("./driver/types").ContentItemRow[]> {
    return this.sendRequest<import("./driver/types").ContentItemRow[]>({
      type: "listContentItems",
      options,
    });
  }

  async deleteContentItem(itemId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteContentItem", itemId });
  }

  // --- Digest Methods ---
  async createDigest(
    digest: Omit<import("./driver/types").DigestRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createDigest", digest });
  }

  async updateDigest(
    digestId: string,
    updates: Partial<
      Pick<
        import("./driver/types").DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void> {
    return this.sendRequest<void>({ type: "updateDigest", digestId, updates });
  }

  async getDigest(digestId: string): Promise<import("./driver/types").DigestRow | null> {
    return this.sendRequest<import("./driver/types").DigestRow | null>({
      type: "getDigest",
      digestId,
    });
  }

  async getDigestByDate(
    userId: string,
    date: string
  ): Promise<import("./driver/types").DigestRow | null> {
    return this.sendRequest<import("./driver/types").DigestRow | null>({
      type: "getDigestByDate",
      userId,
      date,
    });
  }

  async listDigests(
    options: import("./driver/types").ListDigestsOptions
  ): Promise<import("./driver/types").DigestRow[]> {
    return this.sendRequest<import("./driver/types").DigestRow[]>({
      type: "listDigests",
      options,
    });
  }

  async deleteDigest(digestId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteDigest", digestId });
  }

  // --- Digest Card Methods ---
  async createDigestCard(card: import("./driver/types").DigestCardRow): Promise<void> {
    return this.sendRequest<void>({ type: "createDigestCard", card });
  }

  async listDigestCards(digestId: string): Promise<import("./driver/types").DigestCardRow[]> {
    return this.sendRequest<import("./driver/types").DigestCardRow[]>({
      type: "listDigestCards",
      digestId,
    });
  }

  async linkCardSource(cardId: string, sourceItemId: string, sourceType: string): Promise<void> {
    return this.sendRequest<void>({ type: "linkCardSource", cardId, sourceItemId, sourceType });
  }

  async getCardSourceIds(cardId: string): Promise<string[]> {
    return this.sendRequest<string[]>({ type: "getCardSourceIds", cardId });
  }

  // --- Brief operations ---
  async createBrief(
    brief: Omit<import("./driver/types").BriefRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.sendRequest<void>({ type: "createBrief", brief });
  }

  async updateBrief(
    briefId: string,
    updates: Partial<
      Pick<
        import("./driver/types").BriefRow,
        "title" | "description" | "coverImageUrl" | "isPublic" | "documentId"
      >
    >
  ): Promise<void> {
    return this.sendRequest<void>({ type: "updateBrief", briefId, updates });
  }

  async getBrief(briefId: string): Promise<import("./driver/types").BriefRow | null> {
    return this.sendRequest<import("./driver/types").BriefRow | null>({
      type: "getBrief",
      briefId,
    });
  }

  async listBriefs(
    options?: import("./driver/types").ListBriefsOptions
  ): Promise<import("./driver/types").BriefRow[]> {
    return this.sendRequest<import("./driver/types").BriefRow[]>({
      type: "listBriefs",
      options,
    });
  }

  async deleteBrief(briefId: string): Promise<void> {
    return this.sendRequest<void>({ type: "deleteBrief", briefId });
  }

  // --- Brief Item operations ---
  async addBriefItem(item: import("./driver/types").BriefItemRow): Promise<void> {
    return this.sendRequest<void>({ type: "addBriefItem", item });
  }

  async updateBriefItem(
    briefId: string,
    itemId: string,
    updates: Partial<Pick<import("./driver/types").BriefItemRow, "note" | "orderIndex">>
  ): Promise<void> {
    return this.sendRequest<void>({
      type: "updateBriefItem",
      briefId,
      itemId,
      updates,
    });
  }

  async removeBriefItem(briefId: string, itemId: string): Promise<void> {
    return this.sendRequest<void>({ type: "removeBriefItem", briefId, itemId });
  }

  async listBriefItems(briefId: string): Promise<import("./driver/types").BriefItemRow[]> {
    return this.sendRequest<import("./driver/types").BriefItemRow[]>({
      type: "listBriefItems",
      briefId,
    });
  }
}

/**
 * AutoSwitchDbClient chooses between SQLite (via Worker) and IndexedDB (main thread)
 * based on environment capabilities (OPFS support).
 */
export class AutoSwitchDbClient implements DbDriver {
  private activeDriver: DbDriver | null = null;
  private initPromise: Promise<DbInitResult> | null = null;
  private leadershipResult: LeaderElectionResult | null = null;
  private leaderChangeCallbacks: LeaderChangeCallback[] = [];
  private lastFallbackReason: string | undefined;

  /** Whether this tab is the leader (runs background jobs) */
  get isLeader(): boolean {
    return this.leadershipResult?.isLeader ?? false;
  }

  constructor(
    private workerUrl: string | URL,
    private dbName?: string
  ) {}

  async init(): Promise<DbInitResult> {
    if (this.initPromise) {
      return this.initPromise;
    }

    // Sticky fallback preference with expiry
    const PREF_KEY = "reader_db_driver_pref";
    const PREF_EXPIRY_KEY = "reader_db_driver_pref_expiry";
    const LAST_FALLBACK_KEY = "reader_db_last_fallback_reason";
    const PREF_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
    const now = Date.now();
    const storedPref = typeof localStorage !== "undefined" ? localStorage.getItem(PREF_KEY) : null;
    const storedExpiry =
      typeof localStorage !== "undefined" ? localStorage.getItem(PREF_EXPIRY_KEY) : null;
    const prefExpired = storedExpiry !== null && Number.parseInt(storedExpiry, 10) < now;
    if (prefExpired && typeof localStorage !== "undefined") {
      localStorage.removeItem(PREF_KEY);
      localStorage.removeItem(PREF_EXPIRY_KEY);
    }
    const forceIdb = storedPref === "idb-dexie";

    const start = performance.now();
    this.initPromise = (async () => {
      let fallbackReason: string | undefined;

      // 1. Try SQLite OPFS if not forced to IDB
      if (!forceIdb) {
        try {
          const result = await this.tryInitSqlite(start);
          if (result) {
            return result;
          }
          fallbackReason = "opfs-missing";
        } catch (err) {
          console.warn("[AutoSwitchDbClient] SQLite init failed, falling back.", err);
          fallbackReason = err instanceof Error ? err.message : String(err);
        }
      } else {
        fallbackReason = "sticky-preference";
      }

      // 2. Fallback to IndexedDB
      this.activeDriver = new IndexedDbDriver(this.dbName);
      const idbResult = await this.activeDriver.init();
      if (typeof localStorage !== "undefined" && fallbackReason) {
        localStorage.setItem(PREF_KEY, "idb-dexie");
        localStorage.setItem(PREF_EXPIRY_KEY, String(now + PREF_TTL_MS));
        localStorage.setItem(LAST_FALLBACK_KEY, fallbackReason);
      }
      this.lastFallbackReason = fallbackReason;
      return {
        ...idbResult,
        initTimeMs: performance.now() - start,
        fallbackReason,
      };
    })();

    // Acquire leadership in parallel (non-blocking)
    this.initPromise.then(() => {
      this.acquireLeadershipInternal();
    });

    return this.initPromise;
  }

  /** Internal: acquire leadership after init */
  private async acquireLeadershipInternal(): Promise<void> {
    this.leadershipResult = await acquireLeadership((isLeader) => {
      for (const cb of this.leaderChangeCallbacks) {
        cb(isLeader);
      }
    });
  }

  private async tryInitSqlite(start: number): Promise<DbInitResult | null> {
    const hasOpfs =
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === "function";

    if (!hasOpfs) {
      return null;
    }

    const workerClient = new WorkerDbClient(this.workerUrl);
    // Note: Worker doesn't support custom dbName yet in this implementation,
    // but the fallback IDB path will benefit.
    const result = await workerClient.init();
    this.activeDriver = workerClient;
    this.lastFallbackReason = undefined;
    return {
      ...result,
      initTimeMs: performance.now() - start,
    };
  }

  /** Register a callback for leader status changes */
  onLeaderChange(callback: LeaderChangeCallback): () => void {
    this.leaderChangeCallbacks.push(callback);
    // Immediately call with current status
    if (this.leadershipResult) {
      callback(this.leadershipResult.isLeader);
    }
    // Return unsubscribe function
    return () => {
      const idx = this.leaderChangeCallbacks.indexOf(callback);
      if (idx >= 0) {
        this.leaderChangeCallbacks.splice(idx, 1);
      }
    };
  }

  private get driver(): DbDriver {
    if (!this.activeDriver) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.activeDriver;
  }

  async reset(): Promise<void> {
    if (this.activeDriver) {
      await this.activeDriver.reset();
      await this.activeDriver.close();
      this.activeDriver = null;
      this.initPromise = null;
    }
  }

  async healthCheck(): Promise<import("./driver/types").DbHealthInfo> {
    const driverHealth = await this.driver.healthCheck();
    return {
      ...driverHealth,
      isLeader: this.isLeader,
      fallbackReason: this.lastFallbackReason ?? driverHealth.fallbackReason,
    };
  }

  async close(): Promise<void> {
    if (this.activeDriver) {
      await this.activeDriver.close();
      this.activeDriver = null;
      this.initPromise = null;
    }
  }

  // Proxied methods
  getDocument(docId: string): Promise<DocumentRow | null> {
    return this.driver.getDocument(docId);
  }

  upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void> {
    return this.driver.upsertDocument(doc);
  }

  createTopic(
    topic: Omit<import("./driver/types").TopicRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.driver.createTopic(topic);
  }

  listTopics(
    options?: import("./driver/types").ListTopicsOptions
  ): Promise<import("./driver/types").TopicRow[]> {
    return this.driver.listTopics(options);
  }

  updateTopic(
    topicId: string,
    updates: Partial<Pick<import("./driver/types").TopicRow, "name" | "description" | "color">>
  ): Promise<void> {
    return this.driver.updateTopic(topicId, updates);
  }

  deleteTopic(topicId: string): Promise<void> {
    return this.driver.deleteTopic(topicId);
  }

  getTopic(topicId: string): Promise<import("./driver/types").TopicRow | null> {
    return this.driver.getTopic(topicId);
  }

  addDocumentToTopic(documentId: string, topicId: string): Promise<void> {
    return this.driver.addDocumentToTopic(documentId, topicId);
  }

  removeDocumentFromTopic(documentId: string, topicId: string): Promise<void> {
    return this.driver.removeDocumentFromTopic(documentId, topicId);
  }

  listDocumentsByTopic(
    topicId: string,
    options?: import("./driver/types").ListDocumentsOptions
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.driver.listDocumentsByTopic(topicId, options);
  }

  listTopicsByDocument(documentId: string): Promise<import("./driver/types").TopicRow[]> {
    return this.driver.listTopicsByDocument(documentId);
  }

  addSubscriptionToTopic(subscriptionId: string, topicId: string): Promise<void> {
    return this.driver.addSubscriptionToTopic(subscriptionId, topicId);
  }

  removeSubscriptionFromTopic(subscriptionId: string, topicId: string): Promise<void> {
    return this.driver.removeSubscriptionFromTopic(subscriptionId, topicId);
  }

  listSubscriptionsByTopic(
    topicId: string
  ): Promise<import("./driver/types").RssSubscriptionRow[]> {
    return this.driver.listSubscriptionsByTopic(topicId);
  }

  listTopicsBySubscription(subscriptionId: string): Promise<import("./driver/types").TopicRow[]> {
    return this.driver.listTopicsBySubscription(subscriptionId);
  }

  appendUpdate(u: CrdtUpdateRow): Promise<void> {
    return this.driver.appendUpdate(u);
  }

  listUpdates(o: ListUpdatesOptions): Promise<CrdtUpdateRow[]> {
    return this.driver.listUpdates(o);
  }

  getAnnotation(id: string): Promise<AnnotationRow | null> {
    return this.driver.getAnnotation(id);
  }

  upsertAnnotation(a: AnnotationRow): Promise<void> {
    return this.driver.upsertAnnotation(a);
  }

  listAnnotations(o: ListAnnotationsOptions): Promise<AnnotationRow[]> {
    return this.driver.listAnnotations(o);
  }

  enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void> {
    return this.driver.enqueueOutbox(item);
  }

  claimOutboxItems(limit: number): Promise<OutboxRow[]> {
    return this.driver.claimOutboxItems(limit);
  }

  ackOutboxItem(id: string): Promise<void> {
    return this.driver.ackOutboxItem(id);
  }

  failOutboxItem(id: string, next: number): Promise<void> {
    return this.driver.failOutboxItem(id, next);
  }

  batch<T>(ops: Array<() => Promise<T>>): Promise<T[]> {
    return this.driver.batch(ops);
  }

  transaction<T>(fn: (tx: import("./driver/types").DbTransaction) => Promise<T>): Promise<T> {
    return this.driver.transaction(fn);
  }

  createImportJob(job: Parameters<DbDriver["createImportJob"]>[0]): Promise<void> {
    return this.driver.createImportJob(job);
  }

  updateImportJob(
    jobId: string,
    updates: Parameters<DbDriver["updateImportJob"]>[1]
  ): Promise<void> {
    return this.driver.updateImportJob(jobId, updates);
  }

  getImportJob(jobId: string): Promise<import("./driver/types").ImportJobRow | null> {
    return this.driver.getImportJob(jobId);
  }

  listImportJobs(
    options?: import("./driver/types").ListImportJobsOptions
  ): Promise<import("./driver/types").ImportJobRow[]> {
    return this.driver.listImportJobs(options);
  }

  getImportJobBySource(
    sourceType: import("./driver/types").ImportSourceType,
    sourceRef: string
  ): Promise<import("./driver/types").ImportJobRow | null> {
    return this.driver.getImportJobBySource(sourceType, sourceRef);
  }

  deleteImportJob(jobId: string): Promise<void> {
    return this.driver.deleteImportJob(jobId);
  }

  createRawAsset(asset: import("./driver/types").RawAssetRow): Promise<void> {
    return this.driver.createRawAsset(asset);
  }

  getRawAssetByHash(assetHash: string): Promise<import("./driver/types").RawAssetRow | null> {
    return this.driver.getRawAssetByHash(assetHash);
  }

  linkDocumentAsset(documentId: string, assetId: string, role?: string): Promise<void> {
    return this.driver.linkDocumentAsset(documentId, assetId, role);
  }

  listDocuments(
    options?: import("./driver/types").ListDocumentsOptions
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.driver.listDocuments(options);
  }

  deleteDocument(docId: string): Promise<void> {
    return this.driver.deleteDocument(docId);
  }

  updateDocumentTitle(docId: string, title: string): Promise<void> {
    return this.driver.updateDocumentTitle(docId, title);
  }

  updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void> {
    return this.driver.updateDocumentSavedAt(docId, savedAt);
  }

  /**
   * Toggle the saved state of a document.
   * If currently saved, removes from saved. If not saved, saves with current timestamp.
   */
  async toggleDocumentSaved(docId: string, save: boolean): Promise<void> {
    const savedAt = save ? Date.now() : null;
    return this.updateDocumentSavedAt(docId, savedAt);
  }

  /**
   * List only saved documents, ordered by savedAt descending.
   */
  async listSavedDocuments(
    options?: Omit<import("./driver/types").ListDocumentsOptions, "savedOnly">
  ): Promise<import("./driver/types").DocumentRow[]> {
    return this.listDocuments({
      ...options,
      savedOnly: true,
      orderBy: options?.orderBy ?? "savedAt",
      order: options?.order ?? "desc",
    });
  }

  // --- Import Control Methods ---

  onEvent(callback: (event: import("./worker/index").WorkerEvent) => void): () => void {
    if (this.activeDriver && "onEvent" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).onEvent(callback);
    }
    console.warn("[AutoSwitchDbClient] onEvent called but active driver does not support events");
    // biome-ignore lint/suspicious/noEmptyBlockStatements: Intentional no-op unsubscribe function
    return () => {};
  }

  async importEnqueue(input: import("./import/types").CreateImportJobInput): Promise<string> {
    if (this.activeDriver && "importEnqueue" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).importEnqueue(input);
    }
    throw new Error("Import operations not supported by current driver");
  }

  async importCancel(jobId: string): Promise<void> {
    if (this.activeDriver && "importCancel" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).importCancel(jobId);
    }
    throw new Error("Import operations not supported by current driver");
  }

  async importResume(): Promise<void> {
    if (this.activeDriver && "importResume" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).importResume();
    }
    throw new Error("Import operations not supported by current driver");
  }

  async importRetry(jobId: string): Promise<void> {
    if (this.activeDriver && "importRetry" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).importRetry(jobId);
    }
    throw new Error("Import operations not supported by current driver");
  }

  async importDelete(jobId: string): Promise<boolean> {
    if (this.activeDriver && "importDelete" in this.activeDriver) {
      // biome-ignore lint/suspicious/noExplicitAny: Safely checking for method existence
      return (this.activeDriver as any).importDelete(jobId);
    }
    throw new Error("Import operations not supported by current driver");
  }

  // --- RSS Subscription Methods ---
  createRssSubscription(
    subscription: Omit<import("./driver/types").RssSubscriptionRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.driver.createRssSubscription(subscription);
  }

  listRssSubscriptions(
    options?: import("./driver/types").ListRssSubscriptionsOptions
  ): Promise<import("./driver/types").RssSubscriptionRow[]> {
    return this.driver.listRssSubscriptions(options);
  }

  getRssSubscription(
    subscriptionId: string
  ): Promise<import("./driver/types").RssSubscriptionRow | null> {
    return this.driver.getRssSubscription(subscriptionId);
  }

  getRssSubscriptionByUrl(
    url: string
  ): Promise<import("./driver/types").RssSubscriptionRow | null> {
    return this.driver.getRssSubscriptionByUrl(url);
  }

  updateRssSubscription(
    subscriptionId: string,
    updates: Partial<
      Pick<
        import("./driver/types").RssSubscriptionRow,
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
    return this.driver.updateRssSubscription(subscriptionId, updates);
  }

  deleteRssSubscription(subscriptionId: string): Promise<void> {
    return this.driver.deleteRssSubscription(subscriptionId);
  }

  // --- Feed Item Methods ---
  getFeedItemByGuid(
    subscriptionId: string,
    guid: string
  ): Promise<import("./driver/types").FeedItemRow | null> {
    return this.driver.getFeedItemByGuid(subscriptionId, guid);
  }

  createFeedItem(
    item: Omit<import("./driver/types").FeedItemRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.driver.createFeedItem(item);
  }

  updateFeedItem(
    itemId: string,
    updates: Partial<
      Pick<
        import("./driver/types").FeedItemRow,
        "readState" | "saved" | "documentId" | "contentHtml"
      >
    >
  ): Promise<void> {
    return this.driver.updateFeedItem(itemId, updates);
  }

  listFeedItems(
    options?: import("./driver/types").ListFeedItemsOptions
  ): Promise<import("./driver/types").FeedItemRow[]> {
    return this.driver.listFeedItems(options);
  }

  countUnreadFeedItems(subscriptionId?: string): Promise<number> {
    return this.driver.countUnreadFeedItems(subscriptionId);
  }

  // --- Content Item Methods ---
  upsertContentItem(item: import("./driver/types").ContentItemRow): Promise<void> {
    return this.driver.upsertContentItem(item);
  }

  getContentItem(itemId: string): Promise<import("./driver/types").ContentItemRow | null> {
    return this.driver.getContentItem(itemId);
  }

  getContentItemByHash(
    canonicalHash: string
  ): Promise<import("./driver/types").ContentItemRow | null> {
    return this.driver.getContentItemByHash(canonicalHash);
  }

  listContentItems(
    options?: import("./driver/types").ListContentItemsOptions
  ): Promise<import("./driver/types").ContentItemRow[]> {
    return this.driver.listContentItems(options);
  }

  deleteContentItem(itemId: string): Promise<void> {
    return this.driver.deleteContentItem(itemId);
  }

  // --- Digest Methods ---
  createDigest(
    digest: Omit<import("./driver/types").DigestRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.driver.createDigest(digest);
  }

  updateDigest(
    digestId: string,
    updates: Partial<
      Pick<
        import("./driver/types").DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void> {
    return this.driver.updateDigest(digestId, updates);
  }

  getDigest(digestId: string): Promise<import("./driver/types").DigestRow | null> {
    return this.driver.getDigest(digestId);
  }

  getDigestByDate(
    userId: string,
    date: string
  ): Promise<import("./driver/types").DigestRow | null> {
    return this.driver.getDigestByDate(userId, date);
  }

  listDigests(
    options: import("./driver/types").ListDigestsOptions
  ): Promise<import("./driver/types").DigestRow[]> {
    return this.driver.listDigests(options);
  }

  deleteDigest(digestId: string): Promise<void> {
    return this.driver.deleteDigest(digestId);
  }

  // --- Digest Card Methods ---
  createDigestCard(card: import("./driver/types").DigestCardRow): Promise<void> {
    return this.driver.createDigestCard(card);
  }

  listDigestCards(digestId: string): Promise<import("./driver/types").DigestCardRow[]> {
    return this.driver.listDigestCards(digestId);
  }

  linkCardSource(cardId: string, sourceItemId: string, sourceType: string): Promise<void> {
    return this.driver.linkCardSource(cardId, sourceItemId, sourceType);
  }

  getCardSourceIds(cardId: string): Promise<string[]> {
    return this.driver.getCardSourceIds(cardId);
  }

  // --- Brief operations ---
  createBrief(
    brief: Omit<import("./driver/types").BriefRow, "createdAt" | "updatedAt">
  ): Promise<void> {
    return this.driver.createBrief(brief);
  }

  updateBrief(
    briefId: string,
    updates: Partial<
      Pick<
        import("./driver/types").BriefRow,
        "title" | "description" | "coverImageUrl" | "isPublic" | "documentId"
      >
    >
  ): Promise<void> {
    return this.driver.updateBrief(briefId, updates);
  }

  getBrief(briefId: string): Promise<import("./driver/types").BriefRow | null> {
    return this.driver.getBrief(briefId);
  }

  listBriefs(
    options?: import("./driver/types").ListBriefsOptions
  ): Promise<import("./driver/types").BriefRow[]> {
    return this.driver.listBriefs(options);
  }

  deleteBrief(briefId: string): Promise<void> {
    return this.driver.deleteBrief(briefId);
  }

  // --- Brief Item operations ---
  addBriefItem(item: import("./driver/types").BriefItemRow): Promise<void> {
    return this.driver.addBriefItem(item);
  }

  updateBriefItem(
    briefId: string,
    itemId: string,
    updates: Partial<Pick<import("./driver/types").BriefItemRow, "note" | "orderIndex">>
  ): Promise<void> {
    return this.driver.updateBriefItem(briefId, itemId, updates);
  }

  removeBriefItem(briefId: string, itemId: string): Promise<void> {
    return this.driver.removeBriefItem(briefId, itemId);
  }

  listBriefItems(briefId: string): Promise<import("./driver/types").BriefItemRow[]> {
    return this.driver.listBriefItems(briefId);
  }
}

/**
 * Create a DbClient that automatically selects the best driver.
 */
export function createDbClient(workerUrl: string | URL): DbDriver {
  return new AutoSwitchDbClient(workerUrl);
}
