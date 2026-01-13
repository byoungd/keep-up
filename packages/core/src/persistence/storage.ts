import type { DocSnapshot, OpLogEntry, StorageBackend } from "./types.js";

type DocData = {
  snapshots: DocSnapshot[];
  updates: OpLogEntry[];
  frontierTag: string;
};

export class InMemoryStorage implements StorageBackend {
  private docs = new Map<string, DocData>();

  private getOrCreate(docId: string): DocData {
    if (!this.docs.has(docId)) {
      this.docs.set(docId, { snapshots: [], updates: [], frontierTag: "" });
    }
    // biome-ignore lint/style/noNonNullAssertion: storage logic
    return this.docs.get(docId)!;
  }

  async getLatestSnapshot(docId: string): Promise<DocSnapshot | null> {
    const doc = this.docs.get(docId);
    if (!doc || doc.snapshots.length === 0) {
      return null;
    }
    return doc.snapshots[doc.snapshots.length - 1];
  }

  async saveSnapshot(snapshot: DocSnapshot): Promise<void> {
    const doc = this.getOrCreate(snapshot.docId);
    doc.snapshots.push(snapshot);
    if (snapshot.frontierTag) {
      doc.frontierTag = snapshot.frontierTag;
    }
  }

  async listSnapshots(docId: string): Promise<DocSnapshot[]> {
    return this.docs.get(docId)?.snapshots ?? [];
  }

  async deleteSnapshot(docId: string, seq: number): Promise<void> {
    const doc = this.docs.get(docId);
    if (doc) {
      doc.snapshots = doc.snapshots.filter((s) => s.seq !== seq);
    }
  }

  async getUpdates(docId: string, afterSeq?: number): Promise<OpLogEntry[]> {
    const doc = this.docs.get(docId);
    if (!doc) {
      return [];
    }
    if (afterSeq === undefined) {
      return [...doc.updates];
    }
    return doc.updates.filter((u) => u.seq > afterSeq);
  }

  async getUpdatesSince(docId: string, frontierTag: string): Promise<OpLogEntry[]> {
    const doc = this.docs.get(docId);
    if (!doc) {
      return [];
    }
    const idx = doc.updates.findIndex((u) => u.parentFrontierTag === frontierTag);
    if (idx === -1) {
      return [...doc.updates];
    }
    return doc.updates.slice(idx);
  }

  async appendUpdate(entry: OpLogEntry): Promise<void> {
    const doc = this.getOrCreate(entry.docId);
    doc.updates.push(entry);
    doc.frontierTag = entry.frontierTag;
  }

  async deleteUpdates(docId: string, beforeSeq: number): Promise<void> {
    const doc = this.docs.get(docId);
    if (doc) {
      doc.updates = doc.updates.filter((u) => u.seq >= beforeSeq);
    }
  }

  async getLatestSeq(docId: string): Promise<number> {
    const doc = this.docs.get(docId);
    if (!doc || doc.updates.length === 0) {
      return 0;
    }
    return doc.updates[doc.updates.length - 1].seq;
  }

  async getCurrentFrontierTag(docId: string): Promise<string> {
    return this.docs.get(docId)?.frontierTag ?? "";
  }

  async docExists(docId: string): Promise<boolean> {
    return this.docs.has(docId);
  }

  async listDocs(): Promise<string[]> {
    return Array.from(this.docs.keys());
  }

  async deleteDoc(docId: string): Promise<void> {
    this.docs.delete(docId);
  }
}

/**
 * File System Storage Backend
 *
 * Production-ready file-based storage with:
 * - Atomic writes (write-rename pattern)
 * - Automatic directory creation
 * - Metadata indexing for fast lookups
 * - Corruption detection via checksums
 *
 * Directory structure:
 *   baseDir/
 *   ├── docs/
 *   │   └── {docId}/
 *   │       ├── meta.json          # Document metadata & frontier
 *   │       ├── snapshots/
 *   │       │   └── {seq}.snapshot # Binary snapshot files
 *   │       └── updates/
 *   │           └── {seq}.update   # Binary update files
 *   └── index.json                 # Global document index
 */
export class FileStorage implements StorageBackend {
  private readonly baseDir: string;
  private readonly fs: IFileSystem;
  private indexCache: Map<string, DocMetadata> = new Map();
  private initialized = false;

  constructor(baseDir: string, fs?: IFileSystem) {
    this.baseDir = baseDir;
    this.fs = fs ?? createNodeFileSystem();
  }

