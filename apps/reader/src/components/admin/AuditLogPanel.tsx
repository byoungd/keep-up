/**
 * AuditLogPanel - Admin panel for viewing audit events
 *
 * Displays document audit timeline with filtering and pagination.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/Button";
import {
  type AuditEvent,
  type AuditEventType,
  type AuditFilters,
  formatAuditTimestamp,
  getEventTypeInfo,
  useAuditLog,
} from "@/hooks/useAuditLog";

interface AuditLogPanelProps {
  /** Initial document ID filter */
  docId?: string;
  /** Audit API server URL */
  serverUrl?: string;
  /** Additional CSS classes */
  className?: string;
}

const EVENT_TYPE_OPTIONS: Array<{ value: AuditEventType | ""; label: string }> = [
  { value: "", label: "All events" },
  { value: "JOIN", label: "Join" },
  { value: "LEAVE", label: "Leave" },
  { value: "UPDATE", label: "Update" },
  { value: "ERROR", label: "Error" },
];

/**
 * Admin panel for viewing audit logs.
 */
export function AuditLogPanel({
  docId: initialDocId,
  serverUrl = "http://localhost:3030",
  className,
}: AuditLogPanelProps): React.ReactElement {
  const [showFilters, setShowFilters] = React.useState(false);
  const [docIdInput, setDocIdInput] = React.useState(initialDocId ?? "");
  const [actorIdInput, setActorIdInput] = React.useState("");
  const [eventTypeInput, setEventTypeInput] = React.useState<AuditEventType | "">("");

  const {
    events,
    isLoading,
    error,
    hasMore,
    total,
    filters,
    pagination,
    setFilters,
    nextPage,
    prevPage,
    refresh,
  } = useAuditLog(serverUrl, initialDocId ? { docId: initialDocId } : undefined);

  // Apply filters
  const handleApplyFilters = React.useCallback(() => {
    const newFilters: AuditFilters = {};
    if (docIdInput) {
      newFilters.docId = docIdInput;
    }
    if (actorIdInput) {
      newFilters.actorId = actorIdInput;
    }
    if (eventTypeInput) {
      newFilters.eventType = eventTypeInput;
    }
    setFilters(newFilters);
  }, [docIdInput, actorIdInput, eventTypeInput, setFilters]);

  // Clear filters
  const handleClearFilters = React.useCallback(() => {
    setDocIdInput("");
    setActorIdInput("");
    setEventTypeInput("");
    setFilters({});
  }, [setFilters]);

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const hasFilters = filters.docId || filters.actorId || filters.eventType;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Audit Log</h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(hasFilters && "text-primary")}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Filters
            {hasFilters && <span className="ml-1 text-xs">•</span>}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            aria-label="Refresh"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="docId-filter" className="mb-1 block text-xs font-medium">
                Document ID
              </label>
              <input
                id="docId-filter"
                type="text"
                value={docIdInput}
                onChange={(e) => setDocIdInput(e.target.value)}
                placeholder="Filter by document..."
                className="w-full rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm"
                aria-label="Document ID filter"
              />
            </div>
            <div>
              <label htmlFor="actorId-filter" className="mb-1 block text-xs font-medium">
                Actor ID
              </label>
              <input
                id="actorId-filter"
                type="text"
                value={actorIdInput}
                onChange={(e) => setActorIdInput(e.target.value)}
                placeholder="Filter by actor..."
                className="w-full rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm"
                aria-label="Actor ID filter"
              />
            </div>
            <div>
              <label htmlFor="eventType-filter" className="mb-1 block text-xs font-medium">
                Event Type
              </label>
              <select
                id="eventType-filter"
                value={eventTypeInput}
                onChange={(e) => setEventTypeInput(e.target.value as AuditEventType | "")}
                className="w-full rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm"
                aria-label="Event type filter"
              >
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleApplyFilters}>
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && events.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && events.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileEdit className="mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No audit events found</p>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="mt-2"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Events list */}
      {events.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="divide-y divide-border">
            {events.map((event) => (
              <AuditEventRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {(events.length > 0 || pagination.offset > 0) && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {pagination.offset + 1}-{pagination.offset + events.length}
            {total > 0 && ` of ${total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={prevPage}
              disabled={pagination.offset === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground">Page {currentPage}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={nextPage}
              disabled={!hasMore}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single audit event row.
 */
function AuditEventRow({ event }: { event: AuditEvent }): React.ReactElement {
  const typeInfo = getEventTypeInfo(event.eventType);
  const Icon = getEventIcon(event.eventType);
  const isDivergence = event.metadata?.divergenceMismatch;

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3", isDivergence && "bg-warning/5")}>
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          event.eventType === "JOIN" && "bg-success/10",
          event.eventType === "LEAVE" && "bg-muted",
          event.eventType === "UPDATE" && "bg-primary/10",
          event.eventType === "ERROR" && "bg-error/10"
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", typeInfo.color)} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", typeInfo.color)}>{typeInfo.label}</span>
          {isDivergence && (
            <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              Divergence
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span title="Actor ID">Actor: {truncateId(event.actorId)}</span>
          <span title="Document ID">Doc: {truncateId(event.docId)}</span>
          {event.metadata?.role && <span>Role: {event.metadata.role}</span>}
          {event.metadata?.updateBytesLen !== undefined && (
            <span>{formatBytes(event.metadata.updateBytesLen)}</span>
          )}
          {event.metadata?.errorCode && (
            <span className="text-error">Error: {event.metadata.errorCode}</span>
          )}
        </div>
      </div>

      <time
        className="shrink-0 text-xs text-muted-foreground"
        dateTime={new Date(event.timestamp).toISOString()}
      >
        {formatAuditTimestamp(event.timestamp)}
      </time>
    </div>
  );
}

/**
 * Get icon for event type.
 */
function getEventIcon(eventType: AuditEventType): React.ComponentType<{ className?: string }> {
  switch (eventType) {
    case "JOIN":
      return LogIn;
    case "LEAVE":
      return LogOut;
    case "UPDATE":
      return FileEdit;
    case "ERROR":
      return AlertTriangle;
    default:
      return FileEdit;
  }
}

/**
 * Truncate ID for display.
 */
function truncateId(id: string, maxLen = 12): string {
  if (id.length <= maxLen) {
    return id;
  }
  return `${id.slice(0, maxLen)}...`;
}

/**
 * Format bytes for display.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
