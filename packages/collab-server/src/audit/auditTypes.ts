/**
 * Collaboration Audit - Type Definitions
 *
 * Defines types for the audit logging system.
 * Audit events record metadata only, never raw content.
 */

import type { ErrorCode, Role } from "../permissions/types";

/** Types of audit events */
export type AuditEventType = "JOIN" | "LEAVE" | "UPDATE" | "ERROR" | "SNAPSHOT";

/** All valid audit event types */
export const VALID_AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  "JOIN",
  "LEAVE",
  "UPDATE",
  "ERROR",
  "SNAPSHOT",
] as const;

const VALID_ERROR_CODES: readonly ErrorCode[] = [
  "PERMISSION_DENIED",
  "INVALID_TOKEN",
  "UNKNOWN",
  "RATE_LIMITED",
  "BACKPRESSURE",
  "QUOTA_EXCEEDED",
] as const;

/**
 * Audit event record.
 *
 * Contains metadata about collaboration events.
 * NEVER contains raw CRDT bytes or document content.
 */
export type AuditEvent = {
  /** Unique event identifier (UUID) */
  eventId: string;
  /** Unix timestamp in milliseconds */
  ts: number;
  /** Document identifier */
  docId: string;
  /** User who triggered the event */
  actorId: string;
  /** User's role at event time */
  role: Role;
  /** Type of event */
  eventType: AuditEventType;
  /** Byte length for UPDATE events (not content!) */
  updateBytesLen?: number;
  /** Optional client info (app version, platform) */
  clientInfo?: string;
  /** Optional connection identifier */
  connectionId?: string;
  /** Error code for ERROR events */
  errorCode?: ErrorCode;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
};

/** Input for creating an audit event (without auto-generated fields) */
export type AuditEventInput = Omit<AuditEvent, "eventId" | "ts">;

/** Parameters for querying audit events */
export type AuditQueryParams = {
  /** Filter by document ID */
  docId?: string;
  /** Filter events after this timestamp */
  since?: number;
  /** Filter events before this timestamp */
  until?: number;
  /** Filter by actor ID */
  actorId?: string;
  /** Filter by event type */
  eventType?: AuditEventType;
  /** Maximum number of events to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
};

/**
 * Audit store interface.
 *
 * Implementations persist audit events to durable storage.
 */
export interface AuditStore {
  /**
   * Append events to the audit log.
   * @param events - Events to append
   */
  append(events: AuditEvent[]): Promise<void>;

  /**
   * Query audit events.
   * @param params - Query parameters
   * @returns Matching events in chronological order
   */
  query(params: AuditQueryParams): Promise<AuditEvent[]>;

  /**
   * Close the store and release resources.
   */
  close?(): Promise<void>;
}

/**
 * Type guard to check if a value is a valid AuditEventType
 */
export function isValidAuditEventType(value: unknown): value is AuditEventType {
  return typeof value === "string" && VALID_AUDIT_EVENT_TYPES.includes(value as AuditEventType);
}

/**
 * Type guard to check if a value is a valid AuditEvent
 */
export function isValidAuditEvent(value: unknown): value is AuditEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;

  const requiredStringFields: Array<keyof AuditEvent> = ["eventId", "docId", "actorId"];
  const hasRequiredStrings = requiredStringFields.every((field) => {
    const fieldValue = event[field];
    return typeof fieldValue === "string" && fieldValue.length > 0;
  });
  if (!hasRequiredStrings) {
    return false;
  }

  if (typeof event.ts !== "number" || event.ts <= 0) {
    return false;
  }

  const role = event.role;
  const validRole = role === "editor" || role === "viewer";
  if (!validRole || !isValidAuditEventType(event.eventType)) {
    return false;
  }

  const updateLen = event.updateBytesLen;
  if (updateLen !== undefined && typeof updateLen !== "number") {
    return false;
  }

  const optionalStringFields: Array<keyof AuditEvent> = ["clientInfo", "connectionId"];
  const optionalStringsValid = optionalStringFields.every((field) => {
    const value = event[field];
    return value === undefined || typeof value === "string";
  });
  if (!optionalStringsValid) {
    return false;
  }

  const errorCode = event.errorCode;
  if (errorCode !== undefined && !VALID_ERROR_CODES.includes(errorCode as ErrorCode)) {
    return false;
  }

  return true;
}