  /**
   * Initialize storage directories.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.fs.mkdir(this.baseDir, { recursive: true });
    await this.fs.mkdir(this.getDocsDir(), { recursive: true });

    // Load global index
    await this.loadIndex();
    this.initialized = true;
  }

  async getLatestSnapshot(docId: string): Promise<DocSnapshot | null> {
    await this.ensureInitialized();

    const meta = await this.getDocMeta(docId);
    if (!meta || meta.latestSnapshotSeq === 0) {
      return null;
    }

    const snapshotPath = this.getSnapshotPath(docId, meta.latestSnapshotSeq);
    try {
      const data = await this.fs.readFile(snapshotPath);
      const metaPath = `${snapshotPath}.meta`;
      const metaJson = await this.fs.readFile(metaPath, "utf-8");
      const snapshotMeta = JSON.parse(metaJson as string) as SnapshotMeta;

      return {
        docId,
        data: data as Uint8Array,
        frontierTag: snapshotMeta.frontierTag,
        seq: snapshotMeta.seq,
        createdAt: snapshotMeta.createdAt,
        sizeBytes: (data as Uint8Array).length,
      };
    } catch {
      return null;
    }
  }

  async saveSnapshot(snapshot: DocSnapshot): Promise<void> {
    await this.ensureInitialized();
    await this.ensureDocDir(snapshot.docId);

    const snapshotPath = this.getSnapshotPath(snapshot.docId, snapshot.seq);
    const metaPath = `${snapshotPath}.meta`;

    const snapshotMeta: SnapshotMeta = {
      seq: snapshot.seq,
      frontierTag: snapshot.frontierTag,
      createdAt: snapshot.createdAt,
      sizeBytes: snapshot.sizeBytes,
      checksum: this.calculateChecksum(snapshot.data),
    };

    // Atomic write: write to temp, then rename
    await this.atomicWrite(snapshotPath, snapshot.data);
    await this.atomicWrite(metaPath, JSON.stringify(snapshotMeta, null, 2));

    // Update document metadata
    await this.updateDocMeta(snapshot.docId, {
      latestSnapshotSeq: snapshot.seq,
      frontierTag: snapshot.frontierTag,
      updatedAt: new Date().toISOString(),
    });
  }

  async listSnapshots(docId: string): Promise<DocSnapshot[]> {
    await this.ensureInitialized();

    const snapshotsDir = this.getSnapshotsDir(docId);
    try {
      const files = await this.fs.readdir(snapshotsDir);
      const snapshots: DocSnapshot[] = [];

      for (const file of files) {
        if (!file.endsWith(".snapshot")) {
          continue;
        }

        const seq = Number.parseInt(file.replace(".snapshot", ""), 10);
        if (Number.isNaN(seq)) {
          continue;
        }

        const snapshot = await this.loadSnapshot(docId, seq);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }

      return snapshots.sort((a, b) => a.seq - b.seq);
    } catch {
      return [];
    }
  }

  async deleteSnapshot(docId: string, seq: number): Promise<void> {
    await this.ensureInitialized();

    const snapshotPath = this.getSnapshotPath(docId, seq);
    const metaPath = `${snapshotPath}.meta`;

    await this.ignoreMissing(() => this.fs.unlink(snapshotPath));
    await this.ignoreMissing(() => this.fs.unlink(metaPath));
  }

  async getUpdates(docId: string, afterSeq?: number): Promise<OpLogEntry[]> {
    await this.ensureInitialized();

    const updatesDir = this.getUpdatesDir(docId);
    try {
      const files = await this.fs.readdir(updatesDir);
      const updates: OpLogEntry[] = [];

      for (const file of files) {
        if (!file.endsWith(".update")) {
          continue;
        }

        const seq = Number.parseInt(file.replace(".update", ""), 10);
        if (Number.isNaN(seq)) {
          continue;
        }
        if (afterSeq !== undefined && seq <= afterSeq) {
          continue;
        }

        const update = await this.loadUpdate(docId, seq);
        if (update) {
          updates.push(update);
        }
      }

      return updates.sort((a, b) => a.seq - b.seq);
    } catch {
      return [];
    }
  }

  async getUpdatesSince(docId: string, frontierTag: string): Promise<OpLogEntry[]> {
    await this.ensureInitialized();

    const allUpdates = await this.getUpdates(docId);

    // Find the update that has this frontierTag as its parent
    const idx = allUpdates.findIndex((u) => u.parentFrontierTag === frontierTag);
    if (idx === -1) {
      // Frontier not found, return all updates
      return allUpdates;
    }
    return allUpdates.slice(idx);
  }

  async appendUpdate(entry: OpLogEntry): Promise<void> {
    await this.ensureInitialized();
    await this.ensureDocDir(entry.docId);

    const updatePath = this.getUpdatePath(entry.docId, entry.seq);
    const metaPath = `${updatePath}.meta`;

    const updateMeta: UpdateMeta = {
      seq: entry.seq,
      frontierTag: entry.frontierTag,
      parentFrontierTag: entry.parentFrontierTag,
      clientId: entry.clientId,
      timestamp: entry.timestamp,
      sizeBytes: entry.sizeBytes,
      checksum: this.calculateChecksum(entry.data),
    };

    // Atomic write
    await this.atomicWrite(updatePath, entry.data);
    await this.atomicWrite(metaPath, JSON.stringify(updateMeta, null, 2));

    // Update document metadata
    await this.updateDocMeta(entry.docId, {
      latestSeq: entry.seq,
      frontierTag: entry.frontierTag,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteUpdates(docId: string, beforeSeq: number): Promise<void> {
    await this.ensureInitialized();

    const updatesDir = this.getUpdatesDir(docId);
    try {
      const files = await this.fs.readdir(updatesDir);

      for (const file of files) {
        if (!file.endsWith(".update") && !file.endsWith(".meta")) {
          continue;
        }

        const baseName = file.replace(".meta", "").replace(".update", "");
        const seq = Number.parseInt(baseName, 10);
        if (Number.isNaN(seq)) {
          continue;
        }
        if (seq >= beforeSeq) {
          continue;
        }

        await this.ignoreMissing(() => this.fs.unlink(`${updatesDir}/${file}`));
      }
    } catch {
      // Directory might not exist
    }
  }

  async getLatestSeq(docId: string): Promise<number> {
    await this.ensureInitialized();

    const meta = await this.getDocMeta(docId);
    return meta?.latestSeq ?? 0;
  }

  async getCurrentFrontierTag(docId: string): Promise<string> {
    await this.ensureInitialized();

    const meta = await this.getDocMeta(docId);
    return meta?.frontierTag ?? "";
  }

  async docExists(docId: string): Promise<boolean> {
    await this.ensureInitialized();

    const meta = await this.getDocMeta(docId);
    return meta !== null;
  }

  async listDocs(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const docsDir = this.getDocsDir();
      const entries = await this.fs.readdir(docsDir);
      return entries.filter((e) => !e.startsWith("."));
    } catch {
      return [];
    }
  }

  async deleteDoc(docId: string): Promise<void> {
    await this.ensureInitialized();

    const docDir = this.getDocDir(docId);
    await this.ignoreMissing(() => this.fs.rmdir(docDir, { recursive: true }));

    // Remove from index
    this.indexCache.delete(docId);
    await this.saveIndex();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getDocsDir(): string {
    return `${this.baseDir}/docs`;
  }

  private getDocDir(docId: string): string {
    return `${this.getDocsDir()}/${this.sanitizeId(docId)}`;
  }

  private getSnapshotsDir(docId: string): string {
    return `${this.getDocDir(docId)}/snapshots`;
  }

  private getUpdatesDir(docId: string): string {
    return `${this.getDocDir(docId)}/updates`;
  }

  private getSnapshotPath(docId: string, seq: number): string {
    return `${this.getSnapshotsDir(docId)}/${seq.toString().padStart(10, "0")}.snapshot`;
  }

  private getUpdatePath(docId: string, seq: number): string {
    return `${this.getUpdatesDir(docId)}/${seq.toString().padStart(10, "0")}.update`;
  }

  private getDocMetaPath(docId: string): string {
    return `${this.getDocDir(docId)}/meta.json`;
  }

  private sanitizeId(id: string): string {
    // Replace unsafe characters for filesystem
    return id.replace(/[<>:"/\\|?*]/g, "_");
  }

  private isNotFoundError(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
    );
  }

  private async ignoreMissing(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (!this.isNotFoundError(error)) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  private async ensureDocDir(docId: string): Promise<void> {
    await this.fs.mkdir(this.getDocDir(docId), { recursive: true });
    await this.fs.mkdir(this.getSnapshotsDir(docId), { recursive: true });
    await this.fs.mkdir(this.getUpdatesDir(docId), { recursive: true });
  }

  private async getDocMeta(docId: string): Promise<DocMetadata | null> {
    // Check cache first
    if (this.indexCache.has(docId)) {
      return this.indexCache.get(docId) ?? null;
    }

    const metaPath = this.getDocMetaPath(docId);
    try {
      const content = await this.fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(content as string) as DocMetadata;
      this.indexCache.set(docId, meta);
      return meta;
    } catch {
      return null;
    }
  }

  private async updateDocMeta(docId: string, updates: Partial<DocMetadata>): Promise<void> {
    const existing = (await this.getDocMeta(docId)) ?? {
      docId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestSeq: 0,
      latestSnapshotSeq: 0,
      frontierTag: "",
    };

    const updated: DocMetadata = { ...existing, ...updates };
    this.indexCache.set(docId, updated);

    const metaPath = this.getDocMetaPath(docId);
    await this.atomicWrite(metaPath, JSON.stringify(updated, null, 2));
  }

  private async loadSnapshot(docId: string, seq: number): Promise<DocSnapshot | null> {
    const snapshotPath = this.getSnapshotPath(docId, seq);
    const metaPath = `${snapshotPath}.meta`;

    try {
      const [data, metaJson] = await Promise.all([
        this.fs.readFile(snapshotPath),
        this.fs.readFile(metaPath, "utf-8"),
      ]);

      const meta = JSON.parse(metaJson as string) as SnapshotMeta;

      // Verify checksum
      const checksum = this.calculateChecksum(data as Uint8Array);
      if (checksum !== meta.checksum) {
        console.warn(`Snapshot ${docId}/${seq} checksum mismatch, skipping`);
        return null;
      }

      return {
        docId,
        data: data as Uint8Array,
        frontierTag: meta.frontierTag,
        seq: meta.seq,
        createdAt: meta.createdAt,
        sizeBytes: (data as Uint8Array).length,
      };
    } catch {
      return null;
    }
  }

  private async loadUpdate(docId: string, seq: number): Promise<OpLogEntry | null> {
    const updatePath = this.getUpdatePath(docId, seq);
    const metaPath = `${updatePath}.meta`;

    try {
      const [data, metaJson] = await Promise.all([
        this.fs.readFile(updatePath),
        this.fs.readFile(metaPath, "utf-8"),
      ]);

      const meta = JSON.parse(metaJson as string) as UpdateMeta;

      // Verify checksum
      const checksum = this.calculateChecksum(data as Uint8Array);
      if (checksum !== meta.checksum) {
        console.warn(`Update ${docId}/${seq} checksum mismatch, skipping`);
        return null;
      }

      return {
        docId,
        seq: meta.seq,
        data: data as Uint8Array,
        frontierTag: meta.frontierTag,
        parentFrontierTag: meta.parentFrontierTag,
        clientId: meta.clientId,
        timestamp: meta.timestamp,
        sizeBytes: (data as Uint8Array).length,
      };
    } catch {
      return null;
    }
  }

  private async atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
    const tempPath = `${path}.tmp.${Date.now()}`;
    await this.fs.writeFile(tempPath, data);
    await this.fs.rename(tempPath, path);
  }

  private calculateChecksum(data: Uint8Array): string {
    // Simple FNV-1a hash for integrity checking
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  private async loadIndex(): Promise<void> {
    const indexPath = `${this.baseDir}/index.json`;
    try {
      const content = await this.fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(content as string) as { docs: DocMetadata[] };
      for (const meta of index.docs) {
        this.indexCache.set(meta.docId, meta);
      }
    } catch {
      // Index doesn't exist yet
    }
  }

  private async saveIndex(): Promise<void> {
    const indexPath = `${this.baseDir}/index.json`;
    const index = {
      version: 1,
      updatedAt: new Date().toISOString(),
      docs: Array.from(this.indexCache.values()),
    };
    await this.atomicWrite(indexPath, JSON.stringify(index, null, 2));
  }
}

// ===========================================================================
// Types
// ===========================================================================

interface DocMetadata {
  docId: string;
  createdAt: string;
  updatedAt: string;
  latestSeq: number;
  latestSnapshotSeq: number;
  frontierTag: string;
}

interface SnapshotMeta {
  seq: number;
  frontierTag: string;
  createdAt: string;
  sizeBytes: number;
  checksum: string;
}

interface UpdateMeta {
  seq: number;
  frontierTag: string;
  parentFrontierTag: string;
  clientId: string;
  timestamp: string;
  sizeBytes: number;
  checksum: string;
}

// ===========================================================================
// File System Abstraction (for testability & cross-platform)
// ===========================================================================

export interface IFileSystem {
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding?: string): Promise<Uint8Array | string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  unlink(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean; size: number }>;
}

/**
 * Create a Node.js file system adapter.
 * Only available in Node.js environment.
 */
export function createNodeFileSystem(): IFileSystem {
  // Lazy import to avoid issues in browser
  const fs = require("node:fs/promises");
  const _path = require("node:path");

  return {
    mkdir: (p, opts) => fs.mkdir(p, opts),
    readdir: (p) => fs.readdir(p),
    readFile: (p, encoding) => (encoding ? fs.readFile(p, encoding) : fs.readFile(p)),
    writeFile: (p, data) => fs.writeFile(p, data),
    unlink: (p) => fs.unlink(p),
    rename: (o, n) => fs.rename(o, n),
    rmdir: (p, opts) => fs.rm(p, { recursive: opts?.recursive, force: true }),
    stat: (p) => fs.stat(p),
  };
}

/**
 * Create a memory-based file system for testing.
 */
export function createMemoryFileSystem(): IFileSystem {
  const files = new Map<string, Uint8Array | string>();
  const dirs = new Set<string>([""]);

  const normalizePath = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const getParentDir = (p: string) => {
    const parts = p.split("/");
    parts.pop();
    return parts.join("/") || "/";
  };

  const deleteRecursiveFiles = (prefix: string) => {
    const normalizedPrefix = `${prefix}/`;
    for (const key of Array.from(files.keys())) {
      if (key === prefix || key.startsWith(normalizedPrefix)) {
        files.delete(key);
      }
    }
  };

  const deleteRecursiveDirs = (prefix: string) => {
    const normalizedPrefix = `${prefix}/`;
    for (const dir of Array.from(dirs)) {
      if (dir === prefix || dir.startsWith(normalizedPrefix)) {
        dirs.delete(dir);
      }
    }
  };

  return {
    async mkdir(p, opts) {
      const normalizedPath = normalizePath(p);
      if (opts?.recursive) {
        const parts = normalizedPath.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          dirs.add(current);
        }
      } else {
        const parent = getParentDir(normalizedPath);
        if (!dirs.has(parent) && parent !== "") {
          throw new Error(`ENOENT: no such directory '${parent}'`);
        }
        dirs.add(normalizedPath);
      }
    },

    async readdir(p) {
      const normalizedPath = normalizePath(p);
      if (!dirs.has(normalizedPath)) {
        throw new Error(`ENOENT: no such directory '${normalizedPath}'`);
      }
      const prefix = normalizedPath === "" ? "" : `${normalizedPath}/`;
      const entries = new Set<string>();

      for (const filePath of files.keys()) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const firstPart = rest.split("/")[0];
          entries.add(firstPart);
        }
      }

