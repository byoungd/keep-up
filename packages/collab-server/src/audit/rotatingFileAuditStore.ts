/**
 * Collaboration Audit - File-Based Audit Store with Rotation/Retention
 *
 * Enhanced file-based implementation of AuditStore with:
 * - Size-based rotation (new file when size limit reached)
 * - Time-based retention (delete old files after X days)
 * - Write rate limiting (prevent disk overload)
 * - Export functionality for admin
 */

import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AuditEvent, AuditQueryParams, AuditStore } from "./auditTypes";

/** Configuration for the rotating file audit store */
export interface RotatingFileAuditStoreConfig {
  /** Base file path (e.g., ".lfcc/audit/audit.jsonl") */
  filePath: string;
  /** Maximum file size in bytes before rotation (default: 10MB) */
  maxFileSizeBytes?: number;
  /** Maximum age in days for retention (default: 30) */
  retentionDays?: number;
  /** Maximum total size of all audit files in bytes (default: 100MB) */
  maxTotalSizeBytes?: number;
  /** Maximum writes per minute per document (rate limiting) */
  maxWritesPerMinutePerDoc?: number;
  /** Skip low-signal events when rate limited (never skip ERROR) */
  dropLowSignalOnLimit?: boolean;
}

const DEFAULT_CONFIG: Required<RotatingFileAuditStoreConfig> = {
  filePath: ".lfcc/audit/audit.jsonl",
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  retentionDays: 30,
  maxTotalSizeBytes: 100 * 1024 * 1024, // 100MB
  maxWritesPerMinutePerDoc: 100,
  dropLowSignalOnLimit: true,
};

/** Low-signal event types that can be dropped when rate limited */
const LOW_SIGNAL_EVENTS = new Set(["UPDATE"]);

/**
 * Rotating file audit store with retention controls.
 */
export class RotatingFileAuditStore implements AuditStore {
  private config: Required<RotatingFileAuditStoreConfig>;
  private initialized = false;
  private currentFileSize = 0;
  private fileIndex = 0;
  /** Write counts per doc for rate limiting (resets every minute) */
  private writeCountByDoc = new Map<string, number>();
  private rateLimitResetInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RotatingFileAuditStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async append(events: AuditEvent[]): Promise<void> {
    await this.ensureInitialized();

    // Filter events based on rate limiting
    const filteredEvents = events.filter((event) => this.checkRateLimit(event));
    if (filteredEvents.length === 0) {
      return;
    }

    // Check if rotation is needed
    const estimatedSize = filteredEvents.reduce((acc, e) => acc + JSON.stringify(e).length + 1, 0);
    if (this.currentFileSize + estimatedSize > this.config.maxFileSizeBytes) {
      await this.rotate();
    }

    // Write events
    const lines = `${filteredEvents.map((e) => JSON.stringify(e)).join("\n")}\n`;
    const currentFile = this.getCurrentFilePath();
    await appendFile(currentFile, lines, "utf-8");
    this.currentFileSize += Buffer.byteLength(lines, "utf-8");

    // Update write counts for rate limiting
    for (const event of filteredEvents) {
      const count = this.writeCountByDoc.get(event.docId) ?? 0;
      this.writeCountByDoc.set(event.docId, count + 1);
    }
  }

  async query(params: AuditQueryParams): Promise<AuditEvent[]> {
    await this.ensureInitialized();

    const files = await this.listAuditFiles();
    let allEvents: AuditEvent[] = [];

    // Read all files (most recent last)
    for (const file of files) {
      const events = await this.readEventsFromFile(file);
      allEvents = allEvents.concat(events);
    }

    // Filter by docId
    if (params.docId) {
      allEvents = allEvents.filter((e) => e.docId === params.docId);
    }

    // Filter by since
    const since = params.since;
    if (since !== undefined) {
      allEvents = allEvents.filter((e) => e.ts >= since);
    }

    // Sort by timestamp
    allEvents.sort((a, b) => a.ts - b.ts);

    // Apply limit
    if (params.limit !== undefined && params.limit > 0) {
      allEvents = allEvents.slice(0, params.limit);
    }

    return allEvents;
  }

  /**
   * Export audit events for a document within a time range.
   */
  async export(params: { docId?: string; since?: number; until?: number }): Promise<AuditEvent[]> {
    await this.ensureInitialized();

    const files = await this.listAuditFiles();
    let events: AuditEvent[] = [];

    for (const file of files) {
      const fileEvents = await this.readEventsFromFile(file);
      events = events.concat(fileEvents);
    }

    // Filter by docId
    if (params.docId) {
      events = events.filter((e) => e.docId === params.docId);
    }

    // Filter by since
    const since = params.since;
    if (since !== undefined) {
      events = events.filter((e) => e.ts >= since);
    }

    // Filter by until
    const until = params.until;
    if (until !== undefined) {
      events = events.filter((e) => e.ts <= until);
    }

    // Sort by timestamp
    events.sort((a, b) => a.ts - b.ts);

    return events;
  }

  async close(): Promise<void> {
    if (this.rateLimitResetInterval) {
      clearInterval(this.rateLimitResetInterval);
      this.rateLimitResetInterval = null;
    }
  }

