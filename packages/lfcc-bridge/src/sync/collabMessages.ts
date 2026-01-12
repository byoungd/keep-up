/**
 * Collaboration MVP - SyncMessage Types
 *
 * Defines the message schema for the transport-agnostic collaboration layer.
 * These messages are used for CRDT synchronization, presence, and session management.
 */

/** Message types for collaboration sync */
export type SyncMessageType = "CRDT_UPDATE" | "JOIN" | "LEAVE" | "PRESENCE" | "ERROR";

/** User role in a collaboration session */
export type Role = "editor" | "viewer";

/** Error codes for permission and authentication errors */
export type ErrorCode = "PERMISSION_DENIED" | "INVALID_TOKEN" | "UNKNOWN";

/** Base fields common to all sync messages */
export type SyncMessageBase = {
  /** Message type discriminator */
  type: SyncMessageType;
  /** Document identifier */
  docId: string;
  /** Unique sender identifier (used for echo prevention) */
  senderId: string;
  /** Unix timestamp in milliseconds */
  ts: number;
};

/** CRDT update message containing Loro update bytes */
export type CrdtUpdateMessage = SyncMessageBase & {
  type: "CRDT_UPDATE";
  /** Base64-encoded Loro update bytes */
  bytesB64: string;
};

/** Join message sent when a client joins a document session */
export type JoinMessage = SyncMessageBase & {
  type: "JOIN";
  /** Optional role assigned to the user */
  role?: Role;
};

/** Leave message sent when a client leaves a document session */
export type LeaveMessage = SyncMessageBase & {
  type: "LEAVE";
};

/** Presence payload for cursor/selection sharing */
export type PresencePayload = {
  /** Display name of the user */
  displayName?: string;
  /** Cursor position */
  cursor?: {
    blockId: string;
    offset: number;
  };
  /** User status */
  status?: "active" | "idle" | "away";
  /** State hash for divergence detection */
  stateHash?: string;
};

/** Presence message for sharing cursor/selection state */
export type PresenceMessage = SyncMessageBase & {
  type: "PRESENCE";
  /** Presence data payload */
  payload: PresencePayload;
};

/** Error message for permission and authentication errors */
export type ErrorMessage = SyncMessageBase & {
  type: "ERROR";
  /** Error code */
  code: ErrorCode;
};

/** Union type of all sync messages */
export type SyncMessage =
  | CrdtUpdateMessage
  | JoinMessage
  | LeaveMessage
  | PresenceMessage
  | ErrorMessage;

/**
 * Type guard to check if a value is a valid SyncMessageBase
 */
export function isSyncMessageBase(value: unknown): value is SyncMessageBase {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const msg = value as Record<string, unknown>;
  return (
    typeof msg.type === "string" &&
    ["CRDT_UPDATE", "JOIN", "LEAVE", "PRESENCE", "ERROR"].includes(msg.type) &&
    typeof msg.docId === "string" &&
    msg.docId.length > 0 &&
    typeof msg.senderId === "string" &&
    msg.senderId.length > 0 &&
    typeof msg.ts === "number" &&
    msg.ts > 0
  );
}

/**
 * Type guard to check if a value is a valid CrdtUpdateMessage
 */
export function isCrdtUpdateMessage(value: unknown): value is CrdtUpdateMessage {
  if (!isSyncMessageBase(value)) {
    return false;
  }
  const msg = value as SyncMessageBase & Record<string, unknown>;
  return msg.type === "CRDT_UPDATE" && typeof msg.bytesB64 === "string";
}

/**
 * Type guard to check if a value is a valid JoinMessage
 */
export function isJoinMessage(value: unknown): value is JoinMessage {
  if (!isSyncMessageBase(value)) {
    return false;
  }
  const msg = value as SyncMessageBase & Record<string, unknown>;
  if (msg.type !== "JOIN") {
    return false;
  }
  // role is optional, but if present must be valid
  if (msg.role !== undefined && !isValidRole(msg.role)) {
    return false;
  }
  return true;
}

/**
 * Type guard to check if a value is a valid Role
 */
export function isValidRole(value: unknown): value is Role {
  return value === "editor" || value === "viewer";
}

/**
 * Type guard to check if a value is a valid ErrorCode
 */
export function isValidErrorCode(value: unknown): value is ErrorCode {
  return value === "PERMISSION_DENIED" || value === "INVALID_TOKEN" || value === "UNKNOWN";
}

