/**
 * Audit Query API Routes
 *
 * Provides HTTP endpoints for querying audit logs.
 * Supports filtering by docId, time range, and pagination.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditEvent, AuditQueryParams, AuditStore } from "../audit/auditTypes";

/** Audit query request parameters */
export type AuditQueryRequest = {
  docId?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
  actorId?: string;
  eventType?: string;
};

/** Audit query response */
export type AuditQueryResponse =
  | {
      ok: true;
      events: AuditEvent[];
      total: number;
      hasMore: boolean;
    }
  | { ok: false; error: string };

/**
 * Audit routes handler.
 */
export class AuditRoutes {
  constructor(private auditStore: AuditStore) {}

  /**
   * Handle GET /audit request.
   * Query parameters:
   * - docId: Filter by document ID
   * - since: Filter events after this timestamp (ms)
   * - until: Filter events before this timestamp (ms)
   * - limit: Maximum number of events to return (default: 100, max: 1000)
   * - offset: Number of events to skip (for pagination)
   * - actorId: Filter by actor ID
   * - eventType: Filter by event type (JOIN, LEAVE, UPDATE, ERROR)
   */
  async handleQuery(
    req: IncomingMessage,
    res: ServerResponse,
    sendJson: (res: ServerResponse, status: number, payload: unknown) => void
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const params = this.parseQueryParams(url.searchParams);

      // Validate limit
      const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
      const offset = Math.max(params.offset ?? 0, 0);

      const queryParams: AuditQueryParams = {
        docId: params.docId,
        since: params.since,
        until: params.until,
        limit: limit + 1, // Fetch one extra to check hasMore
        offset,
        actorId: params.actorId,
        eventType: params.eventType as AuditQueryParams["eventType"],
      };

      const events = await this.auditStore.query(queryParams);
      const hasMore = events.length > limit;
      const resultEvents = hasMore ? events.slice(0, limit) : events;

      const response: AuditQueryResponse = {
        ok: true,
        events: resultEvents,
        total: resultEvents.length,
        hasMore,
      };

      sendJson(res, 200, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to query audit logs";
      sendJson(res, 500, { ok: false, error: message });
    }
  }

  /**
   * Parse query parameters from URL search params.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parses multiple optional query params
  private parseQueryParams(searchParams: URLSearchParams): AuditQueryRequest {
    const params: AuditQueryRequest = {};

    const docId = searchParams.get("docId");
    if (docId) {
      params.docId = docId;
    }

    const since = searchParams.get("since");
    if (since) {
      const sinceNum = Number.parseInt(since, 10);
      if (!Number.isNaN(sinceNum)) {
        params.since = sinceNum;
      }
    }

    const until = searchParams.get("until");
    if (until) {
      const untilNum = Number.parseInt(until, 10);
      if (!Number.isNaN(untilNum)) {
        params.until = untilNum;
      }
    }

    const limit = searchParams.get("limit");
    if (limit) {
      const limitNum = Number.parseInt(limit, 10);
      if (!Number.isNaN(limitNum)) {
        params.limit = limitNum;
      }
    }

    const offset = searchParams.get("offset");
    if (offset) {
      const offsetNum = Number.parseInt(offset, 10);
      if (!Number.isNaN(offsetNum)) {
        params.offset = offsetNum;
      }
    }

    const actorId = searchParams.get("actorId");
    if (actorId) {
      params.actorId = actorId;
    }

    const eventType = searchParams.get("eventType");
    if (eventType && ["JOIN", "LEAVE", "UPDATE", "ERROR"].includes(eventType)) {
      params.eventType = eventType;
    }

    return params;
  }
}
