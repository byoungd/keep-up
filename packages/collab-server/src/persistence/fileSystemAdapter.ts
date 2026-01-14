/**
 * LFCC v0.9 RC - File-System Persistence Adapter
 *
 * Implements PersistenceHooks interface using local file-system storage.
 * Stores snapshots and operation logs at `.lfcc/storage/{docId}/`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { OperationLogEntry, OperationLogQuery, PersistenceHooks } from "@ku0/core/sync/server";
import { LoroDoc } from "loro-crdt";

const SNAPSHOT_FILE = "snapshot.bin";
const FRONTIER_FILE = "frontier.txt";
const OPLOG_DIR = "oplog";
const OPERATION_LOG_FILE = "operation_log.jsonl";
const DEFAULT_FRONTIER = "init";

/**
 * File-system based persistence adapter.
 * Stores document snapshots and operation logs on disk.
 */
export class FileSystemPersistenceAdapter implements PersistenceHooks {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /**
   * Get the storage directory for a document.
   */
  private getDocPath(docId: string): string {
    // Sanitize docId to prevent path traversal
    const sanitizedDocId = docId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.basePath, sanitizedDocId);
  }

  /**
   * Ensure the document directory exists.
   */
  private async ensureDocDir(docId: string): Promise<string> {
    const docPath = this.getDocPath(docId);
    await fs.mkdir(docPath, { recursive: true });
    await fs.mkdir(path.join(docPath, OPLOG_DIR), { recursive: true });
    return docPath;
  }

  /**
   * Get the operation log path for a document.
   */
  private getOperationLogPath(docId: string): string {
    return path.join(this.getDocPath(docId), OPERATION_LOG_FILE);
  }

  /**
   * Load a Loro document from the latest snapshot (if any).
   */
  private async loadSnapshotDoc(docPath: string): Promise<LoroDoc> {
    const doc = new LoroDoc();
    try {
      const snapshotPath = path.join(docPath, SNAPSHOT_FILE);
      const content = await fs.readFile(snapshotPath);
      doc.import(new Uint8Array(content));
    } catch {
      // No snapshot yet; start from empty doc.
    }
    return doc;
  }

  /**
   * Get updates since a frontier tag.
   * Returns a single update if possible, or null to force snapshot fallback.
   */
  async getUpdatesSince(
    docId: string,
    frontierTag: string
  ): Promise<{ data: Uint8Array; frontierTag: string } | null> {
    try {
      const docPath = this.getDocPath(docId);
      const oplogPath = path.join(docPath, OPLOG_DIR);

      // List oplog files
      const files = await fs.readdir(oplogPath);
      if (files.length === 0) {
        return null;
      }

      // Sort by timestamp (filename format: {timestamp}_{frontierTag}.bin)
      const sortedFiles = files.filter((f) => f.endsWith(".bin")).sort();

      // Find files after the given frontier
      let startIndex = 0;
      if (frontierTag !== DEFAULT_FRONTIER) {
        const matchIndex = sortedFiles.findIndex((f) => f.includes(`_${frontierTag}.bin`));
        if (matchIndex === -1) {
          // Frontier not found, need full snapshot
          return null;
        }
        startIndex = matchIndex + 1;
      }

      if (startIndex >= sortedFiles.length) {
        // Already at latest
        const currentFrontier = await this.getCurrentFrontierTag(docId);
        return { data: new Uint8Array(0), frontierTag: currentFrontier };
      }

      const updateCount = sortedFiles.length - startIndex;
      if (updateCount === 1) {
        const filePath = path.join(oplogPath, sortedFiles[startIndex]);
        const content = await fs.readFile(filePath);
        const latestFrontier = await this.getCurrentFrontierTag(docId);
        return { data: new Uint8Array(content), frontierTag: latestFrontier };
      }

      // Multiple updates require batching; fall back to snapshot for correctness.
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get full document snapshot.
   */
  async getSnapshot(docId: string): Promise<{ data: Uint8Array; frontierTag: string } | null> {
    try {
      const docPath = this.getDocPath(docId);
      const snapshotPath = path.join(docPath, SNAPSHOT_FILE);

      const content = await fs.readFile(snapshotPath);
      const frontierTag = await this.getCurrentFrontierTag(docId);

      return { data: new Uint8Array(content), frontierTag };
    } catch {
      return null;
    }
  }

  /**
   * Save an update to the oplog and update the snapshot.
   */
  async saveUpdate(docId: string, data: Uint8Array, frontierTag: string): Promise<void> {
    const docPath = await this.ensureDocDir(docId);
    const timestamp = Date.now();

    // Save to oplog
    const oplogFile = path.join(docPath, OPLOG_DIR, `${timestamp}_${frontierTag}.bin`);
    await fs.writeFile(oplogFile, data);

    // Update snapshot by applying the update to the last snapshot.
    const snapshotPath = path.join(docPath, SNAPSHOT_FILE);
    const doc = await this.loadSnapshotDoc(docPath);
    if (data.length > 0) {
      doc.import(data);
    }
    const snapshot = doc.export({ mode: "snapshot" });
    await fs.writeFile(snapshotPath, snapshot);

    // Update frontier tag
    await fs.writeFile(path.join(docPath, FRONTIER_FILE), frontierTag);
  }

  /**
   * Get current frontier tag for a document.
   */
  async getCurrentFrontierTag(docId: string): Promise<string> {
    try {
      const docPath = this.getDocPath(docId);
      const frontierPath = path.join(docPath, FRONTIER_FILE);
      const content = await fs.readFile(frontierPath, "utf-8");
      return content.trim() || DEFAULT_FRONTIER;
    } catch {
      return DEFAULT_FRONTIER;
    }
  }

  /**
   * Initialize a new document with initial data.
   */
  async initDocument(docId: string, initialData?: Uint8Array, frontierTag?: string): Promise<void> {
    const docPath = await this.ensureDocDir(docId);

    if (initialData) {
      await fs.writeFile(path.join(docPath, SNAPSHOT_FILE), initialData);
    }

    await fs.writeFile(path.join(docPath, FRONTIER_FILE), frontierTag ?? DEFAULT_FRONTIER);
  }

  /**
   * Check if a document exists.
   */
  async documentExists(docId: string): Promise<boolean> {
    try {
      const docPath = this.getDocPath(docId);
      await fs.access(docPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a document and all its data.
   */
  async deleteDocument(docId: string): Promise<void> {
    const docPath = this.getDocPath(docId);
    await fs.rm(docPath, { recursive: true, force: true });
  }

  async appendOperationLog(entry: OperationLogEntry): Promise<void> {
    const docPath = await this.ensureDocDir(entry.docId);
    const logPath = path.join(docPath, OPERATION_LOG_FILE);
    await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`);
  }

  async queryOperationLog(query: OperationLogQuery): Promise<OperationLogEntry[]> {
    try {
      const logPath = this.getOperationLogPath(query.docId);
      const content = await fs.readFile(logPath, "utf-8");
      const lines = content.split("\n");
      const entries: OperationLogEntry[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        try {
          entries.push(JSON.parse(trimmed) as OperationLogEntry);
        } catch {
          // Skip malformed lines.
        }
      }

      const filtered = entries.filter((entry) => {
        if (entry.docId !== query.docId) {
          return false;
        }
        if (query.actorId && entry.actorId !== query.actorId) {
          return false;
        }
        if (query.opType && entry.opType !== query.opType) {
          return false;
        }
        if (query.afterTs !== undefined && entry.ts <= query.afterTs) {
          return false;
        }
        if (query.beforeTs !== undefined && entry.ts >= query.beforeTs) {
          return false;
        }
        return true;
      });

      if (query.limit !== undefined && filtered.length > query.limit) {
        return filtered.slice(-query.limit);
      }

      return filtered;
    } catch {
      return [];
    }
  }

  async replayUpdates(
    docId: string,
    options: { untilFrontierTag?: string } = {}
  ): Promise<Uint8Array | null> {
    try {
      const docPath = this.getDocPath(docId);
      const oplogPath = path.join(docPath, OPLOG_DIR);
      const files = await fs.readdir(oplogPath);
      if (files.length === 0) {
        return null;
      }
      const sortedFiles = files.filter((f) => f.endsWith(".bin")).sort();
      const doc = new LoroDoc();
      for (const fileName of sortedFiles) {
        const filePath = path.join(oplogPath, fileName);
        const content = await fs.readFile(filePath);
        doc.import(new Uint8Array(content));
        if (options.untilFrontierTag && fileName.includes(`_${options.untilFrontierTag}.bin`)) {
          break;
        }
      }
      return doc.export({ mode: "snapshot" });
    } catch {
      return null;
    }
  }
}
