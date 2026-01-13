/**
 * DbDriver Interface and related types for LFCC local persistence.
 */

/** Represents a row from the `documents` table. */
export interface DocumentRow {
  docId: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
  activePolicyId: string | null;
  headFrontier: Uint8Array | null;
  /** Timestamp when document was saved for later, null if not saved */
  savedAt: number | null;
}

/** Represents a row from the `crdt_updates` table. */
export interface CrdtUpdateRow {
  docId: string;
  actorId: string;
  seq: number;
  lamport: number;
  update: Uint8Array;
  receivedAt: number;
  source: "local" | "remote" | "replay";
}

/** Represents a row from the `annotations` table. */
export interface AnnotationRow {
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

/** Represents a row from the `outbox` table. */
export interface OutboxRow {
  outboxId: string;
  docId: string;
  kind: "crdt_update_batch" | "annotation_mutation" | "policy_update";
  payload: Uint8Array;
  attempts: number;
  nextRetryAt: number | null;
  status: "pending" | "in_flight" | "acked" | "failed";
  createdAt: number;
}

/** Import job status values. */
export type ImportJobStatus =
  | "queued"
  | "ingesting"
  | "normalizing"
  | "storing"
  | "done"
  | "failed"
  | "canceled";

/** Import source type values. */
export type ImportSourceType = "url" | "file" | "rss" | "youtube";

/** Represents a row from the `import_jobs` table. */
export interface ImportJobRow {
  jobId: string;
  sourceType: ImportSourceType;
  sourceRef: string;
  status: ImportJobStatus;
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

/** Represents a row from the `raw_assets` table. */
export interface RawAssetRow {
  assetId: string;
  assetHash: string;
  byteSize: number;
  mimeType: string;
  sourceType: ImportSourceType;
  sourceRef: string;
  storageProvider: "opfs" | "idb";
  storagePath: string;
  parserHint: string | null;
  ingestMetaJson: string | null;
  createdAt: number;
}

/** Options for listing import jobs. */
export interface ListImportJobsOptions {
  status?: ImportJobStatus;
  sourceType?: ImportSourceType;
  limit?: number;
}

/** Options for listing updates. */
export interface ListUpdatesOptions {
  docId: string;
  afterLamport?: number;
  limit?: number;
}

/** Options for listing annotations. */
export interface ListAnnotationsOptions {
  docId: string;
  state?: AnnotationRow["state"];
  kind?: string;
}

/** Options for listing documents. */
export interface ListDocumentsOptions {
  /** Limit number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order field */
  orderBy?: "updatedAt" | "createdAt" | "title" | "savedAt";
  /** Sort direction */
  order?: "asc" | "desc";
  /** Filter to only saved documents (saved_at IS NOT NULL) */
  savedOnly?: boolean;
}

/** Represents a row from the `topics` table. */
export interface TopicRow {
  topicId: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Represents a row from the `document_topics` table. */
export interface DocumentTopicRow {
  documentId: string;
  topicId: string;
  addedAt: number;
}

/** Options for listing topics. */
export interface ListTopicsOptions {
  limit?: number;
  offset?: number;
  orderBy?: "updatedAt" | "createdAt" | "name";
  order?: "asc" | "desc";
}

/** Represents a row from the `subscription_topics` table. */
export interface SubscriptionTopicRow {
  subscriptionId: string;
  topicId: string;
  addedAt: number;
}

// ============ RSS Types ============

/** Represents a row from the `rss_subscriptions` table. */
export interface RssSubscriptionRow {
  subscriptionId: string;
  url: string;
  title: string | null;
  displayName: string | null;
  siteUrl: string | null;
  folderId: string | null;
  enabled: boolean;
  lastFetchedAt: number | null;
  status: "ok" | "error";
  errorMessage: string | null;
  etag: string | null;
  lastModified: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Represents a row from the `feed_items` table. */
export interface FeedItemRow {
  itemId: string;
  subscriptionId: string;
  guid: string | null;
  title: string | null;
  link: string | null;
  author: string | null;
  publishedAt: number | null;
  contentHtml: string | null;
  excerpt: string | null;
  readState: "unread" | "read";
  saved: boolean;
  documentId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Options for listing RSS subscriptions. */
export interface ListRssSubscriptionsOptions {
  enabled?: boolean;
  folderId?: string;
  status?: "ok" | "error";
}

/** Options for listing feed items. */
export interface ListFeedItemsOptions {
  subscriptionId?: string;
  topicId?: string;
  readState?: "unread" | "read";
  saved?: boolean;
  limit?: number;
  offset?: number;
}

// ============ Digest Types ============

/** Digest status values. */
export type DigestStatus = "pending" | "generating" | "ready" | "failed";

/** Represents a row from the `digests` table. */
export interface DigestRow {
  digestId: string;
  userId: string;
  date: string;
  title: string;
  status: DigestStatus;
  error: string | null;
  sourceItemCount: number;
  tokenUsageJson: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Digest card type values. */
export type DigestCardType = "summary" | "cluster" | "highlight" | "trend";

/** Confidence level values. */
export type ConfidenceLevel = "high" | "medium" | "low";

/** Represents a row from the `digest_cards` table. */
export interface DigestCardRow {
  cardId: string;
  digestId: string;
  cardType: DigestCardType;
  headline: string;
  summary: string;
  whyItMatters: string | null;
  confidence: ConfidenceLevel;
  priorityScore: number;
  topicsJson: string;
  citationsJson: string;
  orderIndex: number;
  generatedAt: number;
}

/** Content source type values. */
export type ContentSource = "rss" | "import" | "manual" | "web";

/** Represents a row from the `content_items` table. */
export interface ContentItemRow {
  itemId: string;
  source: ContentSource;
  sourceUrl: string | null;
  feedId: string | null;
  title: string;
  content: string;
  snippet: string | null;
  author: string | null;
  publishedAt: number | null;
  ingestedAt: number;
  topicsJson: string;
  canonicalHash: string;
  wordCount: number;
  hasFullText: boolean;
}

/** Options for listing digests. */
export interface ListDigestsOptions {
  userId: string;
  status?: DigestStatus;
  limit?: number;
  offset?: number;
}

/** Options for listing content items. */
export interface ListContentItemsOptions {
  startTime?: number;
  endTime?: number;
  source?: ContentSource;
  feedId?: string;
  limit?: number;
  offset?: number;
}

// ============ Brief Types ============

/** Represents a row from the `briefs` table. */
export interface BriefRow {
  briefId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  isPublic: boolean;
  ownerId: string;
  documentId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Brief item type values. */
export type BriefItemType = "digest_card" | "feed_item" | "document" | "url";

/** Represents a row from the `brief_items` table. */
export interface BriefItemRow {
  briefId: string;
  itemId: string;
  itemType: BriefItemType;
  title: string;
  sourceUrl: string | null;
  excerpt: string | null;
  note: string | null;
  orderIndex: number;
  addedAt: number;
}

/** Options for listing briefs. */
export interface ListBriefsOptions {
  ownerId?: string;
  isPublic?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * The core database driver interface.
 * Implementations include SQLite/OPFS (primary) and IndexedDB/Dexie (fallback).
 */
export interface DbDriver {
  /** Initialize the driver (open DB, run migrations). */
  init(): Promise<DbInitResult>;

