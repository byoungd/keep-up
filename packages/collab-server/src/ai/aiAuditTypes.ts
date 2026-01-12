/**
 * AI Audit Types
 *
 * Defines audit event types for AI suggestion actions.
 */

/** AI suggestion audit event types */
export type AISuggestionEventType =
  | "AI_SUGGESTION_GENERATED"
  | "AI_SUGGESTION_APPLIED"
  | "AI_SUGGESTION_REJECTED"
  | "AI_SUGGESTION_UNDONE";

/** AI suggestion audit metadata */
export interface AISuggestionAuditMetadata {
  /** Unique suggestion ID */
  suggestionId: string;
  /** Document ID */
  docId: string;
  /** User who performed the action */
  actorId: string;
  /** Bytes length delta (positive for additions, negative for deletions) */
  bytesLenDelta?: number;
  /** Suggestion type */
  suggestionType?: string;
  /** Whether suggestion had citations */
  hasCitations?: boolean;
  /** Number of citations */
  citationCount?: number;
  /** Timestamp */
  ts: number;
}

/** AI suggestion audit event */
export interface AISuggestionAuditEvent {
  /** Event type */
  eventType: AISuggestionEventType;
  /** Event metadata */
  metadata: AISuggestionAuditMetadata;
}

/**
 * Create an AI suggestion generated audit event.
 */
export function createSuggestionGeneratedEvent(
  suggestionId: string,
  docId: string,
  actorId: string,
  options: {
    suggestionType?: string;
    hasCitations?: boolean;
    citationCount?: number;
  } = {}
): AISuggestionAuditEvent {
  return {
    eventType: "AI_SUGGESTION_GENERATED",
    metadata: {
      suggestionId,
      docId,
      actorId,
      suggestionType: options.suggestionType,
      hasCitations: options.hasCitations,
      citationCount: options.citationCount,
      ts: Date.now(),
    },
  };
}

/**
 * Create an AI suggestion applied audit event.
 */
export function createSuggestionAppliedEvent(
  suggestionId: string,
  docId: string,
  actorId: string,
  bytesLenDelta: number
): AISuggestionAuditEvent {
  return {
    eventType: "AI_SUGGESTION_APPLIED",
    metadata: {
      suggestionId,
      docId,
      actorId,
      bytesLenDelta,
      ts: Date.now(),
    },
  };
}

/**
 * Create an AI suggestion rejected audit event.
 */
export function createSuggestionRejectedEvent(
  suggestionId: string,
  docId: string,
  actorId: string
): AISuggestionAuditEvent {
  return {
    eventType: "AI_SUGGESTION_REJECTED",
    metadata: {
      suggestionId,
      docId,
      actorId,
      ts: Date.now(),
    },
  };
}

/**
 * Create an AI suggestion undone audit event.
 */
export function createSuggestionUndoneEvent(
  suggestionId: string,
  docId: string,
  actorId: string,
  bytesLenDelta: number
): AISuggestionAuditEvent {
  return {
    eventType: "AI_SUGGESTION_UNDONE",
    metadata: {
      suggestionId,
      docId,
      actorId,
      bytesLenDelta,
      ts: Date.now(),
    },
  };
}
