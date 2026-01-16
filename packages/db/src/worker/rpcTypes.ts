/**
 * Worker RPC Type Definitions
 *
 * Extracted from worker/index.ts to reduce file size and improve maintainability.
 * Contains all type definitions for the worker RPC protocol.
 *
 * @module rpcTypes
 */

import type {
  AnnotationRow,
  CrdtUpdateRow,
  DbDriver,
  ImportJobStatus,
  ListAnnotationsOptions,
  ListDocumentsOptions,
  ListUpdatesOptions,
} from "../driver/types";

/**
 * All possible worker request types.
 * This union type defines the complete RPC protocol for the database worker.
 */
export type WorkerRequest =
  | { type: "init" }
  | { type: "close" }
  | { type: "getDocument"; docId: string }
  | { type: "upsertDocument"; doc: Parameters<DbDriver["upsertDocument"]>[0] }
  | { type: "appendUpdate"; update: CrdtUpdateRow }
  | { type: "listUpdates"; options: ListUpdatesOptions }
  | { type: "getAnnotation"; annotationId: string }
  | { type: "upsertAnnotation"; annotation: AnnotationRow }
  | { type: "listAnnotations"; options: ListAnnotationsOptions }
  | { type: "enqueueOutbox"; item: Parameters<DbDriver["enqueueOutbox"]>[0] }
  | { type: "claimOutboxItems"; limit: number }
  | { type: "ackOutboxItem"; outboxId: string }
  | { type: "failOutboxItem"; outboxId: string; nextRetryAt: number }
  | { type: "healthCheck" }
  | { type: "reset" }
  | { type: "createImportJob"; job: Parameters<DbDriver["createImportJob"]>[0] }
  | { type: "updateImportJob"; jobId: string; updates: Parameters<DbDriver["updateImportJob"]>[1] }
  | { type: "getImportJob"; jobId: string }
  | { type: "listImportJobs"; options?: import("../driver/types").ListImportJobsOptions }
  | {
      type: "getImportJobBySource";
      sourceType: import("../driver/types").ImportSourceType;
      sourceRef: string;
    }
  | { type: "deleteImportJob"; jobId: string }
  | { type: "createRawAsset"; asset: import("../driver/types").RawAssetRow }
  | { type: "getRawAssetByHash"; assetHash: string }
  | { type: "linkDocumentAsset"; documentId: string; assetId: string; role?: string }
  | { type: "listDocuments"; options?: ListDocumentsOptions }
  | { type: "createTopic"; topic: Parameters<DbDriver["createTopic"]>[0] }
  | { type: "updateTopic"; topicId: string; updates: Parameters<DbDriver["updateTopic"]>[1] }
  | { type: "deleteTopic"; topicId: string }
  | { type: "getTopic"; topicId: string }
  | { type: "deleteDocument"; docId: string }
  | { type: "updateDocumentTitle"; docId: string; title: string }
  | { type: "updateDocumentSavedAt"; docId: string; savedAt: number | null }
  | { type: "listTopics"; options?: import("../driver/types").ListTopicsOptions }
  | { type: "addDocumentToTopic"; documentId: string; topicId: string }
  | { type: "removeDocumentFromTopic"; documentId: string; topicId: string }
  | { type: "listDocumentsByTopic"; topicId: string; options?: ListDocumentsOptions }
  | { type: "listTopicsByDocument"; documentId: string }
  | { type: "addSubscriptionToTopic"; subscriptionId: string; topicId: string }
  | { type: "removeSubscriptionFromTopic"; subscriptionId: string; topicId: string }
  | { type: "listSubscriptionsByTopic"; topicId: string }
  | { type: "listTopicsBySubscription"; subscriptionId: string }
  // --- RSS Subscription operations ---
  | {
      type: "createRssSubscription";
      subscription: Parameters<DbDriver["createRssSubscription"]>[0];
    }
  | {
      type: "listRssSubscriptions";
      options?: import("../driver/types").ListRssSubscriptionsOptions;
    }
  | { type: "getRssSubscription"; subscriptionId: string }
  | { type: "getRssSubscriptionByUrl"; url: string }
  | {
      type: "updateRssSubscription";
      subscriptionId: string;
      updates: Parameters<DbDriver["updateRssSubscription"]>[1];
    }
  | { type: "deleteRssSubscription"; subscriptionId: string }
  // --- Feed Item operations ---
  | { type: "getFeedItemByGuid"; subscriptionId: string; guid: string }
  | { type: "createFeedItem"; item: Parameters<DbDriver["createFeedItem"]>[0] }
  | { type: "updateFeedItem"; itemId: string; updates: Parameters<DbDriver["updateFeedItem"]>[1] }
  | { type: "listFeedItems"; options?: import("../driver/types").ListFeedItemsOptions }
  | { type: "countUnreadFeedItems"; subscriptionId?: string }
  // --- Content Item operations ---
  | { type: "upsertContentItem"; item: import("../driver/types").ContentItemRow }
  | { type: "getContentItem"; itemId: string }
  | { type: "getContentItemByHash"; canonicalHash: string }
  | { type: "listContentItems"; options?: import("../driver/types").ListContentItemsOptions }
  | { type: "deleteContentItem"; itemId: string }
  // --- Digest operations ---
  | { type: "createDigest"; digest: Parameters<DbDriver["createDigest"]>[0] }
  | { type: "updateDigest"; digestId: string; updates: Parameters<DbDriver["updateDigest"]>[1] }
  | { type: "getDigest"; digestId: string }
  | { type: "getDigestByDate"; userId: string; date: string }
  | { type: "listDigests"; options: import("../driver/types").ListDigestsOptions }
  | { type: "deleteDigest"; digestId: string }
  // --- Digest Card operations ---
  | { type: "createDigestCard"; card: import("../driver/types").DigestCardRow }
  | { type: "listDigestCards"; digestId: string }
  | { type: "linkCardSource"; cardId: string; sourceItemId: string; sourceType: string }
  | { type: "getCardSourceIds"; cardId: string }
  // --- Brief operations ---
  | { type: "createBrief"; brief: Parameters<DbDriver["createBrief"]>[0] }
  | { type: "updateBrief"; briefId: string; updates: Parameters<DbDriver["updateBrief"]>[1] }
  | { type: "getBrief"; briefId: string }
  | { type: "listBriefs"; options?: import("../driver/types").ListBriefsOptions }
  | { type: "deleteBrief"; briefId: string }
  // --- Brief Item operations ---
  | { type: "addBriefItem"; item: import("../driver/types").BriefItemRow }
  | {
      type: "updateBriefItem";
      briefId: string;
      itemId: string;
      updates: Parameters<DbDriver["updateBriefItem"]>[2];
    }
  | { type: "removeBriefItem"; briefId: string; itemId: string }
  | { type: "listBriefItems"; briefId: string }
  // --- Import Control ---
  | { type: "import_enqueue"; input: import("../import/types").CreateImportJobInput }
  | { type: "import_cancel"; jobId: string }
  | { type: "import_delete"; jobId: string }
  | { type: "import_resume" }
  | { type: "import_retry"; jobId: string };

/**
 * Standard response format for all worker requests.
 */
export type WorkerResponse = { success: true; data?: unknown } | { success: false; error: string };

/**
 * Events emitted by the worker to the main thread.
 */
export type WorkerEvent =
  | { type: "onJobProgress"; jobId: string; progress: number }
  | { type: "onJobStatusChange"; jobId: string; status: ImportJobStatus }
  | { type: "onJobComplete"; jobId: string; documentId: string }
  | { type: "onJobFailed"; jobId: string; error: string };

/**
 * Message format for worker-to-main-thread communication.
 */
export type WorkerMessage =
  | { id: number; response: WorkerResponse }
  | { type: "event"; event: WorkerEvent };

/**
 * Message format for main-thread-to-worker communication.
 */
export type WorkerIncomingMessage = { id: number; request: WorkerRequest };