  /** Close the database connection. */
  close(): Promise<void>;

  // --- Document operations ---
  getDocument(docId: string): Promise<DocumentRow | null>;
  listDocuments(options?: ListDocumentsOptions): Promise<DocumentRow[]>;
  upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void>;
  /** Delete a document and all related data (CRDT updates, annotations, etc.) */
  deleteDocument(docId: string): Promise<void>;
  /** Update a document's title */
  updateDocumentTitle(docId: string, title: string): Promise<void>;
  /** Update a document's saved state */
  updateDocumentSavedAt(docId: string, savedAt: number | null): Promise<void>;

  // --- Topic operations ---
  createTopic(topic: Omit<TopicRow, "createdAt" | "updatedAt">): Promise<void>;
  updateTopic(
    topicId: string,
    updates: Partial<Pick<TopicRow, "name" | "description" | "color">>
  ): Promise<void>;
  deleteTopic(topicId: string): Promise<void>;
  getTopic(topicId: string): Promise<TopicRow | null>;
  listTopics(options?: ListTopicsOptions): Promise<TopicRow[]>;

  // --- Document-Topic link operations ---
  addDocumentToTopic(documentId: string, topicId: string): Promise<void>;
  removeDocumentFromTopic(documentId: string, topicId: string): Promise<void>;
  listDocumentsByTopic(topicId: string, options?: ListDocumentsOptions): Promise<DocumentRow[]>;
  listTopicsByDocument(documentId: string): Promise<TopicRow[]>;

