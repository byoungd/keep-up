import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocMetadata } from "../docMetadata";
import { createImportedDocMetadata, createLocalDocMetadata } from "../docMetadata";
import type { DocEntry } from "../docPersistence";

// Module-scoped mock stores
const mockStore = new Map<string, DocEntry>();
const mockMetadataStore = new Map<string, DocMetadata>();

// Mock idb before importing docPersistence
vi.mock("idb", () => {
  return {
    openDB: vi.fn(() =>
      Promise.resolve({
        put: vi.fn((storeName: string, entry: DocEntry | DocMetadata) => {
          if (storeName === "docs") {
            mockStore.set(entry.id, entry as DocEntry);
          } else if (storeName === "metadata") {
            mockMetadataStore.set(entry.id, entry as DocMetadata);
          }
          return Promise.resolve();
        }),
        get: vi.fn((storeName: string, id: string) => {
          if (storeName === "docs") {
            return Promise.resolve(mockStore.get(id));
          }
          if (storeName === "metadata") {
            return Promise.resolve(mockMetadataStore.get(id));
          }
          return Promise.resolve(undefined);
        }),
        delete: vi.fn((storeName: string, id: string) => {
          if (storeName === "docs") {
            mockStore.delete(id);
          } else if (storeName === "metadata") {
            mockMetadataStore.delete(id);
          }
          return Promise.resolve();
        }),
        getAll: vi.fn((storeName: string) => {
          if (storeName === "docs") {
            return Promise.resolve(Array.from(mockStore.values()));
          }
          if (storeName === "metadata") {
            return Promise.resolve(Array.from(mockMetadataStore.values()));
          }
          return Promise.resolve([]);
        }),
        getAllFromIndex: vi.fn((_storeName: string, _indexName: string, key: string) => {
          // Filter metadata by sourceType
          const results = Array.from(mockMetadataStore.values()).filter(
            (m) => m.sourceType === key
          );
          return Promise.resolve(results);
        }),
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            clear: vi.fn(() => {
              mockStore.clear();
              return Promise.resolve();
            }),
          })),
          done: Promise.resolve(),
        })),
      })
    ),
  };
});

// Import after mock setup
const { docPersistence } = await import("../docPersistence");

