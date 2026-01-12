/**
 * PendingFileStore
 *
 * Stores pending import files in IndexedDB to survive page reloads.
 * Replaces the in-memory pendingFiles Map for reliability.
 *
 * Falls back to in-memory storage in non-browser environments (Node.js tests).
 */

const DB_NAME = "pending-files";
const STORE_NAME = "files";
const DB_VERSION = 1;

interface PendingFileRecord {
  sourceRef: string;
  buffer: ArrayBuffer;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  registeredAt: number;
}

/** How long to keep pending files before auto-cleanup (10 minutes) */
const PENDING_FILE_TTL_MS = 10 * 60 * 1000;

/**
 * Check if IndexedDB is available (browser environment).
 */
function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

// ============================================
// In-memory fallback for non-browser environments
// ============================================

const memoryStore = new Map<string, PendingFileRecord>();

// ============================================
// IndexedDB implementation
// ============================================

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open or create the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "sourceRef" });
        store.createIndex("registeredAt", "registeredAt", { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Generate a unique sourceRef for a file.
 */
function generateSourceRef(file: File): string {
  return `file:${file.name}:${file.size}:${file.lastModified}`;
}

/**
 * Store a file in IndexedDB for later ingestion.
 * Returns the sourceRef to use when enqueueing the import job.
 * Falls back to in-memory storage in non-browser environments.
 */
export async function storePendingFile(file: File): Promise<string> {
  const sourceRef = generateSourceRef(file);
  const buffer = await file.arrayBuffer();

  const record: PendingFileRecord = {
    sourceRef,
    buffer,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    registeredAt: Date.now(),
  };

  // Use in-memory fallback for non-browser environments
  if (!isIndexedDBAvailable()) {
    memoryStore.set(sourceRef, record);
    return sourceRef;
  }

  const db = await openDatabase();

  return new Promise<string>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve(sourceRef);
    };

    request.onerror = () => {
      reject(new Error(`Failed to store pending file: ${request.error?.message}`));
    };
  });
}

/**
 * Retrieve a pending file from IndexedDB.
 * Falls back to in-memory storage in non-browser environments.
 */
export async function getPendingFile(
  sourceRef: string
): Promise<{ buffer: ArrayBuffer; name: string; type: string; lastModified: number } | null> {
  // Use in-memory fallback for non-browser environments
  if (!isIndexedDBAvailable()) {
    const record = memoryStore.get(sourceRef);
    if (!record) {
      return null;
    }
    return {
      buffer: record.buffer,
      name: record.name,
      type: record.type,
      lastModified: record.lastModified,
    };
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(sourceRef);

    request.onsuccess = () => {
      const record = request.result as PendingFileRecord | undefined;
      if (!record) {
        resolve(null);
        return;
      }
      resolve({
        buffer: record.buffer,
        name: record.name,
        type: record.type,
        lastModified: record.lastModified,
      });
    };

    request.onerror = () => {
      reject(new Error(`Failed to get pending file: ${request.error?.message}`));
    };
  });
}

/**
 * Delete a pending file from IndexedDB after successful ingestion.
 * Falls back to in-memory storage in non-browser environments.
 */
export async function deletePendingFile(sourceRef: string): Promise<void> {
  // Use in-memory fallback for non-browser environments
  if (!isIndexedDBAvailable()) {
    memoryStore.delete(sourceRef);
    return;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(sourceRef);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete pending file: ${request.error?.message}`));
    };
  });
}

/**
 * Clean up stale pending files that haven't been processed.
 * Returns the number of files cleaned up.
 * Falls back to in-memory storage in non-browser environments.
 */
export async function cleanupStalePendingFiles(
  ttlMs: number = PENDING_FILE_TTL_MS
): Promise<number> {
  const cutoff = Date.now() - ttlMs;

  // Use in-memory fallback for non-browser environments
  if (!isIndexedDBAvailable()) {
    let cleaned = 0;
    for (const [sourceRef, record] of memoryStore) {
      if (record.registeredAt < cutoff) {
        memoryStore.delete(sourceRef);
        cleaned++;
      }
    }
    return cleaned;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("registeredAt");
    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);

    let cleaned = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cleaned++;
        cursor.continue();
      } else {
        resolve(cleaned);
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to cleanup stale files: ${request.error?.message}`));
    };
  });
}

/**
 * Get the count of pending files (useful for debugging).
 * Falls back to in-memory storage in non-browser environments.
 */
export async function getPendingFileCount(): Promise<number> {
  // Use in-memory fallback for non-browser environments
  if (!isIndexedDBAvailable()) {
    return memoryStore.size;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error(`Failed to count pending files: ${request.error?.message}`));
    };
  });
}