  // --- Subscription-Topic link operations ---
  addSubscriptionToTopic(subscriptionId: string, topicId: string): Promise<void>;
  removeSubscriptionFromTopic(subscriptionId: string, topicId: string): Promise<void>;
  listSubscriptionsByTopic(topicId: string): Promise<RssSubscriptionRow[]>;
  listTopicsBySubscription(subscriptionId: string): Promise<TopicRow[]>;

  // --- CRDT Update operations ---
  appendUpdate(update: CrdtUpdateRow): Promise<void>;
  listUpdates(options: ListUpdatesOptions): Promise<CrdtUpdateRow[]>;

  // --- Annotation operations ---
  getAnnotation(annotationId: string): Promise<AnnotationRow | null>;
  upsertAnnotation(annotation: AnnotationRow): Promise<void>;
  listAnnotations(options: ListAnnotationsOptions): Promise<AnnotationRow[]>;

  // --- Outbox operations ---
  enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void>;
  claimOutboxItems(limit: number): Promise<OutboxRow[]>;
  ackOutboxItem(outboxId: string): Promise<void>;
  failOutboxItem(outboxId: string, nextRetryAt: number): Promise<void>;

  // --- Import Job operations ---
  createImportJob(job: Omit<ImportJobRow, "createdAt" | "updatedAt">): Promise<void>;
  updateImportJob(
    jobId: string,
    updates: Partial<
      Pick<
        ImportJobRow,
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
  ): Promise<void>;
  getImportJob(jobId: string): Promise<ImportJobRow | null>;
  listImportJobs(options?: ListImportJobsOptions): Promise<ImportJobRow[]>;
  getImportJobBySource(
    sourceType: ImportSourceType,
    sourceRef: string
  ): Promise<ImportJobRow | null>;
  /** Delete an import job by ID. */
  deleteImportJob(jobId: string): Promise<void>;

  // --- Raw Asset operations ---
  createRawAsset(asset: RawAssetRow): Promise<void>;
  getRawAssetByHash(assetHash: string): Promise<RawAssetRow | null>;
  linkDocumentAsset(documentId: string, assetId: string, role?: string): Promise<void>;

  // --- Observability & Recovery ---
  /** Get health check information for diagnostics. */
  healthCheck(): Promise<DbHealthInfo>;
  /** Reset the database (delete all data). Use with caution. */
  reset(): Promise<void>;

  // --- Batching operations ---
  /** Execute multiple operations in a batch for better performance. */
  batch<T>(ops: Array<() => Promise<T>>): Promise<T[]>;
  /** Execute operations atomically within a transaction. */
  transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;

  // --- RSS Subscription operations ---
  /** Create a new RSS subscription. */
  createRssSubscription(
    subscription: Omit<RssSubscriptionRow, "createdAt" | "updatedAt">
  ): Promise<void>;
  /** List RSS subscriptions with optional filters. */
  listRssSubscriptions(options?: ListRssSubscriptionsOptions): Promise<RssSubscriptionRow[]>;
  /** Get a single RSS subscription by ID. */
  getRssSubscription(subscriptionId: string): Promise<RssSubscriptionRow | null>;
  /** Get a subscription by URL. */
  getRssSubscriptionByUrl(url: string): Promise<RssSubscriptionRow | null>;
  /** Update RSS subscription. */
  updateRssSubscription(
    subscriptionId: string,
    updates: Partial<
      Pick<
        RssSubscriptionRow,
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
  ): Promise<void>;
  /** Delete an RSS subscription and its feed items. */
  deleteRssSubscription(subscriptionId: string): Promise<void>;

  // --- Feed Item operations ---
  /** Get a feed item by subscription ID and GUID. */
  getFeedItemByGuid(subscriptionId: string, guid: string): Promise<FeedItemRow | null>;
  /** Create a new feed item. */
  createFeedItem(item: Omit<FeedItemRow, "createdAt" | "updatedAt">): Promise<void>;
  /** Update a feed item's state. */
  updateFeedItem(
    itemId: string,
    updates: Partial<Pick<FeedItemRow, "readState" | "saved" | "documentId" | "contentHtml">>
  ): Promise<void>;
  /** List feed items with filters. */
  listFeedItems(options?: ListFeedItemsOptions): Promise<FeedItemRow[]>;
  /** Count unread feed items. */
  countUnreadFeedItems(subscriptionId?: string): Promise<number>;

