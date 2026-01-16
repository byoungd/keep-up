/**
 * Worker RPC Request Handler
 *
 * Extracted from worker/index.ts to reduce file size and improve maintainability.
 * Contains the main RPC dispatch logic for handling database worker requests.
 *
 * @module rpcHandler
 */

import type { DbDriver } from "../driver/types";
import type { ImportManager } from "../import/ImportManager";
import type { WorkerRequest, WorkerResponse } from "./rpcTypes";

/**
 * Handle a worker RPC request by dispatching to the appropriate driver method.
 *
 * @param request - The incoming worker request
 * @param impl - The database driver implementation
 * @param importMgr - Optional import manager for import operations
 * @returns A promise resolving to the worker response
 */
export async function handleWorkerRequest(
  request: WorkerRequest,
  impl: DbDriver,
  importMgr?: ImportManager
): Promise<WorkerResponse> {
  try {
    let data: unknown;

    switch (request.type) {
      case "init":
        data = await impl.init();
        break;
      case "close":
        await impl.close();
        break;
      case "getDocument":
        data = await impl.getDocument(request.docId);
        break;
      case "upsertDocument":
        await impl.upsertDocument(request.doc);
        break;
      case "appendUpdate":
        await impl.appendUpdate(request.update);
        break;
      case "deleteDocument":
        await impl.deleteDocument(request.docId);
        break;
      case "updateDocumentTitle":
        await impl.updateDocumentTitle(request.docId, request.title);
        break;
      case "updateDocumentSavedAt":
        await impl.updateDocumentSavedAt(request.docId, request.savedAt);
        break;
      case "listUpdates":
        data = await impl.listUpdates(request.options);
        break;
      case "getAnnotation":
        data = await impl.getAnnotation(request.annotationId);
        break;
      case "upsertAnnotation":
        await impl.upsertAnnotation(request.annotation);
        break;
      case "listAnnotations":
        data = await impl.listAnnotations(request.options);
        break;
      case "enqueueOutbox":
        await impl.enqueueOutbox(request.item);
        break;
      case "claimOutboxItems":
        data = await impl.claimOutboxItems(request.limit);
        break;
      case "ackOutboxItem":
        await impl.ackOutboxItem(request.outboxId);
        break;
      case "failOutboxItem":
        await impl.failOutboxItem(request.outboxId, request.nextRetryAt);
        break;
      case "healthCheck":
        data = await impl.healthCheck();
        break;
      case "reset":
        await impl.reset();
        break;
      case "createImportJob":
        await impl.createImportJob(request.job);
        break;
      case "updateImportJob":
        await impl.updateImportJob(request.jobId, request.updates);
        break;
      case "getImportJob":
        data = await impl.getImportJob(request.jobId);
        break;
      case "listImportJobs":
        data = await impl.listImportJobs(request.options);
        break;
      case "getImportJobBySource":
        data = await impl.getImportJobBySource(request.sourceType, request.sourceRef);
        break;
      case "deleteImportJob":
        await impl.deleteImportJob(request.jobId);
        break;
      case "createRawAsset":
        await impl.createRawAsset(request.asset);
        break;
      case "getRawAssetByHash":
        data = await impl.getRawAssetByHash(request.assetHash);
        break;
      case "linkDocumentAsset":
        await impl.linkDocumentAsset(request.documentId, request.assetId, request.role);
        break;
      case "listDocuments":
        data = await impl.listDocuments(request.options);
        break;
      case "createTopic":
        await impl.createTopic(request.topic);
        break;
      case "updateTopic":
        await impl.updateTopic(request.topicId, request.updates);
        break;
      case "deleteTopic":
        await impl.deleteTopic(request.topicId);
        break;
      case "getTopic":
        data = await impl.getTopic(request.topicId);
        break;
      case "addDocumentToTopic":
        await impl.addDocumentToTopic(request.documentId, request.topicId);
        break;
      case "removeDocumentFromTopic":
        await impl.removeDocumentFromTopic(request.documentId, request.topicId);
        break;
      case "listDocumentsByTopic":
        data = await impl.listDocumentsByTopic(request.topicId, request.options);
        break;
      case "listTopicsByDocument":
        data = await impl.listTopicsByDocument(request.documentId);
        break;
      case "addSubscriptionToTopic":
        await impl.addSubscriptionToTopic(request.subscriptionId, request.topicId);
        break;
      case "removeSubscriptionFromTopic":
        await impl.removeSubscriptionFromTopic(request.subscriptionId, request.topicId);
        break;
      case "listSubscriptionsByTopic":
        data = await impl.listSubscriptionsByTopic(request.topicId);
        break;
      case "listTopicsBySubscription":
        data = await impl.listTopicsBySubscription(request.subscriptionId);
        break;
      case "listTopics":
        data = await impl.listTopics(request.options);
        break;
      // --- RSS Subscription operations ---
      case "createRssSubscription":
        await impl.createRssSubscription(request.subscription);
        break;
      case "listRssSubscriptions":
        data = await impl.listRssSubscriptions(request.options);
        break;
      case "getRssSubscription":
        data = await impl.getRssSubscription(request.subscriptionId);
        break;
      case "getRssSubscriptionByUrl":
        data = await impl.getRssSubscriptionByUrl(request.url);
        break;
      case "updateRssSubscription":
        await impl.updateRssSubscription(request.subscriptionId, request.updates);
        break;
      case "deleteRssSubscription":
        await impl.deleteRssSubscription(request.subscriptionId);
        break;
      // --- Feed Item operations ---
      case "getFeedItemByGuid":
        data = await impl.getFeedItemByGuid(request.subscriptionId, request.guid);
        break;
      case "createFeedItem":
        await impl.createFeedItem(request.item);
        break;
      case "updateFeedItem":
        await impl.updateFeedItem(request.itemId, request.updates);
        break;
      case "listFeedItems":
        data = await impl.listFeedItems(request.options);
        break;
      case "countUnreadFeedItems":
        data = await impl.countUnreadFeedItems(request.subscriptionId);
        break;
      case "import_enqueue": {
        if (!importMgr) {
          throw new Error("ImportManager not available in worker");
        }
        data = await importMgr.enqueue(request.input);
        break;
      }
      case "import_cancel": {
        if (!importMgr) {
          throw new Error("ImportManager not available in worker");
        }
        await importMgr.cancelJob(request.jobId);
        break;
      }
      case "import_delete": {
        if (!importMgr) {
          throw new Error("ImportManager not available in worker");
        }
        data = await importMgr.deleteJob(request.jobId);
        break;
      }
      case "import_resume": {
        if (!importMgr) {
          throw new Error("ImportManager not available in worker");
        }
        await importMgr.resume();
        break;
      }
      case "import_retry": {
        if (!importMgr) {
          throw new Error("ImportManager not available in worker");
        }
        await importMgr.retryJob(request.jobId);
        break;
      }
      // --- Content Item operations ---
      case "upsertContentItem":
        await impl.upsertContentItem(request.item);
        break;
      case "getContentItem":
        data = await impl.getContentItem(request.itemId);
        break;
      case "getContentItemByHash":
        data = await impl.getContentItemByHash(request.canonicalHash);
        break;
      case "listContentItems":
        data = await impl.listContentItems(request.options);
        break;
      case "deleteContentItem":
        await impl.deleteContentItem(request.itemId);
        break;
      // --- Digest operations ---
      case "createDigest":
        await impl.createDigest(request.digest);
        break;
      case "updateDigest":
        await impl.updateDigest(request.digestId, request.updates);
        break;
      case "getDigest":
        data = await impl.getDigest(request.digestId);
        break;
      case "getDigestByDate":
        data = await impl.getDigestByDate(request.userId, request.date);
        break;
      case "listDigests":
        data = await impl.listDigests(request.options);
        break;
      case "deleteDigest":
        await impl.deleteDigest(request.digestId);
        break;
      // --- Digest Card operations ---
      case "createDigestCard":
        await impl.createDigestCard(request.card);
        break;
      case "listDigestCards":
        data = await impl.listDigestCards(request.digestId);
        break;
      case "linkCardSource":
        await impl.linkCardSource(request.cardId, request.sourceItemId, request.sourceType);
        break;
      case "getCardSourceIds":
        data = await impl.getCardSourceIds(request.cardId);
        break;
      // --- Brief operations ---
      case "createBrief":
        await impl.createBrief(request.brief);
        break;
      case "updateBrief":
        await impl.updateBrief(request.briefId, request.updates);
        break;
      case "getBrief":
        data = await impl.getBrief(request.briefId);
        break;
      case "listBriefs":
        data = await impl.listBriefs(request.options);
        break;
      case "deleteBrief":
        await impl.deleteBrief(request.briefId);
        break;
      // --- Brief Item operations ---
      case "addBriefItem":
        await impl.addBriefItem(request.item);
        break;
      case "updateBriefItem":
        await impl.updateBriefItem(request.briefId, request.itemId, request.updates);
        break;
      case "removeBriefItem":
        await impl.removeBriefItem(request.briefId, request.itemId);
        break;
      case "listBriefItems":
        data = await impl.listBriefItems(request.briefId);
        break;
      default: {
        const _exhaustiveCheck: never = request;
        return {
          success: false,
          error: `Unsupported worker request: ${(request as { type: string }).type}`,
        };
      }
    }

    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