/**
 * Type guard to check if a value is a valid LeaveMessage
 */
export function isLeaveMessage(value: unknown): value is LeaveMessage {
  if (!isSyncMessageBase(value)) {
    return false;
  }
  return (value as SyncMessageBase).type === "LEAVE";
}

/**
 * Type guard to check if a value is a valid PresencePayload
 */
export function isPresencePayload(value: unknown): value is PresencePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const payload = value as Record<string, unknown>;

  // All fields are optional, but if present must be correct type
  if (payload.displayName !== undefined && typeof payload.displayName !== "string") {
    return false;
  }
  if (payload.cursor !== undefined) {
    if (typeof payload.cursor !== "object" || payload.cursor === null) {
      return false;
    }
    const cursor = payload.cursor as Record<string, unknown>;
    if (typeof cursor.blockId !== "string" || typeof cursor.offset !== "number") {
      return false;
    }
  }
  if (
    payload.status !== undefined &&
    !["active", "idle", "away"].includes(payload.status as string)
  ) {
    return false;
  }
  if (payload.stateHash !== undefined && typeof payload.stateHash !== "string") {
    return false;
  }
  return true;
}

/**
 * Type guard to check if a value is a valid PresenceMessage
 */
export function isPresenceMessage(value: unknown): value is PresenceMessage {
  if (!isSyncMessageBase(value)) {
    return false;
  }
  const msg = value as SyncMessageBase & Record<string, unknown>;
  return msg.type === "PRESENCE" && isPresencePayload(msg.payload);
}

/**
 * Type guard to check if a value is a valid ErrorMessage
 */
export function isErrorMessage(value: unknown): value is ErrorMessage {
  if (!isSyncMessageBase(value)) {
    return false;
  }
  const msg = value as SyncMessageBase & Record<string, unknown>;
  return msg.type === "ERROR" && isValidErrorCode(msg.code);
}

/**
 * Type guard to check if a value is a valid SyncMessage
 */
export function isValidSyncMessage(value: unknown): value is SyncMessage {
  return (
    isCrdtUpdateMessage(value) ||
    isJoinMessage(value) ||
    isLeaveMessage(value) ||
    isPresenceMessage(value) ||
    isErrorMessage(value)
  );
}

/**
 * Factory function to create a CRDT_UPDATE message
 */
export function createCrdtUpdateMessage(
  docId: string,
  senderId: string,
  bytesB64: string
): CrdtUpdateMessage {
  return {
    type: "CRDT_UPDATE",
    docId,
    senderId,
    ts: Date.now(),
    bytesB64,
  };
}

/**
 * Factory function to create a JOIN message
 */
export function createJoinMessage(docId: string, senderId: string, role?: Role): JoinMessage {
  const msg: JoinMessage = {
    type: "JOIN",
    docId,
    senderId,
    ts: Date.now(),
  };
  if (role !== undefined) {
    msg.role = role;
  }
  return msg;
}

/**
 * Factory function to create a LEAVE message
 */
export function createLeaveMessage(docId: string, senderId: string): LeaveMessage {
  return {
    type: "LEAVE",
    docId,
    senderId,
    ts: Date.now(),
  };
}

/**
 * Factory function to create a PRESENCE message
 */
export function createPresenceMessage(
  docId: string,
  senderId: string,
  payload: PresencePayload
): PresenceMessage {
  return {
    type: "PRESENCE",
    docId,
    senderId,
    ts: Date.now(),
    payload,
  };
}

/**
 * Factory function to create an ERROR message
 */
export function createErrorMessage(docId: string, senderId: string, code: ErrorCode): ErrorMessage {
  return {
    type: "ERROR",
    docId,
    senderId,
    ts: Date.now(),
    code,
  };
}

/**
 * Serialize a SyncMessage to JSON string
 */
export function serializeSyncMessage(msg: SyncMessage): string {
  return JSON.stringify(msg);
}

/**
 * Deserialize a JSON string to SyncMessage (with validation)
 * @throws Error if the message is invalid
 */
export function deserializeSyncMessage(json: string): SyncMessage {
  const parsed: unknown = JSON.parse(json);
  if (!isValidSyncMessage(parsed)) {
    throw new Error("Invalid SyncMessage format");
  }
  return parsed;
}
