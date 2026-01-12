import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_COMPACTION_POLICY, runCompaction, shouldCompact } from "../compaction";
import { getRecoveryState, recoverDoc } from "../recovery";
import { InMemoryStorage } from "../storage";
import type { DocSnapshot, OpLogEntry } from "../types";

describe("InMemoryStorage", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it("stores and retrieves snapshots", async () => {
    const snapshot: DocSnapshot = {
      docId: "doc-1",
      data: new Uint8Array([1, 2, 3]),
      frontierTag: "tag-1",
      seq: 1,
      createdAt: new Date().toISOString(),
      sizeBytes: 3,
    };

    await storage.saveSnapshot(snapshot);
    const retrieved = await storage.getLatestSnapshot("doc-1");

    expect(retrieved).toEqual(snapshot);
  });

  it("stores and retrieves updates", async () => {
    const update: OpLogEntry = {
      docId: "doc-1",
      seq: 1,
      data: new Uint8Array([4, 5, 6]),
      frontierTag: "tag-2",
      parentFrontierTag: "tag-1",
      clientId: "client-1",
      timestamp: new Date().toISOString(),
      sizeBytes: 3,
    };

    await storage.appendUpdate(update);
    const updates = await storage.getUpdates("doc-1");

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(update);
  });

  it("filters updates by seq", async () => {
    for (let i = 1; i <= 5; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "client-1",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const updates = await storage.getUpdates("doc-1", 3);
    expect(updates).toHaveLength(2);
    expect(updates[0].seq).toBe(4);
    expect(updates[1].seq).toBe(5);
  });

  it("deletes updates before seq", async () => {
    for (let i = 1; i <= 5; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "client-1",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    await storage.deleteUpdates("doc-1", 3);
    const updates = await storage.getUpdates("doc-1");

    expect(updates).toHaveLength(3);
    expect(updates[0].seq).toBe(3);
  });

  it("tracks frontier tag", async () => {
    await storage.appendUpdate({
      docId: "doc-1",
      seq: 1,
      data: new Uint8Array([1]),
      frontierTag: "latest-tag",
      parentFrontierTag: "",
      clientId: "client-1",
      timestamp: new Date().toISOString(),
      sizeBytes: 1,
    });

    const tag = await storage.getCurrentFrontierTag("doc-1");
    expect(tag).toBe("latest-tag");
  });

  it("lists and deletes docs", async () => {
    await storage.appendUpdate({
      docId: "doc-1",
      seq: 1,
      data: new Uint8Array([1]),
      frontierTag: "tag",
      parentFrontierTag: "",
      clientId: "c",
      timestamp: new Date().toISOString(),
      sizeBytes: 1,
    });

    await storage.appendUpdate({
      docId: "doc-2",
      seq: 1,
      data: new Uint8Array([2]),
      frontierTag: "tag",
      parentFrontierTag: "",
      clientId: "c",
      timestamp: new Date().toISOString(),
      sizeBytes: 1,
    });

    expect(await storage.listDocs()).toHaveLength(2);
    expect(await storage.docExists("doc-1")).toBe(true);

    await storage.deleteDoc("doc-1");

    expect(await storage.listDocs()).toHaveLength(1);
    expect(await storage.docExists("doc-1")).toBe(false);
  });
});

describe("Compaction", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it("triggers compaction when update threshold reached", async () => {
    for (let i = 1; i <= 100; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const should = await shouldCompact("doc-1", storage, DEFAULT_COMPACTION_POLICY);
    expect(should).toBe(true);
  });

  it("does not trigger compaction below threshold", async () => {
    for (let i = 1; i <= 50; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const should = await shouldCompact("doc-1", storage, DEFAULT_COMPACTION_POLICY);
    expect(should).toBe(false);
  });

  it("runs compaction and creates snapshot", async () => {
    for (let i = 1; i <= 50; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const result = await runCompaction(
      {
        storage,
        createSnapshot: async () => new Uint8Array([99, 99, 99]),
      },
      "doc-1"
    );

    expect(result.newSnapshot.seq).toBe(1);
    expect(result.newSnapshot.data).toEqual(new Uint8Array([99, 99, 99]));
    expect(result.prunedUpdates).toBe(40);
    expect(result.keptUpdates).toBe(10);
  });

  it("compaction preserves recent updates", async () => {
    for (let i = 1; i <= 20; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    await runCompaction(
      {
        storage,
        policy: { ...DEFAULT_COMPACTION_POLICY, keepRecentUpdates: 5 },
        createSnapshot: async () => new Uint8Array([1]),
      },
      "doc-1"
    );

    const remaining = await storage.getUpdates("doc-1");
    expect(remaining).toHaveLength(5);
    expect(remaining[0].seq).toBe(16);
  });
});

describe("Recovery", () => {
  let storage: InMemoryStorage;
  let appliedSnapshots: Array<{ docId: string; data: Uint8Array }>;
  let appliedUpdates: Array<{ docId: string; data: Uint8Array }>;

  beforeEach(() => {
    storage = new InMemoryStorage();
    appliedSnapshots = [];
    appliedUpdates = [];
  });

  const recoveryOptions = () => ({
    storage,
    applySnapshot: async (docId: string, data: Uint8Array) => {
      appliedSnapshots.push({ docId, data });
    },
    applyUpdate: async (docId: string, data: Uint8Array) => {
      appliedUpdates.push({ docId, data });
      return `tag-${appliedUpdates.length}`;
    },
  });

  it("recovers from snapshot only", async () => {
    await storage.saveSnapshot({
      docId: "doc-1",
      data: new Uint8Array([1, 2, 3]),
      frontierTag: "snap-tag",
      seq: 1,
      createdAt: new Date().toISOString(),
      sizeBytes: 3,
    });

    const result = await recoverDoc(recoveryOptions(), "doc-1");

    expect(result.success).toBe(true);
    expect(result.snapshotUsed).toBe(true);
    expect(result.updatesApplied).toBe(0);
    expect(appliedSnapshots).toHaveLength(1);
  });

  it("recovers from updates only", async () => {
    for (let i = 1; i <= 3; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const result = await recoverDoc(recoveryOptions(), "doc-1");

    expect(result.success).toBe(true);
    expect(result.snapshotUsed).toBe(false);
    expect(result.updatesApplied).toBe(3);
    expect(appliedUpdates).toHaveLength(3);
  });

  it("recovers from snapshot + updates", async () => {
    await storage.saveSnapshot({
      docId: "doc-1",
      data: new Uint8Array([1]),
      frontierTag: "snap-tag",
      seq: 5,
      createdAt: new Date().toISOString(),
      sizeBytes: 1,
    });

    for (let i = 6; i <= 8; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const result = await recoverDoc(recoveryOptions(), "doc-1");

    expect(result.success).toBe(true);
    expect(result.snapshotUsed).toBe(true);
    expect(result.updatesApplied).toBe(3);
    expect(appliedSnapshots).toHaveLength(1);
    expect(appliedUpdates).toHaveLength(3);
  });

  it("handles recovery errors", async () => {
    await storage.appendUpdate({
      docId: "doc-1",
      seq: 1,
      data: new Uint8Array([1]),
      frontierTag: "tag-1",
      parentFrontierTag: "",
      clientId: "c",
      timestamp: new Date().toISOString(),
      sizeBytes: 1,
    });

    const result = await recoverDoc(
      {
        storage,
        applySnapshot: async () => {
          // Mock implementation
        },
        applyUpdate: async () => {
          throw new Error("Apply failed");
        },
      },
      "doc-1"
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Apply failed");
  });

  it("gets recovery state", async () => {
    await storage.saveSnapshot({
      docId: "doc-1",
      data: new Uint8Array([1]),
      frontierTag: "snap-tag",
      seq: 5,
      createdAt: new Date().toISOString(),
      sizeBytes: 1,
    });

    for (let i = 6; i <= 10; i++) {
      await storage.appendUpdate({
        docId: "doc-1",
        seq: i,
        data: new Uint8Array([i]),
        frontierTag: `tag-${i}`,
        parentFrontierTag: `tag-${i - 1}`,
        clientId: "c",
        timestamp: new Date().toISOString(),
        sizeBytes: 1,
      });
    }

    const state = await getRecoveryState(storage, "doc-1");

    expect(state.hasSnapshot).toBe(true);
    expect(state.snapshotSeq).toBe(5);
    expect(state.pendingUpdates).toBe(5);
    expect(state.frontierTag).toBe("tag-10");
  });
});