      for (const dirPath of dirs) {
        if (dirPath.startsWith(prefix) && dirPath !== p) {
          const rest = dirPath.slice(prefix.length);
          const firstPart = rest.split("/")[0];
          entries.add(firstPart);
        }
      }

      return Array.from(entries);
    },

    async readFile(p, encoding) {
      const normalizedPath = normalizePath(p);
      const content = files.get(normalizedPath);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file '${normalizedPath}'`);
      }
      if (encoding === "utf-8" || encoding === "utf8") {
        return typeof content === "string" ? content : new TextDecoder().decode(content);
      }
      return typeof content === "string" ? new TextEncoder().encode(content) : content;
    },

    async writeFile(p, data) {
      const normalizedPath = normalizePath(p);
      files.set(normalizedPath, data);
    },

    async unlink(p) {
      const normalizedPath = normalizePath(p);
      if (!files.has(normalizedPath)) {
        throw new Error(`ENOENT: no such file '${normalizedPath}'`);
      }
      files.delete(normalizedPath);
    },

    async rename(o, n) {
      const oldPath = normalizePath(o);
      const newPath = normalizePath(n);
      const content = files.get(oldPath);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file '${oldPath}'`);
      }
      files.delete(oldPath);
      files.set(newPath, content);
    },

    async rmdir(p, opts) {
      const normalizedPath = normalizePath(p);
      if (opts?.recursive) {
        deleteRecursiveFiles(normalizedPath);
        deleteRecursiveDirs(normalizedPath);
      }
      dirs.delete(normalizedPath);
    },

    async stat(p) {
      const normalizedPath = normalizePath(p);
      if (dirs.has(normalizedPath)) {
        return { isDirectory: () => true, size: 0 };
      }
      const content = files.get(normalizedPath);
      if (content !== undefined) {
        const size =
          typeof content === "string" ? new TextEncoder().encode(content).length : content.length;
        return { isDirectory: () => false, size };
      }
      throw new Error(`ENOENT: no such file or directory '${normalizedPath}'`);
    },
  };
}
