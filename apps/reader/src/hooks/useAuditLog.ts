/**
 * useAuditLog - Hook for fetching and filtering audit events
 *
 * Integrates with the /audit API endpoint.
 */

"use client";

import * as React from "react";

/** Audit event types */
export type AuditEventType = "JOIN" | "LEAVE" | "UPDATE" | "ERROR";

/** Audit event from API */
export interface AuditEvent {
  id: string;
  timestamp: number;
  docId: string;
  actorId: string;
  eventType: AuditEventType;
  metadata?: {
    role?: string;
    updateBytesLen?: number;
    errorCode?: string;
    errorMessage?: string;
    stateHash?: string;
    divergenceMismatch?: boolean;
  };
}

/** Audit query filters */
export interface AuditFilters {
  docId?: string;
  eventType?: AuditEventType;
  actorId?: string;
  since?: Date;
  until?: Date;
}

/** Pagination state */
export interface AuditPagination {
  limit: number;
  offset: number;
}

/** Hook result */
export interface UseAuditLogResult {
  /** Audit events */
  events: AuditEvent[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether there are more events */
  hasMore: boolean;
  /** Total events in current query */
  total: number;
  /** Current filters */
  filters: AuditFilters;
  /** Current pagination */
  pagination: AuditPagination;
  /** Update filters */
  setFilters: (filters: AuditFilters) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Refresh data */
  refresh: () => void;
}

const DEFAULT_LIMIT = 50;

/**
 * Build query params from filters and pagination.
 */
function buildQueryParams(filters: AuditFilters, pagination: AuditPagination): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.docId) {
    params.set("docId", filters.docId);
  }
  if (filters.eventType) {
    params.set("eventType", filters.eventType);
  }
  if (filters.actorId) {
    params.set("actorId", filters.actorId);
  }
  if (filters.since) {
    params.set("since", filters.since.getTime().toString());
  }
  if (filters.until) {
    params.set("until", filters.until.getTime().toString());
  }

  params.set("limit", pagination.limit.toString());
  params.set("offset", pagination.offset.toString());

  return params;
}

/**
 * Process fetch response and extract data.
 */
async function processFetchResponse(response: Response): Promise<{
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
}> {
  if (!response.ok) {
    throw new Error(`Failed to fetch audit logs: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error ?? "Failed to fetch audit logs");
  }

  return {
    events: data.events ?? [],
    total: data.total ?? 0,
    hasMore: data.hasMore ?? false,
  };
}

/**
 * Hook for fetching audit log events.
 *
 * @param serverUrl - Audit API server URL
 * @param initialFilters - Initial filter values
 */
export function useAuditLog(serverUrl: string, initialFilters?: AuditFilters): UseAuditLogResult {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [total, setTotal] = React.useState(0);
  const [filters, setFilters] = React.useState<AuditFilters>(initialFilters ?? {});
  const [pagination, setPagination] = React.useState<AuditPagination>({
    limit: DEFAULT_LIMIT,
    offset: 0,
  });
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  // Fetch events when filters or pagination change
  React.useEffect(() => {
    const controller = new AbortController();
    // Touch refreshTrigger so dependency is intentional
    const _refreshTick = refreshTrigger;

    async function fetchEvents() {
      setIsLoading(true);
      setError(null);

      try {
        const params = buildQueryParams(filters, pagination);
        const url = `${serverUrl}/audit?${params.toString()}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const result = await processFetchResponse(response);
        setEvents(result.events);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to fetch audit logs");
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvents();

    return () => controller.abort();
  }, [serverUrl, filters, pagination, refreshTrigger]);

  // Reset pagination when filters change
  const handleSetFilters = React.useCallback((newFilters: AuditFilters) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, offset: 0 }));
  }, []);

  const nextPage = React.useCallback(() => {
    if (hasMore) {
      setPagination((prev) => ({
        ...prev,
        offset: prev.offset + prev.limit,
      }));
    }
  }, [hasMore]);

  const prevPage = React.useCallback(() => {
    setPagination((prev) => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit),
    }));
  }, []);

  const refresh = React.useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    events,
    isLoading,
    error,
    hasMore,
    total,
    filters,
    pagination,
    setFilters: handleSetFilters,
    nextPage,
    prevPage,
    refresh,
  };
}

/**
 * Format timestamp for display.
 */
export function formatAuditTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get event type display info.
 */
export function getEventTypeInfo(eventType: AuditEventType): {
  label: string;
  color: string;
} {
  switch (eventType) {
    case "JOIN":
      return { label: "Join", color: "text-success" };
    case "LEAVE":
      return { label: "Leave", color: "text-muted-foreground" };
    case "UPDATE":
      return { label: "Update", color: "text-primary" };
    case "ERROR":
      return { label: "Error", color: "text-error" };
    default:
      return { label: eventType, color: "text-foreground" };
  }
}
