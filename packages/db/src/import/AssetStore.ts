/**
 * AssetStore - Content-addressed storage for raw import assets
 *
 * Uses OPFS (Origin Private File System) as primary storage with IndexedDB fallback.
 * Assets are stored by their content hash (SHA-256) for deduplication.
 */

import type { StorageProvider } from "./types";

// ============ Types ============

export interface AssetStoreConfig {
  /** Base path in OPFS for assets (default: "/assets") */
  opfsBasePath?: string;
  /** IDB database name (default: "reader-assets") */
  idbName?: string;
}

export interface WriteAssetResult {
  storagePath: string;
  storageProvider: StorageProvider;
}

// ============ Hash Utilities ============

/**
 * Compute SHA-256 hash of bytes
 */
export async function computeHash(data: ArrayBuffer): Promise<string> {
  const subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined;
  if (subtle) {
    const hashBuffer = await subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(new Uint8Array(data));
}

function fallbackHash(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    parts.push(simpleHash(bytes, i).padStart(8, "0"));
  }
  return parts.join("");
}

function simpleHash(bytes: Uint8Array, seed: number): string {
  let hash = 2166136261 ^ seed;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Get storage path from hash (content-addressed)
 * Format: /<prefix>/<hash>.bin where prefix is first 2 chars of hash
 */
function getStoragePath(basePath: string, hash: string): string {
  const prefix = hash.substring(0, 2);
  return `${basePath}/${prefix}/${hash}.bin`;
}

// ============ OPFS Implementation ============

let opfsRoot: FileSystemDirectoryHandle | null = null;
let opfsAvailable: boolean | null = null;

async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (opfsRoot !== null) {
    return opfsRoot;
  }
  if (opfsAvailable === false) {
    return null;
  }
  try {
    opfsRoot = await navigator.storage.getDirectory();
    opfsAvailable = true;
    return opfsRoot;
  } catch {
    opfsAvailable = false;
    return null;
  }
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

async function writeOpfs(path: string, data: ArrayBuffer): Promise<void> {
  const root = await getOpfsRoot();
  if (!root) {
    throw new Error("OPFS not available");
  }

  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error("Invalid path");
  }

  const dirPath = parts.join("/");
  const dir = await ensureDirectory(root, dirPath);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });

  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readOpfs(path: string): Promise<ArrayBuffer | null> {
  const root = await getOpfsRoot();
  if (!root) {
    return null;
  }

  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      return null;
    }

    let current: FileSystemDirectoryHandle = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    const fileHandle = await current.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

async function existsOpfs(path: string): Promise<boolean> {
  const root = await getOpfsRoot();
  if (!root) {
    return false;
  }

  try {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) {
      return false;
    }

    let current: FileSystemDirectoryHandle = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }

    await current.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
}

// ============ IndexedDB Fallback ============

const IDB_STORE_NAME = "assets";

function openIdb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
  });
}

async function writeIdb(dbName: string, key: string, data: ArrayBuffer): Promise<void> {
  const db = await openIdb(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.put(data, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function readIdb(dbName: string, key: string): Promise<ArrayBuffer | null> {
  const db = await openIdb(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

async function existsIdb(dbName: string, key: string): Promise<boolean> {
  const db = await openIdb(dbName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const store = tx.objectStore(IDB_STORE_NAME);
    const request = store.count(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result > 0);
  });
}

// ============ AssetStore Class ============

export class AssetStore {
  private basePath: string;
  private idbName: string;

  constructor(config: AssetStoreConfig = {}) {
    this.basePath = config.opfsBasePath ?? "/assets";
    this.idbName = config.idbName ?? "reader-assets";
  }

  /**
   * Check if OPFS is available
   */
  async isOpfsAvailable(): Promise<boolean> {
    const root = await getOpfsRoot();
    return root !== null;
  }

  /**
   * Write data and return storage info.
   * Uses OPFS if available, otherwise falls back to IDB.
   */
  async write(data: ArrayBuffer, hash: string): Promise<WriteAssetResult> {
    const path = getStoragePath(this.basePath, hash);

    // Try OPFS first
    if (await this.isOpfsAvailable()) {
      // Check if already exists (deduplication)
      if (await existsOpfs(path)) {
        return { storagePath: path, storageProvider: "opfs" };
      }
      await writeOpfs(path, data);
      return { storagePath: path, storageProvider: "opfs" };
    }

    // Fallback to IDB
    const idbKey = `asset:${hash}`;
    if (!(await existsIdb(this.idbName, idbKey))) {
      await writeIdb(this.idbName, idbKey, data);
    }
    return { storagePath: idbKey, storageProvider: "idb" };
  }

  /**
   * Read asset data by storage path and provider
   */
  async read(storagePath: string, provider: StorageProvider): Promise<ArrayBuffer | null> {
    if (provider === "opfs") {
      return readOpfs(storagePath);
    }
    return readIdb(this.idbName, storagePath);
  }

  /**
   * Check if asset exists
   */
  async exists(storagePath: string, provider: StorageProvider): Promise<boolean> {
    if (provider === "opfs") {
      return existsOpfs(storagePath);
    }
    return existsIdb(this.idbName, storagePath);
  }

  /**
   * Convenience method: write data and compute hash
   */
  async writeWithHash(data: ArrayBuffer): Promise<WriteAssetResult & { hash: string }> {
    const hash = await computeHash(data);
    const result = await this.write(data, hash);
    return { ...result, hash };
  }
}

// ============ Singleton Instance ============

let defaultStore: AssetStore | null = null;

export function getAssetStore(): AssetStore {
  if (!defaultStore) {
    defaultStore = new AssetStore();
  }
  return defaultStore;
}
