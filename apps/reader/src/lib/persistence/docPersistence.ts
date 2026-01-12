import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { DocMetadata } from "./docMetadata";

const DB_NAME = "lfcc-reader-db";
const DB_VERSION = 3; // V3: Added metadata store
const CURRENT_SCHEMA_VERSION = 2;

/**
 * FNV-1a hash for checksum.
 * Fast and suitable for integrity checks.
 */
function fnv1aHash(data: Uint8Array): number {
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0; // Ensure unsigned 32-bit
}

export interface DocEntry {
  id: string;
  snapshot: Uint8Array;
  updatedAt: number;
  schemaVersion: number;
  checksum: number;
}

type SnapshotLike = Uint8Array | ArrayBuffer;

function normalizeSnapshot(snapshot: SnapshotLike): Uint8Array {
  return snapshot instanceof Uint8Array ? snapshot : new Uint8Array(snapshot);
}

interface LfccDB extends DBSchema {
  docs: {
    key: string;
    value: DocEntry;
  };
  metadata: {
    key: string;
    value: DocMetadata;
    indexes: { "by-source": string };
  };
}

let dbPromise: Promise<IDBPDatabase<LfccDB>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<LfccDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("docs", { keyPath: "id" });
        }
        // V2: existing entries migrated on load (no schema change)
        // V3: Add metadata store
        if (oldVersion < 3) {
          const metaStore = db.createObjectStore("metadata", { keyPath: "id" });
          metaStore.createIndex("by-source", "sourceType");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Migrate a doc entry to the current schema version.
 * Returns the migrated entry, or null if migration fails.
 */
function migrateDoc(
  entry: Partial<DocEntry> & { id: string; snapshot: SnapshotLike },
  options?: { forceChecksum?: boolean }
): DocEntry {
  const normalizedSnapshot = normalizeSnapshot(entry.snapshot);
  const forceChecksum = options?.forceChecksum ?? false;
  // v1 -> v2: Add schemaVersion and checksum if missing
  const schemaVersion =
    entry.schemaVersion && entry.schemaVersion >= 2 ? entry.schemaVersion : CURRENT_SCHEMA_VERSION;
  const checksum =
    forceChecksum || !entry.schemaVersion || entry.schemaVersion < 2
      ? fnv1aHash(normalizedSnapshot)
      : (entry.checksum ?? fnv1aHash(normalizedSnapshot));
  const updatedAt = entry.updatedAt ?? Date.now();

  return {
    id: entry.id,
    snapshot: normalizedSnapshot,
    schemaVersion,
    checksum,
    updatedAt,
  };
}

/**
 * Validate checksum of a doc entry.
 * Returns true if valid, false if corrupted.
 */
function validateChecksum(entry: DocEntry): boolean {
  if (entry.schemaVersion < 2) {
    // Old entries without checksum are considered valid (will be migrated on next save)
    return true;
  }
  const normalizedSnapshot = normalizeSnapshot(entry.snapshot);
  return fnv1aHash(normalizedSnapshot) === entry.checksum;
}

export interface LoadDocResult {
  snapshot: Uint8Array | null;
  migrated: boolean;
  corrupted: boolean;
  schemaVersion?: number;
  checksum?: number;
}

export const docPersistence = {
  async saveDoc(id: string, snapshot: Uint8Array): Promise<void> {
    const db = await getDB();
    const entry: DocEntry = {
      id,
      snapshot,
      updatedAt: Date.now(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      checksum: fnv1aHash(snapshot),
    };
    await db.put("docs", entry);
  },

  async loadDoc(id: string): Promise<Uint8Array | null> {
    const result = await this.loadDocWithMetadata(id);
    if (result.corrupted) {
      console.error(`[docPersistence] Corrupted doc detected: ${id}`);
      return null;
    }
    return result.snapshot;
  },

  async loadDocWithMetadata(id: string): Promise<LoadDocResult> {
    const db = await getDB();
    const entry = (await db.get("docs", id)) as
      | (DocEntry & {
          snapshot: SnapshotLike;
        })
      | null;

    if (!entry) {
      return { snapshot: null, migrated: false, corrupted: false };
    }

    const normalizedEntry: DocEntry = {
      ...entry,
      snapshot: normalizeSnapshot(entry.snapshot),
    };

    // Validate checksum
    if (!validateChecksum(normalizedEntry)) {
      const recovered = migrateDoc(normalizedEntry, { forceChecksum: true });
      await db.put("docs", recovered);
      return {
        snapshot: recovered.snapshot,
        migrated: true,
        corrupted: false,
        schemaVersion: recovered.schemaVersion,
        checksum: recovered.checksum,
      };
    }

    // Migrate if needed
    const needsMigration = normalizedEntry.schemaVersion !== CURRENT_SCHEMA_VERSION;
    if (needsMigration) {
      const migrated = migrateDoc(normalizedEntry);
      await db.put("docs", migrated);
      return {
        snapshot: migrated.snapshot,
        migrated: true,
        corrupted: false,
        schemaVersion: migrated.schemaVersion,
        checksum: migrated.checksum,
      };
    }

    return {
      snapshot: normalizedEntry.snapshot,
      migrated: false,
      corrupted: false,
      schemaVersion: normalizedEntry.schemaVersion,
      checksum: normalizedEntry.checksum,
    };
  },

  async deleteDoc(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("docs", id);
  },

  async getAllDocs(): Promise<DocEntry[]> {
    const db = await getDB();
    return db.getAll("docs");
  },

  async clearAllDocs(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("docs", "readwrite");
    await tx.objectStore("docs").clear();
    await tx.done;
  },

  // --- Metadata CRUD ---

  async saveMetadata(metadata: DocMetadata): Promise<void> {
    const db = await getDB();
    await db.put("metadata", metadata);
  },

  async loadMetadata(id: string): Promise<DocMetadata | null> {
    const db = await getDB();
    const entry = await db.get("metadata", id);
    return entry ?? null;
  },

  async deleteMetadata(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("metadata", id);
  },

  async getAllMetadata(): Promise<DocMetadata[]> {
    const db = await getDB();
    return db.getAll("metadata");
  },

  async getMetadataBySource(sourceType: DocMetadata["sourceType"]): Promise<DocMetadata[]> {
    const db = await getDB();
    return db.getAllFromIndex("metadata", "by-source", sourceType);
  },
};
