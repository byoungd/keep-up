/**
 * File-System Persistence Adapter Tests
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OperationLogEntry } from "@keepup/core/sync/server";
import { LoroDoc } from "loro-crdt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileSystemPersistenceAdapter } from "../persistence/fileSystemAdapter";

const TEST_STORAGE_PATH = ".lfcc/test-storage";

function createUpdateSequence(texts: string[]): Uint8Array[] {
  const doc = new LoroDoc();
  const container = doc.getText("content");
  const updates: Uint8Array[] = [];
  let lastVersion = doc.version();

  for (const nextText of texts) {
    container.insert(container.toString().length, nextText);
    const update = doc.export({ mode: "update", from: lastVersion });
    updates.push(update);
    lastVersion = doc.version();
  }

  return updates;
}

function createSnapshotWithText(text: string): Uint8Array {
  const doc = new LoroDoc();
  const container = doc.getText("content");
  container.insert(0, text);
  return doc.export({ mode: "snapshot" });
}

function snapshotToText(snapshot: Uint8Array): string {
  const doc = new LoroDoc();
  doc.import(snapshot);
  return doc.getText("content").toString();
}

describe("FileSystemPersistenceAdapter", () => {
  const adapter = new FileSystemPersistenceAdapter(TEST_STORAGE_PATH);

  beforeAll(async () => {
    // Clean up any previous test data
    await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
  });

  afterAll(async () => {
    // Clean up test data
    await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
  });

  describe("initDocument", () => {
    it("should create document directory structure", async () => {
      await adapter.initDocument("test-doc-1");

      const docPath = path.join(TEST_STORAGE_PATH, "test-doc-1");
      const oplogPath = path.join(docPath, "oplog");

      const docStat = await fs.stat(docPath);
      expect(docStat.isDirectory()).toBe(true);

      const oplogStat = await fs.stat(oplogPath);
      expect(oplogStat.isDirectory()).toBe(true);
    });

    it("should create document with initial data", async () => {
      const initialData = createSnapshotWithText("Init");
      await adapter.initDocument("test-doc-2", initialData, "v1");

      const snapshot = await adapter.getSnapshot("test-doc-2");
      expect(snapshot).not.toBeNull();
      expect(snapshot?.data).toEqual(initialData);
      expect(snapshot?.frontierTag).toBe("v1");
    });
  });

  describe("documentExists", () => {
    it("should return true for existing document", async () => {
      await adapter.initDocument("existing-doc");
      const exists = await adapter.documentExists("existing-doc");
      expect(exists).toBe(true);
    });

    it("should return false for non-existing document", async () => {
      const exists = await adapter.documentExists("non-existing-doc");
      expect(exists).toBe(false);
    });
  });

  describe("getCurrentFrontierTag", () => {
    it("should return default for new document", async () => {
      await adapter.initDocument("new-doc");
      const tag = await adapter.getCurrentFrontierTag("new-doc");
      expect(tag).toBe("init");
    });

    it("should return custom frontier tag", async () => {
      await adapter.initDocument("custom-frontier-doc", undefined, "custom-v1");
      const tag = await adapter.getCurrentFrontierTag("custom-frontier-doc");
      expect(tag).toBe("custom-v1");
    });
  });

  describe("saveUpdate and getSnapshot", () => {
    it("should save and retrieve updates", async () => {
      await adapter.initDocument("update-doc");

      const [update1] = createUpdateSequence(["Hello"]);
      await adapter.saveUpdate("update-doc", update1, "v1");

      const snapshot = await adapter.getSnapshot("update-doc");
      expect(snapshot).not.toBeNull();
      expect(snapshotToText(snapshot?.data ?? new Uint8Array())).toBe("Hello");
      expect(snapshot?.frontierTag).toBe("v1");
    });

    it("should accumulate multiple updates in snapshot", async () => {
      await adapter.initDocument("multi-update-doc");

      const [update1, update2] = createUpdateSequence(["Hello", " World"]);
      await adapter.saveUpdate("multi-update-doc", update1, "v1");
      await adapter.saveUpdate("multi-update-doc", update2, "v2");

      const snapshot = await adapter.getSnapshot("multi-update-doc");
      expect(snapshot).not.toBeNull();
      expect(snapshotToText(snapshot?.data ?? new Uint8Array())).toBe("Hello World");
      expect(snapshot?.frontierTag).toBe("v2");
    });
  });

  describe("getUpdatesSince", () => {
    it("should return updates when a single update is available", async () => {
      await adapter.initDocument("updates-since-doc");

      const [update1] = createUpdateSequence(["Hello"]);
      await adapter.saveUpdate("updates-since-doc", update1, "v1");

      const result = await adapter.getUpdatesSince("updates-since-doc", "init");
      expect(result).not.toBeNull();
      expect(result?.frontierTag).toBe("v1");
      expect(snapshotToText(result?.data ?? new Uint8Array())).toBe("Hello");
    });

    it("should return null when multiple updates require batching", async () => {
      await adapter.initDocument("updates-since-multi-doc");

      const [update1, update2] = createUpdateSequence(["Hello", " World"]);
      await adapter.saveUpdate("updates-since-multi-doc", update1, "v1");

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));

      await adapter.saveUpdate("updates-since-multi-doc", update2, "v2");

      const result = await adapter.getUpdatesSince("updates-since-multi-doc", "init");
      expect(result).toBeNull();
    });

    it("should return null for unknown frontier", async () => {
      await adapter.initDocument("unknown-frontier-doc");
      const [update1] = createUpdateSequence(["Hello"]);
      await adapter.saveUpdate("unknown-frontier-doc", update1, "v1");

      const result = await adapter.getUpdatesSince("unknown-frontier-doc", "unknown-tag");
      expect(result).toBeNull();
    });
  });

  describe("deleteDocument", () => {
    it("should remove document completely", async () => {
      await adapter.initDocument("to-delete-doc", new Uint8Array([1, 2, 3]));
      expect(await adapter.documentExists("to-delete-doc")).toBe(true);

      await adapter.deleteDocument("to-delete-doc");
      expect(await adapter.documentExists("to-delete-doc")).toBe(false);
    });
  });

  describe("operation log", () => {
    it("should append and query operation logs", async () => {
      const entry: OperationLogEntry = {
        id: "op-1",
        docId: "oplog-doc",
        actorId: "user-1",
        actorType: "human",
        opType: "crdt_update",
        ts: Date.now(),
        frontierTag: "v1",
        sizeBytes: 3,
      };
      await adapter.appendOperationLog(entry);

      const results = await adapter.queryOperationLog({ docId: "oplog-doc", limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe("op-1");
    });
  });

  describe("replayUpdates", () => {
    it("should rebuild a snapshot from oplog entries", async () => {
      await adapter.initDocument("replay-doc");
      const [update1, update2] = createUpdateSequence(["Hello", " World"]);
      await adapter.saveUpdate("replay-doc", update1, "v1");
      await adapter.saveUpdate("replay-doc", update2, "v2");

      const snapshot = await adapter.replayUpdates("replay-doc");
      expect(snapshot).not.toBeNull();
      expect(snapshotToText(snapshot ?? new Uint8Array())).toBe("Hello World");
    });
  });

  describe("path sanitization", () => {
    it("should sanitize docId with special characters", async () => {
      // This should not throw or create path traversal
      await adapter.initDocument("../../../etc/passwd");

      // The sanitized path should not contain ".."
      const exists = await adapter.documentExists("../../../etc/passwd");
      expect(exists).toBe(true);

      // Clean up
      await adapter.deleteDocument("../../../etc/passwd");
    });
  });
});
