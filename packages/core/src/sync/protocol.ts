/**
 * LFCC v0.9 RC - Sync Protocol Types
 *
 * WebSocket synchronization protocol for Loro + LFCC.
 * Supports document updates, presence, and policy negotiation.
 */

import type { PolicyManifestV09 } from "../kernel/policy/types.js";

/** Protocol version for backward compatibility */
export const PROTOCOL_VERSION = "1.0.0";

/** Message types */
export type MessageType =
  | "handshake"
  | "handshake_ack"
  | "doc_update"
  | "doc_ack"
  | "presence"
  | "presence_ack"
  | "catch_up_request"
  | "catch_up_response"
  | "error"
  | "ping"
  | "pong";

/** Base message envelope */
export type MessageEnvelope<T extends MessageType = MessageType, P = unknown> = {
  /** Protocol version */
  version: string;
  /** Message type */
  type: T;
  /** Document ID */
  docId: string;
  /** Client ID (unique per connection) */
  clientId: string;
  /** Message sequence number (for ordering/ack) */
  seq: number;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Type-specific payload */
  payload: P;
};

// ============================================================================
// Handshake Messages
// ============================================================================

/** Client capabilities */
export type ClientCapabilities = {
  /** Supported features */
  features: string[];
  /** Maximum update size in bytes */
  maxUpdateSize: number;
  /** Supports binary updates */
  supportsBinary: boolean;
  /** Supports compression */
  supportsCompression: boolean;
};

/** Handshake request payload */
export type HandshakePayload = {
  /** Client's policy manifest (LFCC v0.9) */
  client_manifest_v09: PolicyManifestV09;
  /** Hash of the client manifest (deterministic) */
  client_manifest_hash: string;
  /** Client capabilities */
  capabilities: ClientCapabilities;
  /** Last known frontier tag (for reconnect) */
  lastFrontierTag?: string;
  /** Authorization token (optional) */
  token?: string;
  /** User metadata */
  userMeta?: UserMeta;
};

/** Handshake acknowledgment payload */
export type HandshakeAckPayload = {
  /** Server policy manifest (LFCC v0.9) */
  server_manifest_v09: PolicyManifestV09;
  /** Hash of the chosen effective manifest */
  chosen_manifest_hash: string;
  /** Negotiated effective manifest */
  effective_manifest_v09: PolicyManifestV09;
  /** Negotiation log (for debugging) */
  negotiationLog?: NegotiationLogEntry[];
  /** Server capabilities */
  serverCapabilities: ServerCapabilities;
  /** Session ID */
  sessionId: string;
  /** Effective role for this session (if known) */
  role?: "viewer" | "editor" | "admin";
  /** Whether catch-up is needed */
  needsCatchUp: boolean;
  /** Current server frontier tag */
  serverFrontierTag: string;
};

/** Server capabilities */
export type ServerCapabilities = {
  /** Maximum clients per room */
  maxClientsPerRoom: number;
  /** Presence TTL in milliseconds */
  presenceTtlMs: number;
  /** Supports snapshots */
  supportsSnapshots: boolean;
};

/** Compact policy manifest digest (hash only) */
export type PolicyManifestCompact = {
  /** Deterministic hash of full manifest */
  manifest_hash: string;
};

/** Negotiation log entry */
export type NegotiationLogEntry = {
  /** Field being negotiated */
  field: string;
  /** Client value */
  clientValue: unknown;
  /** Server value */
  serverValue: unknown;
  /** Resolved value */
  resolvedValue: unknown;
  /** Resolution strategy used */
  strategy: "client_wins" | "server_wins" | "min" | "max" | "intersection" | "reject";
};

// ============================================================================
// Document Update Messages
// ============================================================================

/** Document update payload */
export type DocUpdatePayload = {
  /** Update bytes (base64 encoded if not binary) */
  updateData: string;
  /** Whether data is base64 encoded */
  isBase64: boolean;
  /** Update frontier tag */
  frontierTag: string;
  /** Parent frontier tag (for ordering) */
  parentFrontierTag: string;
  /** Update size in bytes */
  sizeBytes: number;
  /** Optional origin tag for update attribution */
  origin?: string;
};

/** Document acknowledgment payload */
export type DocAckPayload = {
  /** Acknowledged sequence number */
  ackedSeq: number;
  /** Server frontier tag after applying */
  serverFrontierTag: string;
  /** Whether update was applied */
  applied: boolean;
  /** Rejection reason if not applied */
  rejectionReason?: string;
};

/** Catch-up request payload */
export type CatchUpRequestPayload = {
  /** Client's last known frontier tag */
  fromFrontierTag: string;
  /** Whether to request snapshot instead of incremental */
  preferSnapshot: boolean;
};

/** Catch-up response payload */
export type CatchUpResponsePayload = {
  /** Whether response is a snapshot */
  isSnapshot: boolean;
  /** Update/snapshot data (base64) */
  data: string;
  /** Current frontier tag */
  frontierTag: string;
  /** Number of updates included (if incremental) */
  updateCount?: number;
};

