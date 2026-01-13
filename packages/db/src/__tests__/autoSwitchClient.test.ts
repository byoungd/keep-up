import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoSwitchDbClient } from "../client";
import type { DbDriver } from "../driver/types";

const { acquireLeadershipMock, MockIndexedDbDriver } = vi.hoisted(() => {
  const acquireLeadershipMock = vi.fn(async (callback?: (isLeader: boolean) => void) => {
    callback?.(true);
    return { isLeader: true, release: vi.fn() };
  });

  class MockIndexedDbDriver implements DbDriver {
    init = vi.fn<DbDriver["init"]>(async () => ({
      driver: "idb-dexie",
      schemaVersion: 1,
      initTimeMs: 1,
    }));

    close = vi.fn(async () => undefined);

    getDocument = vi.fn(async () => null);

    upsertDocument = vi.fn(async () => undefined);

    appendUpdate = vi.fn(async () => undefined);

    listUpdates = vi.fn(async () => []);

    getAnnotation = vi.fn(async () => null);

    upsertAnnotation = vi.fn(async () => undefined);

    listAnnotations = vi.fn(async () => []);

    enqueueOutbox = vi.fn(async () => undefined);

    claimOutboxItems = vi.fn(async () => []);

    ackOutboxItem = vi.fn(async () => undefined);

    failOutboxItem = vi.fn(async () => undefined);

    createImportJob = vi.fn(async () => undefined);

    updateImportJob = vi.fn(async () => undefined);

    getImportJob = vi.fn(async () => null);

    listImportJobs = vi.fn(async () => []);

    getImportJobBySource = vi.fn(async () => null);

    createRawAsset = vi.fn(async () => undefined);

    getRawAssetByHash = vi.fn(async () => null);

    linkDocumentAsset = vi.fn(async () => undefined);

    listDocuments = vi.fn(async () => []);

    deleteDocument = vi.fn(async () => undefined);

    updateDocumentTitle = vi.fn(async () => undefined);

    updateDocumentSavedAt = vi.fn(async () => undefined);

    createTopic = vi.fn(async () => undefined);

    listTopics = vi.fn(async () => []);

    updateTopic = vi.fn(async () => undefined);

    deleteTopic = vi.fn(async () => undefined);

    getTopic = vi.fn(async () => null);

    addDocumentToTopic = vi.fn(async () => undefined);

    removeDocumentFromTopic = vi.fn(async () => undefined);

    listDocumentsByTopic = vi.fn(async () => []);

    listTopicsByDocument = vi.fn(async () => []);

    deleteImportJob = vi.fn(async () => undefined);

    healthCheck = vi.fn<DbDriver["healthCheck"]>(async () => ({
      driver: "idb-dexie",
      schemaVersion: 1,
      isLeader: false,
      opfsAvailable: false,
      idbAvailable: true,
    }));

    reset = vi.fn(async () => undefined);

    batch: DbDriver["batch"] = async <T>(ops: Array<() => Promise<T>>) =>
      Promise.all(ops.map((op) => op()));

    transaction: DbDriver["transaction"] = async <T>(
      fn: (tx: import("../driver/types").DbTransaction) => Promise<T>
    ) =>
      fn({
        upsertDocument: this.upsertDocument,
        appendUpdate: this.appendUpdate,
        upsertAnnotation: this.upsertAnnotation,
        enqueueOutbox: this.enqueueOutbox,
      });

    // RSS stub methods
    createRssSubscription = vi.fn(async () => undefined);
    listRssSubscriptions = vi.fn(async () => []);
    getRssSubscription = vi.fn(async () => null);
    getRssSubscriptionByUrl = vi.fn(async () => null);
    updateRssSubscription = vi.fn(async () => undefined);
    deleteRssSubscription = vi.fn(async () => undefined);
    getFeedItemByGuid = vi.fn(async () => null);
    createFeedItem = vi.fn(async () => undefined);
    updateFeedItem = vi.fn(async () => undefined);
    listFeedItems = vi.fn(async () => []);
    countUnreadFeedItems = vi.fn(async () => 0);

    // Content Item stub methods
    upsertContentItem = vi.fn(async () => undefined);
    getContentItem = vi.fn(async () => null);
    getContentItemByHash = vi.fn(async () => null);
    listContentItems = vi.fn(async () => []);
    deleteContentItem = vi.fn(async () => undefined);

    // Digest stub methods
    createDigest = vi.fn(async () => undefined);
    updateDigest = vi.fn(async () => undefined);
    getDigest = vi.fn(async () => null);
    getDigestByDate = vi.fn(async () => null);
    listDigests = vi.fn(async () => []);
    deleteDigest = vi.fn(async () => undefined);

    // Topic stub methods added previously, ensuring complete list if DbDriver changed
    addSubscriptionToTopic = vi.fn(async () => undefined);
    removeSubscriptionFromTopic = vi.fn(async () => undefined);
    listSubscriptionsByTopic = vi.fn(async () => []);
    listTopicsBySubscription = vi.fn(async () => []);

    // Digest Card stub methods
    createDigestCard = vi.fn(async () => undefined);
    listDigestCards = vi.fn(async () => []);
    linkCardSource = vi.fn(async () => undefined);
    getCardSourceIds = vi.fn(async () => []);

    // Brief stub methods
    createBrief = vi.fn(async () => undefined);
    updateBrief = vi.fn(async () => undefined);
    getBrief = vi.fn(async () => null);
    listBriefs = vi.fn(async () => []);
    deleteBrief = vi.fn(async () => undefined);

    // Brief Item stub methods
    addBriefItem = vi.fn(async () => undefined);
    updateBriefItem = vi.fn(async () => undefined);
    removeBriefItem = vi.fn(async () => undefined);
    listBriefItems = vi.fn(async () => []);
  }

  return { acquireLeadershipMock, MockIndexedDbDriver };
});

vi.mock("../leaderElection", () => ({
  acquireLeadership: acquireLeadershipMock,
  isWebLocksAvailable: () => true,
}));

vi.mock("../driver/idb-dexie/index", () => ({
  IndexedDbDriver: MockIndexedDbDriver,
}));

function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("AutoSwitchDbClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage = createLocalStorage();
  });

  it("honors sticky IDB preference and exposes fallback reason in health", async () => {
    localStorage.setItem("reader_db_driver_pref", "idb-dexie");

    const client = new AutoSwitchDbClient("worker.js");
    const leaderCb = vi.fn();
    client.onLeaderChange(leaderCb);
    const initResult = await client.init();

    expect(initResult.fallbackReason).toBe("sticky-preference");
    expect(acquireLeadershipMock).toHaveBeenCalledTimes(1);

    const acquirePromise = acquireLeadershipMock.mock.results[0]?.value;
    if (acquirePromise instanceof Promise) {
      await acquirePromise;
    }

    expect(leaderCb).toHaveBeenCalledWith(true);

    const health = await client.healthCheck();
    expect(health.fallbackReason).toBe("sticky-preference");
  });
});