  // --- Content Item operations ---
  /** Create or update a content item. */
  upsertContentItem(item: ContentItemRow): Promise<void>;
  /** Get a content item by ID. */
  getContentItem(itemId: string): Promise<ContentItemRow | null>;
  /** Get a content item by canonical hash (for deduplication). */
  getContentItemByHash(canonicalHash: string): Promise<ContentItemRow | null>;
  /** List content items with filters. */
  listContentItems(options?: ListContentItemsOptions): Promise<ContentItemRow[]>;
  /** Delete a content item. */
  deleteContentItem(itemId: string): Promise<void>;

  // --- Digest operations ---
  /** Create a new digest. */
  createDigest(digest: Omit<DigestRow, "createdAt" | "updatedAt">): Promise<void>;
  /** Update a digest. */
  updateDigest(
    digestId: string,
    updates: Partial<
      Pick<
        DigestRow,
        "status" | "error" | "sourceItemCount" | "tokenUsageJson" | "startedAt" | "completedAt"
      >
    >
  ): Promise<void>;
  /** Get a digest by ID. */
  getDigest(digestId: string): Promise<DigestRow | null>;
  /** Get a digest by user and date. */
  getDigestByDate(userId: string, date: string): Promise<DigestRow | null>;
  /** List digests with filters. */
  listDigests(options: ListDigestsOptions): Promise<DigestRow[]>;
  /** Delete a digest and its cards. */
  deleteDigest(digestId: string): Promise<void>;

  // --- Digest Card operations ---
  /** Add a card to a digest. */
  createDigestCard(card: DigestCardRow): Promise<void>;
  /** List cards for a digest. */
  listDigestCards(digestId: string): Promise<DigestCardRow[]>;
  /** Link a source item to a card. */
  linkCardSource(cardId: string, sourceItemId: string, sourceType: string): Promise<void>;
  /** Get source item IDs for a card. */
  getCardSourceIds(cardId: string): Promise<string[]>;

  // --- Brief operations ---
  /** Create a new brief. */
  createBrief(brief: Omit<BriefRow, "createdAt" | "updatedAt">): Promise<void>;
  /** Update a brief. */
  updateBrief(
    briefId: string,
    updates: Partial<
      Pick<BriefRow, "title" | "description" | "coverImageUrl" | "isPublic" | "documentId">
    >
  ): Promise<void>;
  /** Get a brief by ID. */
  getBrief(briefId: string): Promise<BriefRow | null>;
  /** List briefs with filters. */
  listBriefs(options?: ListBriefsOptions): Promise<BriefRow[]>;
  /** Delete a brief and its items. */
  deleteBrief(briefId: string): Promise<void>;

  // --- Brief Item operations ---
  /** Add an item to a brief. */
  addBriefItem(item: BriefItemRow): Promise<void>;
  /** Update a brief item. */
  updateBriefItem(
    briefId: string,
    itemId: string,
    updates: Partial<Pick<BriefItemRow, "note" | "orderIndex">>
  ): Promise<void>;
  /** Remove an item from a brief. */
  removeBriefItem(briefId: string, itemId: string): Promise<void>;
  /** List items in a brief. */
  listBriefItems(briefId: string): Promise<BriefItemRow[]>;
}

/**
 * Transaction context for atomic operations.
 * Provides a subset of DbDriver methods that can be called within a transaction.
 */
export interface DbTransaction {
  upsertDocument(
    doc: Omit<DocumentRow, "createdAt" | "updatedAt"> &
      Partial<Pick<DocumentRow, "createdAt" | "updatedAt">>
  ): Promise<void>;
  appendUpdate(update: CrdtUpdateRow): Promise<void>;
  upsertAnnotation(annotation: AnnotationRow): Promise<void>;
  enqueueOutbox(
    item: Omit<OutboxRow, "attempts" | "nextRetryAt" | "status" | "createdAt">
  ): Promise<void>;
}

/** Driver type identifier. */
export type DriverType = "sqlite-opfs" | "idb-dexie";

/** Result of database initialization with telemetry. */
export interface DbInitResult {
  driver: DriverType;
  schemaVersion: number;
  initTimeMs: number;
  fallbackReason?: string;
}

/** Health check information. */
export interface DbHealthInfo {
  driver: DriverType;
  schemaVersion: number;
  isLeader: boolean;
  opfsAvailable: boolean;
  idbAvailable: boolean;
  fallbackReason?: string;
}