// ============================================================================
// Presence Messages
// ============================================================================

/** User metadata */
export type UserMeta = {
  /** User ID */
  userId: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** User color (for cursors) */
  color?: string;
};

/** Cursor position */
export type CursorPosition = {
  /** Block ID */
  blockId: string;
  /** Offset within block */
  offset: number;
};

/** Selection range */
export type SelectionRange = {
  /** Anchor position */
  anchor: CursorPosition;
  /** Head position */
  head: CursorPosition;
};

/** Presence payload */
export type PresencePayload = {
  /** User metadata */
  userMeta: UserMeta;
  /** Cursor position */
  cursor?: CursorPosition;
  /** Selection range */
  selection?: SelectionRange;
  /** User status */
  status: "active" | "idle" | "away";
  /** Last activity timestamp */
  lastActivity: string;
};

/** Presence acknowledgment (broadcast to others) */
export type PresenceAckPayload = {
  /** All current presences in room */
  presences: Array<{
    clientId: string;
    presence: PresencePayload;
  }>;
};

// ============================================================================
// Error Messages
// ============================================================================

/** Error codes */
export type ErrorCode =
  | "INVALID_MESSAGE"
  | "POLICY_MISMATCH"
  | "ERR_POLICY_INCOMPATIBLE"
  | "FRONTIER_CONFLICT"
  | "UPDATE_TOO_LARGE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "ROOM_FULL"
  | "DOC_NOT_FOUND"
  | "HANDSHAKE_TIMEOUT"
  | "IDLE_TIMEOUT"
  | "INTERNAL_ERROR";

/** Error categories */
export type ErrorCategory =
  | "validation"
  | "policy"
  | "conflict"
  | "capacity"
  | "rate_limit"
  | "auth"
  | "timeout"
  | "not_found"
  | "internal";

/** Error payload */
export type ErrorPayload = {
  /** Error code */
  code: ErrorCode;
  /** Error category */
  category: ErrorCategory;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Whether client should retry */
  retryable: boolean;
  /** Suggested retry delay in ms */
  retryAfterMs?: number;
};

// ============================================================================
// Typed Message Helpers
// ============================================================================

export type HandshakeMessage = MessageEnvelope<"handshake", HandshakePayload>;
export type HandshakeAckMessage = MessageEnvelope<"handshake_ack", HandshakeAckPayload>;
export type DocUpdateMessage = MessageEnvelope<"doc_update", DocUpdatePayload>;
export type DocAckMessage = MessageEnvelope<"doc_ack", DocAckPayload>;
export type PresenceMessage = MessageEnvelope<"presence", PresencePayload>;
export type PresenceAckMessage = MessageEnvelope<"presence_ack", PresenceAckPayload>;
export type CatchUpRequestMessage = MessageEnvelope<"catch_up_request", CatchUpRequestPayload>;
export type CatchUpResponseMessage = MessageEnvelope<"catch_up_response", CatchUpResponsePayload>;
export type ErrorMessage = MessageEnvelope<"error", ErrorPayload>;
export type PingMessage = MessageEnvelope<"ping", Record<string, never>>;
export type PongMessage = MessageEnvelope<"pong", Record<string, never>>;

export type SyncMessage =
  | HandshakeMessage
  | HandshakeAckMessage
  | DocUpdateMessage
  | DocAckMessage
  | PresenceMessage
  | PresenceAckMessage
  | CatchUpRequestMessage
  | CatchUpResponseMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;

// ============================================================================
// Message Factories
// ============================================================================

let seqCounter = 0;

/** Create a new message envelope */
export function createMessage<T extends MessageType, P>(
  type: T,
  docId: string,
  clientId: string,
  payload: P
): MessageEnvelope<T, P> {
  return {
    version: PROTOCOL_VERSION,
    type,
    docId,
    clientId,
    seq: ++seqCounter,
    timestamp: new Date().toISOString(),
    payload,
  };
}

/** Reset sequence counter (for testing) */
export function resetSeqCounter(): void {
  seqCounter = 0;
}

/** Serialize message to JSON string */
export function serializeMessage(msg: SyncMessage): string {
  return JSON.stringify(msg);
}

/** Deserialize message from JSON string */
export function deserializeMessage(json: string): unknown {
  return JSON.parse(json) as unknown;
}

/** Validate message envelope structure */
export function validateMessage(msg: unknown): msg is SyncMessage {
  if (typeof msg !== "object" || msg === null) {
    return false;
  }
  const m = msg as Record<string, unknown>;
  return (
    typeof m.version === "string" &&
    typeof m.type === "string" &&
    typeof m.docId === "string" &&
    typeof m.clientId === "string" &&
    typeof m.seq === "number" &&
    typeof m.timestamp === "string" &&
    typeof m.payload === "object"
  );
}