  /**
   * Run retention cleanup - delete old files.
   */
  async runRetention(): Promise<{ deletedFiles: string[]; freedBytes: number }> {
    await this.ensureInitialized();

    const files = await this.listAuditFiles();
    const now = Date.now();
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    const deletedFiles: string[] = [];
    let freedBytes = 0;

    // Delete files older than retention period
    for (const file of files) {
      if (file === this.getCurrentFilePath()) {
        continue; // Never delete current file
      }

      try {
        const fileStat = await stat(file);
        if (now - fileStat.mtimeMs > maxAge) {
          freedBytes += fileStat.size;
          await rm(file);
          deletedFiles.push(file);
        }
      } catch {
        // File may have been deleted concurrently
      }
    }

    // If still over total size limit, delete oldest files
    let totalSize = await this.getTotalSize();
    const sortedFiles = files.filter((f) => f !== this.getCurrentFilePath());

    while (totalSize > this.config.maxTotalSizeBytes && sortedFiles.length > 0) {
      const oldestFile = sortedFiles.shift();
      if (!oldestFile) {
        break;
      }

      try {
        const fileStat = await stat(oldestFile);
        freedBytes += fileStat.size;
        totalSize -= fileStat.size;
        await rm(oldestFile);
        deletedFiles.push(oldestFile);
      } catch {
        // File may have been deleted concurrently
      }
    }

    return { deletedFiles, freedBytes };
  }

  /**
   * Get statistics about the audit store.
   */
  async getStats(): Promise<{
    fileCount: number;
    totalSizeBytes: number;
    currentFileSizeBytes: number;
    oldestEventTs: number | null;
    newestEventTs: number | null;
  }> {
    await this.ensureInitialized();

    const files = await this.listAuditFiles();
    const totalSize = await this.getTotalSize();

    // Read first and last events for timestamps
    let oldestTs: number | null = null;
    let newestTs: number | null = null;

    if (files.length > 0) {
      // Read oldest from first file
      const oldestFile = files[0];
      const oldestEvents = await this.readEventsFromFile(oldestFile);
      if (oldestEvents.length > 0) {
        oldestTs = oldestEvents[0].ts;
      }

      // Read newest from last file
      const newestFile = files[files.length - 1];
      const newestEvents = await this.readEventsFromFile(newestFile);
      if (newestEvents.length > 0) {
        newestTs = newestEvents[newestEvents.length - 1].ts;
      }
    }

    return {
      fileCount: files.length,
      totalSizeBytes: totalSize,
      currentFileSizeBytes: this.currentFileSize,
      oldestEventTs: oldestTs,
      newestEventTs: newestTs,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure directory exists
    const dir = dirname(this.config.filePath);
    await mkdir(dir, { recursive: true });

    // Find existing files and determine current file index
    const files = await this.listAuditFiles();
    if (files.length > 0) {
      const lastFile = files[files.length - 1];
      const match = basename(lastFile).match(/\.(\d+)\.jsonl$/);
      if (match) {
        this.fileIndex = Number.parseInt(match[1], 10);
      }
    }

    // Get current file size
    try {
      const currentFile = this.getCurrentFilePath();
      const fileStat = await stat(currentFile);
      this.currentFileSize = fileStat.size;
    } catch {
      this.currentFileSize = 0;
    }

    // Start rate limit reset interval (every minute)
    this.rateLimitResetInterval = setInterval(() => {
      this.writeCountByDoc.clear();
    }, 60 * 1000);

    this.initialized = true;
  }

  private getCurrentFilePath(): string {
    const base = this.config.filePath.replace(/\.jsonl$/, "");
    return `${base}.${this.fileIndex.toString().padStart(4, "0")}.jsonl`;
  }

  private async rotate(): Promise<void> {
    this.fileIndex += 1;
    this.currentFileSize = 0;

    // Create empty file
    const newFile = this.getCurrentFilePath();
    await writeFile(newFile, "", "utf-8");

    // Run retention cleanup in background
    this.runRetention().catch((err) => {
      console.error("[RotatingFileAuditStore] Retention cleanup failed:", err);
    });
  }

  private async listAuditFiles(): Promise<string[]> {
    const dir = dirname(this.config.filePath);
    const baseName = basename(this.config.filePath).replace(/\.jsonl$/, "");

    try {
      const entries = await readdir(dir);
      const pattern = new RegExp(`^${baseName}\\.(\\d{4})\\.jsonl$`);

      const files = entries
        .filter((entry) => pattern.test(entry))
        .map((entry) => join(dir, entry))
        .sort(); // Sort by name (lexicographic = chronological due to zero-padding)

      return files;
    } catch {
      return [];
    }
  }

  private async readEventsFromFile(filePath: string): Promise<AuditEvent[]> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim().length > 0);

      const events: AuditEvent[] = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          events.push(event);
        } catch {
          // Skip malformed lines
          console.warn("[RotatingFileAuditStore] Skipping malformed line");
        }
      }

      return events;
    } catch {
      return [];
    }
  }

  private async getTotalSize(): Promise<number> {
    const files = await this.listAuditFiles();
    let total = 0;

    for (const file of files) {
      try {
        const fileStat = await stat(file);
        total += fileStat.size;
      } catch {
        // File may have been deleted
      }
    }

    return total;
  }

  private checkRateLimit(event: AuditEvent): boolean {
    // Never drop ERROR events
    if (event.eventType === "ERROR") {
      return true;
    }

    const count = this.writeCountByDoc.get(event.docId) ?? 0;
    if (count >= this.config.maxWritesPerMinutePerDoc) {
      // Rate limited
      if (this.config.dropLowSignalOnLimit && LOW_SIGNAL_EVENTS.has(event.eventType)) {
        return false; // Drop low-signal event
      }
    }

    return true;
  }
}
