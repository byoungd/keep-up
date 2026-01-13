import { describe, expect, it, vi } from "vitest";
import type { DbDriver, DbHealthInfo, DbInitResult, ImportJobRow } from "../driver/types";
import { type WorkerRequest, handleWorkerRequest } from "../worker";

function createStubDriver(): { driver: DbDriver; initResult: DbInitResult; jobRow: ImportJobRow } {
  const initResult: DbInitResult = { driver: "sqlite-opfs", schemaVersion: 2, initTimeMs: 5 };
  const health: DbHealthInfo = {
    driver: "sqlite-opfs",
    schemaVersion: 2,
    isLeader: false,
    opfsAvailable: true,
    idbAvailable: true,
  };
  const jobRow: ImportJobRow = {
    jobId: "job-1",
    sourceType: "url",
    sourceRef: "https://example.com",
    status: "queued",
    progress: 0,
    errorCode: null,
    errorMessage: null,
    resultDocumentId: null,
    assetId: null,
    documentVersionId: null,
    dedupeHit: null,
    attemptCount: 0,
    nextRetryAt: null,
    parserVersion: null,
    createdAt: 0,
    updatedAt: 0,
  };

  const init = vi.fn().mockResolvedValue(initResult);
  const close = vi.fn().mockResolvedValue(undefined);
  const getDocument = vi.fn<DbDriver["getDocument"]>().mockResolvedValue(null);
  const upsertDocument = vi.fn().mockResolvedValue(undefined);
  const appendUpdate = vi.fn<DbDriver["appendUpdate"]>().mockResolvedValue(undefined);
  const listUpdates = vi.fn<DbDriver["listUpdates"]>().mockResolvedValue([]);
  const getAnnotation = vi.fn<DbDriver["getAnnotation"]>().mockResolvedValue(null);
  const upsertAnnotation = vi.fn().mockResolvedValue(undefined);
  const listAnnotations = vi.fn<DbDriver["listAnnotations"]>().mockResolvedValue([]);
  const enqueueOutbox = vi.fn().mockResolvedValue(undefined);
  const claimOutboxItems = vi.fn<DbDriver["claimOutboxItems"]>().mockResolvedValue([]);
  const ackOutboxItem = vi.fn().mockResolvedValue(undefined);
  const failOutboxItem = vi.fn().mockResolvedValue(undefined);
  const createImportJob = vi.fn().mockResolvedValue(undefined);
  const updateImportJob = vi.fn().mockResolvedValue(undefined);
  const getImportJob = vi.fn<DbDriver["getImportJob"]>().mockResolvedValue(jobRow);
  const listImportJobs = vi.fn<DbDriver["listImportJobs"]>().mockResolvedValue([jobRow]);
  const getImportJobBySource = vi.fn<DbDriver["getImportJobBySource"]>().mockResolvedValue(jobRow);
  const createRawAsset = vi.fn().mockResolvedValue(undefined);
  const getRawAssetByHash = vi.fn().mockResolvedValue(null);
  const linkDocumentAsset = vi.fn().mockResolvedValue(undefined);
  const listDocuments = vi.fn().mockResolvedValue([]);
  const deleteDocument = vi.fn().mockResolvedValue(undefined);
  const updateDocumentTitle = vi.fn().mockResolvedValue(undefined);
  const updateDocumentSavedAt = vi.fn().mockResolvedValue(undefined);
  const createTopic = vi.fn().mockResolvedValue(undefined);
  const updateTopic = vi.fn().mockResolvedValue(undefined);
  const deleteTopic = vi.fn().mockResolvedValue(undefined);
  const getTopic = vi.fn().mockResolvedValue(null);
  const listTopics = vi.fn().mockResolvedValue([]);
  const addDocumentToTopic = vi.fn().mockResolvedValue(undefined);
  const removeDocumentFromTopic = vi.fn().mockResolvedValue(undefined);
  const listDocumentsByTopic = vi.fn().mockResolvedValue([]);
  const listTopicsByDocument = vi.fn().mockResolvedValue([]);
  const addSubscriptionToTopic = vi.fn().mockResolvedValue(undefined);
  const removeSubscriptionFromTopic = vi.fn().mockResolvedValue(undefined);
  const listSubscriptionsByTopic = vi.fn().mockResolvedValue([]);
  const listTopicsBySubscription = vi.fn().mockResolvedValue([]);
  const deleteImportJob = vi.fn().mockResolvedValue(undefined);
  const healthCheck = vi.fn<DbDriver["healthCheck"]>().mockResolvedValue(health);
  const reset = vi.fn<DbDriver["reset"]>().mockResolvedValue(undefined);
  const batch: DbDriver["batch"] = async (ops) => Promise.all(ops.map((op) => op()));
  const transaction: DbDriver["transaction"] = async (fn) =>
    fn({
      upsertDocument,
      appendUpdate,
      upsertAnnotation,
      enqueueOutbox,
    });
  // RSS stub methods
  const createRssSubscription = vi.fn().mockResolvedValue(undefined);
  const listRssSubscriptions = vi.fn().mockResolvedValue([]);
  const getRssSubscription = vi.fn().mockResolvedValue(null);
  const getRssSubscriptionByUrl = vi.fn().mockResolvedValue(null);
  const updateRssSubscription = vi.fn().mockResolvedValue(undefined);
  const deleteRssSubscription = vi.fn().mockResolvedValue(undefined);
  const getFeedItemByGuid = vi.fn().mockResolvedValue(null);
  const createFeedItem = vi.fn().mockResolvedValue(undefined);
  const updateFeedItem = vi.fn().mockResolvedValue(undefined);
  const listFeedItems = vi.fn().mockResolvedValue([]);
  const countUnreadFeedItems = vi.fn().mockResolvedValue(0);
  // Content Item stub methods
  const upsertContentItem = vi.fn().mockResolvedValue(undefined);
  const getContentItem = vi.fn().mockResolvedValue(null);
  const getContentItemByHash = vi.fn().mockResolvedValue(null);
  const listContentItems = vi.fn().mockResolvedValue([]);
  const deleteContentItem = vi.fn().mockResolvedValue(undefined);
  // Digest stub methods
  const createDigest = vi.fn().mockResolvedValue(undefined);
  const updateDigest = vi.fn().mockResolvedValue(undefined);
  const getDigest = vi.fn().mockResolvedValue(null);
  const getDigestByDate = vi.fn().mockResolvedValue(null);
  const listDigests = vi.fn().mockResolvedValue([]);
  const deleteDigest = vi.fn().mockResolvedValue(undefined);
  // Digest Card stub methods
  const createDigestCard = vi.fn().mockResolvedValue(undefined);
  const listDigestCards = vi.fn().mockResolvedValue([]);
  const linkCardSource = vi.fn().mockResolvedValue(undefined);
  const getCardSourceIds = vi.fn().mockResolvedValue([]);

  // Brief stub methods
  const createBrief = vi.fn().mockResolvedValue(undefined);
  const updateBrief = vi.fn().mockResolvedValue(undefined);
  const getBrief = vi.fn().mockResolvedValue(null);
  const listBriefs = vi.fn().mockResolvedValue([]);
  const deleteBrief = vi.fn().mockResolvedValue(undefined);

  // Brief Item stub methods
  const addBriefItem = vi.fn().mockResolvedValue(undefined);
  const updateBriefItem = vi.fn().mockResolvedValue(undefined);
  const removeBriefItem = vi.fn().mockResolvedValue(undefined);
  const listBriefItems = vi.fn().mockResolvedValue([]);

  const driver: DbDriver = {
    init,
    close,
    getDocument,
    upsertDocument,
    appendUpdate,
    listUpdates,
    getAnnotation,
    upsertAnnotation,
    listAnnotations,
    enqueueOutbox,
    claimOutboxItems,
    ackOutboxItem,
    failOutboxItem,
    createImportJob,
    updateImportJob,
    getImportJob,
    listImportJobs,
    getImportJobBySource,
    createRawAsset,
    getRawAssetByHash,
    linkDocumentAsset,
    listDocuments,
    deleteDocument,
    updateDocumentTitle,
    updateDocumentSavedAt,
    createTopic,
    updateTopic,
    deleteTopic,
    getTopic,
    listTopics,
    addDocumentToTopic,
    removeDocumentFromTopic,
    listDocumentsByTopic,
    listTopicsByDocument,
    addSubscriptionToTopic,
    removeSubscriptionFromTopic,
    listSubscriptionsByTopic,
    listTopicsBySubscription,
    deleteImportJob,
    healthCheck,
    reset,
    batch,
    transaction,
    // RSS methods
    createRssSubscription,
    listRssSubscriptions,
    getRssSubscription,
    getRssSubscriptionByUrl,
    updateRssSubscription,
    deleteRssSubscription,
    getFeedItemByGuid,
    createFeedItem,
    updateFeedItem,
    listFeedItems,
    countUnreadFeedItems,
    // Content Item methods
    upsertContentItem,
    getContentItem,
    getContentItemByHash,
    listContentItems,
    deleteContentItem,
    // Digest methods
    createDigest,
    updateDigest,
    getDigest,
    getDigestByDate,
    listDigests,
    deleteDigest,
    // Digest Card methods
    createDigestCard,
    listDigestCards,
    linkCardSource,
    getCardSourceIds,
    // Brief methods
    createBrief,
    updateBrief,
    getBrief,
    listBriefs,
    deleteBrief,
    // Brief Item methods
    addBriefItem,
    updateBriefItem,
    removeBriefItem,
    listBriefItems,
  };

  return { driver, initResult, jobRow };
}