describe("docPersistence", () => {
  beforeEach(() => {
    mockStore.clear();
    mockMetadataStore.clear();
  });

  describe("saveDoc", () => {
    it("should save a document with checksum and schema version", async () => {
      const snapshot = new Uint8Array([1, 2, 3, 4, 5]);
      await docPersistence.saveDoc("doc-1", snapshot);

      const entry = mockStore.get("doc-1");

      expect(entry).toBeDefined();
      expect(entry?.id).toBe("doc-1");
      expect(entry?.snapshot).toEqual(snapshot);
      expect(entry?.schemaVersion).toBe(2);
      expect(typeof entry?.checksum).toBe("number");
      expect(entry?.checksum).toBeGreaterThan(0);
    });

    it("should update existing document", async () => {
      const snapshot1 = new Uint8Array([1, 2, 3]);
      const snapshot2 = new Uint8Array([4, 5, 6, 7]);

      await docPersistence.saveDoc("doc-1", snapshot1);
      const entry1 = mockStore.get("doc-1");

      await docPersistence.saveDoc("doc-1", snapshot2);
      const entry2 = mockStore.get("doc-1");

      expect(entry2?.snapshot).toEqual(snapshot2);
      expect(entry2?.checksum).not.toBe(entry1?.checksum);
    });
  });

  describe("loadDoc", () => {
    it("should return null for non-existent doc", async () => {
      const result = await docPersistence.loadDoc("does-not-exist");
      expect(result).toBeNull();
    });

    it("should load a saved document", async () => {
      const snapshot = new Uint8Array([10, 20, 30]);
      await docPersistence.saveDoc("doc-2", snapshot);

      const loaded = await docPersistence.loadDoc("doc-2");
      expect(loaded).toEqual(snapshot);
    });
  });

  describe("loadDocWithMetadata", () => {
    it("should recover from corrupted checksum", async () => {
      const snapshot = new Uint8Array([1, 2, 3]);
      await docPersistence.saveDoc("doc-corrupt", snapshot);

      // Corrupt the checksum
      const entry = mockStore.get("doc-corrupt");
      if (entry) {
        mockStore.set("doc-corrupt", { ...entry, checksum: 12345 });
      }

      const result = await docPersistence.loadDocWithMetadata("doc-corrupt");
      expect(result.corrupted).toBe(false);
      expect(result.migrated).toBe(true);
      expect(result.snapshot).toEqual(snapshot);

      const recovered = mockStore.get("doc-corrupt");
      expect(recovered?.schemaVersion).toBe(2);
      expect(recovered?.checksum).not.toBe(12345);
    });

    it("should migrate v1 entries to v2", async () => {
      // Simulate a v1 entry (missing schemaVersion and checksum)
      const v1Entry = {
        id: "old-doc",
        snapshot: new Uint8Array([5, 6, 7]),
        updatedAt: Date.now(),
        schemaVersion: 1,
        checksum: 0, // Invalid checksum for v1
      } as DocEntry;
      mockStore.set("old-doc", v1Entry);

      const result = await docPersistence.loadDocWithMetadata("old-doc");

      // v1 entries are considered valid (no checksum validation for old schema)
      expect(result.corrupted).toBe(false);
      expect(result.migrated).toBe(true);
      expect(result.snapshot).toEqual(new Uint8Array([5, 6, 7]));

      // Check that store was updated with migrated entry
      const migrated = mockStore.get("old-doc");
      expect(migrated?.schemaVersion).toBe(2);
      expect(typeof migrated?.checksum).toBe("number");
    });
  });

  describe("deleteDoc", () => {
    it("should delete a document", async () => {
      await docPersistence.saveDoc("to-delete", new Uint8Array([1]));
      expect(mockStore.has("to-delete")).toBe(true);

      await docPersistence.deleteDoc("to-delete");
      expect(mockStore.has("to-delete")).toBe(false);
    });
  });

  describe("clearAllDocs", () => {
    it("should clear all documents", async () => {
      await docPersistence.saveDoc("doc-a", new Uint8Array([1]));
      await docPersistence.saveDoc("doc-b", new Uint8Array([2]));

      expect(mockStore.size).toBe(2);

      await docPersistence.clearAllDocs();

      expect(mockStore.size).toBe(0);
    });
  });

  // --- Metadata CRUD Tests ---

  describe("saveMetadata / loadMetadata", () => {
    it("should save and load metadata correctly", async () => {
      const meta = createLocalDocMetadata("test-doc-1", "Test Document");

      await docPersistence.saveMetadata(meta);
      const loaded = await docPersistence.loadMetadata("test-doc-1");

      expect(loaded).toEqual(meta);
    });

    it("should return null for non-existent metadata", async () => {
      const loaded = await docPersistence.loadMetadata("non-existent-id");

      expect(loaded).toBeNull();
    });

    it("should update existing metadata on save", async () => {
      const meta = createLocalDocMetadata("test-doc-2", "Original Title");
      await docPersistence.saveMetadata(meta);

      const updated = { ...meta, title: "Updated Title", updatedAt: Date.now() + 1000 };
      await docPersistence.saveMetadata(updated);

      const loaded = await docPersistence.loadMetadata("test-doc-2");
      expect(loaded?.title).toBe("Updated Title");
    });
  });

  describe("deleteMetadata", () => {
    it("should delete metadata correctly", async () => {
      const meta = createLocalDocMetadata("to-delete-meta", "Will be deleted");
      await docPersistence.saveMetadata(meta);

      await docPersistence.deleteMetadata("to-delete-meta");
      const loaded = await docPersistence.loadMetadata("to-delete-meta");

      expect(loaded).toBeNull();
    });
  });

  describe("getAllMetadata", () => {
    it("should return all saved metadata", async () => {
      const meta1 = createLocalDocMetadata("doc-1", "Doc 1");
      const meta2 = createLocalDocMetadata("doc-2", "Doc 2");
      const meta3 = createImportedDocMetadata("doc-3", "Doc 3", "github", "https://github.com/x");

      await docPersistence.saveMetadata(meta1);
      await docPersistence.saveMetadata(meta2);
      await docPersistence.saveMetadata(meta3);

      const all = await docPersistence.getAllMetadata();

      expect(all).toHaveLength(3);
      expect(all.map((m) => m.id).sort()).toEqual(["doc-1", "doc-2", "doc-3"]);
    });
  });

  describe("getMetadataBySource", () => {
    it("should filter metadata by source type", async () => {
      const localDoc = createLocalDocMetadata("local-1", "Local Doc");
      const ghDoc1 = createImportedDocMetadata(
        "gh-1",
        "GH Doc 1",
        "github",
        "https://github.com/a"
      );
      const ghDoc2 = createImportedDocMetadata(
        "gh-2",
        "GH Doc 2",
        "github",
        "https://github.com/b"
      );
      const rssDoc = createImportedDocMetadata(
        "rss-1",
        "RSS Doc",
        "rss",
        "https://rss.example.com"
      );

      await docPersistence.saveMetadata(localDoc);
      await docPersistence.saveMetadata(ghDoc1);
      await docPersistence.saveMetadata(ghDoc2);
      await docPersistence.saveMetadata(rssDoc);

      const githubDocs = await docPersistence.getMetadataBySource("github");
      const localDocs = await docPersistence.getMetadataBySource("local");
      const rssDocs = await docPersistence.getMetadataBySource("rss");

      expect(githubDocs).toHaveLength(2);
      expect(localDocs).toHaveLength(1);
      expect(rssDocs).toHaveLength(1);
    });
  });
});
