/**
 * Collaboration Audit - File-Based Audit Store
 *
 * Append-only file-based implementation of AuditStore.
 * Uses JSON Lines format for simplicity and durability.
 */

import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditEvent, AuditQueryParams, AuditStore } from "./auditTypes";

/**
 * File-based audit store using JSON Lines format.
 *
 * Features:
 * - Append-only writes for durability
 * - JSON Lines format (one JSON object per line)
 * - Simple file-based storage
 * - Supports filtering and pagination
 */
export class FileAuditStore implements AuditStore {
  private filePath: string;
  private initialized = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(events: AuditEvent[]): Promise<void> {
    await this.ensureInitialized();

    // Convert events to JSON Lines format
    const lines = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;

    // Append to file
    await appendFile(this.filePath, lines, "utf-8");
  }

  async query(params: AuditQueryParams): Promise<AuditEvent[]> {
    await this.ensureInitialized();

    // Check if file exists
    try {
      await stat(this.filePath);
    } catch {
      return []; // File doesn't exist yet
    }

    // Read all events
    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    let events: AuditEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as AuditEvent;
        events.push(event);
      } catch {
        // Skip malformed lines
        console.warn("[FileAuditStore] Skipping malformed line");
      }
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

    // Sort by timestamp (chronological)
    events = events.sort((a, b) => a.ts - b.ts);

    // Apply limit
    if (params.limit !== undefined && params.limit > 0) {
      events = events.slice(0, params.limit);
    }

    return events;
  }

  async close(): Promise<void> {
    // No-op for file store
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure directory exists
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });

    this.initialized = true;
  }
}