describe("worker request routing", () => {
  it("returns init payload from driver", async () => {
    const { driver, initResult } = createStubDriver();
    const response = await handleWorkerRequest({ type: "init" }, driver);
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data).toEqual(initResult);
    }
  });

  it("routes import job operations to driver", async () => {
    const { driver, jobRow } = createStubDriver();

    await handleWorkerRequest({ type: "createImportJob", job: jobRow }, driver);
    expect(driver.createImportJob).toHaveBeenCalledWith(jobRow);

    const listResponse = await handleWorkerRequest({ type: "listImportJobs" }, driver);
    expect(listResponse.success).toBe(true);
    if (listResponse.success) {
      expect(listResponse.data).toEqual([jobRow]);
    }

    const bySource = await handleWorkerRequest(
      { type: "getImportJobBySource", sourceType: jobRow.sourceType, sourceRef: jobRow.sourceRef },
      driver
    );
    expect(bySource.success).toBe(true);
    if (bySource.success) {
      expect(bySource.data).toEqual(jobRow);
    }
  });

  it("returns error response on unsupported type", async () => {
    const { driver } = createStubDriver();
    const response = await handleWorkerRequest(
      { type: "unknown" } as unknown as WorkerRequest,
      driver
    );
    expect(response.success).toBe(false);
  });
});
