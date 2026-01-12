/**
 * Collaboration Audit - In-Memory Audit Store
 *
 * Simple in-memory implementation of AuditStore.
 * Useful for testing and development.
 */

import type { AuditEvent, AuditQueryParams, AuditStore } from "./auditTypes";

/**
 * In-memory audit store.
 *
 * Stores events in memory. Events are lost on restart.
 * Useful for testing and development.
 */
export class MemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];
  private maxEvents: number;

  constructor(maxEvents = 10000) {
    this.maxEvents = maxEvents;
  }

  async append(events: AuditEvent[]): Promise<void> {
    this.events.push(...events);

    // Trim if over max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  async query(params: AuditQueryParams): Promise<AuditEvent[]> {
    let result = this.events;

    // Filter by docId
    if (params.docId) {
      result = result.filter((e) => e.docId === params.docId);
    }

    // Filter by actorId
    if (params.actorId) {
      result = result.filter((e) => e.actorId === params.actorId);
    }

    // Filter by eventType
    if (params.eventType) {
      result = result.filter((e) => e.eventType === params.eventType);
    }

    // Filter by since
    const since = params.since;
    if (since !== undefined) {
      result = result.filter((e) => e.ts >= since);
    }

    // Filter by until
    const until = params.until;
    if (until !== undefined) {
      result = result.filter((e) => e.ts <= until);
    }

    // Sort by timestamp (chronological)
    result = result.sort((a, b) => a.ts - b.ts);

    // Apply offset
    if (params.offset !== undefined && params.offset > 0) {
      result = result.slice(params.offset);
    }

    // Apply limit
    if (params.limit !== undefined && params.limit > 0) {
      result = result.slice(0, params.limit);
    }

    return result;
  }

  async close(): Promise<void> {
    // No-op for memory store
  }

  /**
   * Get all events (for testing).
   */
  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  /**
   * Clear all events (for testing).
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get event count.
   */
  getEventCount(): number {
    return this.events.length;
  }
}
