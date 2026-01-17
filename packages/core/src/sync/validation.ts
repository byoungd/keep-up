import { isManifestHashFormat, validateManifest } from "../kernel/policy/index.js";
import {
  DEFAULT_VALIDATION_CONFIG,
  validatePresencePayload as validatePresencePayloadSize,
  validateUpdatePayload,
} from "../security/validation.js";
import type {
  CatchUpRequestMessage,
  CatchUpResponseMessage,
  ClientCapabilities,
  DocAckMessage,
  DocUpdateMessage,
  ErrorCategory,
  ErrorMessage,
  HandshakeAckMessage,
  HandshakeMessage,
  MessageEnvelope,
  MessageType,
  PresenceAckMessage,
  PresenceMessage,
  PresencePayload,
  SelectionRange,
  UserMeta,
} from "./protocol.js";
import { PROTOCOL_VERSION } from "./protocol.js";

export type ClientInboundMessage =
  | HandshakeAckMessage
  | DocUpdateMessage
  | DocAckMessage
  | PresenceAckMessage
  | CatchUpResponseMessage
  | ErrorMessage
  | MessageEnvelope<"pong", Record<string, never>>;

export type ServerInboundMessage =
  | HandshakeMessage
  | DocUpdateMessage
  | PresenceMessage
  | CatchUpRequestMessage
  | MessageEnvelope<"ping", Record<string, never>>;

export type ValidationResult<T> = { ok: true; message: T } | { ok: false; errors: string[] };

const CLIENT_MESSAGE_TYPES = new Set<MessageType>([
  "handshake_ack",
  "doc_update",
  "doc_ack",
  "presence_ack",
  "catch_up_response",
  "error",
  "pong",
]);

const SERVER_MESSAGE_TYPES = new Set<MessageType>([
  "handshake",
  "doc_update",
  "presence",
  "catch_up_request",
  "ping",
]);

const ERROR_CATEGORIES = new Set<ErrorCategory>([
  "validation",
  "policy",
  "conflict",
  "capacity",
  "rate_limit",
  "auth",
  "timeout",
  "not_found",
  "internal",
]);

export function validateClientInboundMessage(msg: unknown): ValidationResult<ClientInboundMessage> {
  const envelope = validateEnvelope(msg, CLIENT_MESSAGE_TYPES);
  if (!envelope.ok) {
    return envelope;
  }

  const payload = envelope.message.payload;
  const type = envelope.message.type;
  const errors: string[] = [];

  switch (type) {
    case "handshake_ack":
      validateHandshakeAckPayload(payload, errors);
      break;
    case "doc_update":
      validateDocUpdatePayload(payload, errors);
      break;
    case "doc_ack":
      validateDocAckPayload(payload, errors);
      break;
    case "presence_ack":
      validatePresenceAckPayload(payload, errors);
      break;
    case "catch_up_response":
      validateCatchUpResponsePayload(payload, errors);
      break;
    case "error":
      validateErrorPayload(payload, errors);
      break;
    case "pong":
      if (!isRecord(payload)) {
        errors.push("payload must be an object");
      } else if (!isEmptyRecord(payload)) {
        errors.push("payload must be an empty object");
      }
      break;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, message: msg as ClientInboundMessage };
}

export function validateServerInboundMessage(msg: unknown): ValidationResult<ServerInboundMessage> {
  const envelope = validateEnvelope(msg, SERVER_MESSAGE_TYPES);
  if (!envelope.ok) {
    return envelope;
  }

  const payload = envelope.message.payload;
  const type = envelope.message.type;
  const errors: string[] = [];

  switch (type) {
    case "handshake":
      validateHandshakePayload(payload, errors);
      break;
    case "doc_update":
      validateDocUpdatePayload(payload, errors);
      break;
    case "presence":
      validatePresencePayload(payload, errors);
      break;
    case "catch_up_request":
      validateCatchUpRequestPayload(payload, errors);
      break;
    case "ping":
      if (!isRecord(payload)) {
        errors.push("payload must be an object");
      } else if (!isEmptyRecord(payload)) {
        errors.push("payload must be an empty object");
      }
      break;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, message: msg as ServerInboundMessage };
}

type Envelope = {
  type: MessageType;
  payload: Record<string, unknown>;
};

function validateEnvelope(
  msg: unknown,
  allowedTypes: Set<MessageType>
): ValidationResult<Envelope> {
  const errors: string[] = [];

  if (!isRecord(msg)) {
    return { ok: false, errors: ["message must be an object"] };
  }

  const type = msg.type;
  if (!isString(type) || !allowedTypes.has(type as MessageType)) {
    errors.push("message type is invalid or not allowed");
  }

  const payload = msg.payload;

  if (!isString(msg.version)) {
    errors.push("version must be a string");
  } else if (msg.version !== PROTOCOL_VERSION) {
    errors.push("version is not supported");
  }
  if (!isString(msg.docId)) {
    errors.push("docId must be a string");
  }
  if (!isString(msg.clientId)) {
    errors.push("clientId must be a string");
  }
  if (!isNumber(msg.seq)) {
    errors.push("seq must be a number");
  }
  if (!isString(msg.timestamp)) {
    errors.push("timestamp must be a string");
  }
  if (!isRecord(payload)) {
    errors.push("payload must be an object");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    message: { type: type as MessageType, payload: payload as Record<string, unknown> },
  };
}

function validateHandshakePayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!validatePolicyManifest(payload.client_manifest_v09)) {
    errors.push("client_manifest_v09 is invalid");
  }
  if (!isString(payload.client_manifest_hash)) {
    errors.push("client_manifest_hash must be a string");
  } else if (!isManifestHashFormat(payload.client_manifest_hash)) {
    errors.push("client_manifest_hash must be a sha256 hex string");
  }
  if (!validateClientCapabilities(payload.capabilities)) {
    errors.push("capabilities is invalid");
  }
  if (payload.lastFrontierTag !== undefined && !isString(payload.lastFrontierTag)) {
    errors.push("lastFrontierTag must be a string");
  }
  if (payload.token !== undefined && !isString(payload.token)) {
    errors.push("token must be a string");
  }
  if (payload.userMeta !== undefined && !validateUserMeta(payload.userMeta)) {
    errors.push("userMeta is invalid");
  }
}

function validateHandshakeAckPayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!validatePolicyManifest(payload.server_manifest_v09)) {
    errors.push("server_manifest_v09 is invalid");
  }
  if (!validatePolicyManifest(payload.effective_manifest_v09)) {
    errors.push("effective_manifest_v09 is invalid");
  }
  if (!isString(payload.chosen_manifest_hash)) {
    errors.push("chosen_manifest_hash must be a string");
  } else if (!isManifestHashFormat(payload.chosen_manifest_hash)) {
    errors.push("chosen_manifest_hash must be a sha256 hex string");
  }
  if (payload.role !== undefined && !isRole(payload.role)) {
    errors.push("role is invalid");
  }
  if (!validateServerCapabilities(payload.serverCapabilities, errors)) {
    // Errors pushed by helper or generic error
    if (!payload.serverCapabilities) {
      errors.push("serverCapabilities is invalid");
    }
  }
  if (!isString(payload.sessionId)) {
    errors.push("sessionId must be a string");
  }
  if (!isBoolean(payload.needsCatchUp)) {
    errors.push("needsCatchUp must be a boolean");
  }
  if (!isString(payload.serverFrontierTag)) {
    errors.push("serverFrontierTag must be a string");
  }
  if (payload.negotiationLog !== undefined && !Array.isArray(payload.negotiationLog)) {
    errors.push("negotiationLog must be an array");
  }
}

function validateServerCapabilities(capabilities: unknown, errors: string[]): boolean {
  if (!isRecord(capabilities)) {
    return false;
  }
  if (!isNumber(capabilities.maxClientsPerRoom)) {
    errors.push("serverCapabilities.maxClientsPerRoom must be a number");
  }
  if (!isNumber(capabilities.presenceTtlMs)) {
    errors.push("serverCapabilities.presenceTtlMs must be a number");
  }
  if (!isBoolean(capabilities.supportsSnapshots)) {
    errors.push("serverCapabilities.supportsSnapshots must be a boolean");
  }
  return true;
}

function validateDocUpdatePayload(payload: Record<string, unknown>, errors: string[]): void {
  const sizeResult = validateUpdatePayload(payload, DEFAULT_VALIDATION_CONFIG);
  if (!sizeResult.valid) {
    errors.push(sizeResult.message ?? "update payload size is invalid");
  }

  if (!isString(payload.updateData)) {
    errors.push("updateData must be a string");
  }
  if (!isBoolean(payload.isBase64)) {
    errors.push("isBase64 must be a boolean");
  }
  if (!isString(payload.frontierTag)) {
    errors.push("frontierTag must be a string");
  }
  if (!isString(payload.parentFrontierTag)) {
    errors.push("parentFrontierTag must be a string");
  }
  if (!isNumber(payload.sizeBytes)) {
    errors.push("sizeBytes must be a number");
  }
  if (payload.origin !== undefined && !isString(payload.origin)) {
    errors.push("origin must be a string");
  }
}

function validateDocAckPayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!isNumber(payload.ackedSeq)) {
    errors.push("ackedSeq must be a number");
  }
  if (!isBoolean(payload.applied)) {
    errors.push("applied must be a boolean");
  }
  if (!isString(payload.serverFrontierTag)) {
    errors.push("serverFrontierTag must be a string");
  }
  if (payload.rejectionReason !== undefined && !isString(payload.rejectionReason)) {
    errors.push("rejectionReason must be a string");
  }
}

function validatePresencePayload(payload: Record<string, unknown>, errors: string[]): void {
  const sizeResult = validatePresencePayloadSize(payload, DEFAULT_VALIDATION_CONFIG);
  if (!sizeResult.valid) {
    errors.push(sizeResult.message ?? "presence payload size is invalid");
  }

  if (!validateUserMeta(payload.userMeta)) {
    errors.push("userMeta is invalid");
  }
  if (!isString(payload.status) || !["active", "idle", "away"].includes(payload.status)) {
    errors.push("status must be active|idle|away");
  }
  if (!isString(payload.lastActivity)) {
    errors.push("lastActivity must be a string");
  }

  if (payload.cursor !== undefined && !validateCursor(payload.cursor)) {
    errors.push("cursor is invalid");
  }
  if (payload.selection !== undefined && !validateSelection(payload.selection)) {
    errors.push("selection is invalid");
  }
}

function validatePresenceAckPayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!Array.isArray(payload.presences)) {
    errors.push("presences must be an array");
    return;
  }

  for (const entry of payload.presences) {
    if (!isRecord(entry)) {
      errors.push("presence entry must be an object");
      continue;
    }
    if (!isString(entry.clientId)) {
      errors.push("presence.clientId must be a string");
    }
    if (!isRecord(entry.presence)) {
      errors.push("presence.presence must be an object");
      continue;
    }
    const nestedErrors: string[] = [];
    validatePresencePayload(entry.presence, nestedErrors);
    if (nestedErrors.length > 0) {
      errors.push("presence payload is invalid");
    }
  }
}

function validateCatchUpRequestPayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!isString(payload.fromFrontierTag)) {
    errors.push("fromFrontierTag must be a string");
  }
  if (!isBoolean(payload.preferSnapshot)) {
    errors.push("preferSnapshot must be a boolean");
  }
}

function validateCatchUpResponsePayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!isBoolean(payload.isSnapshot)) {
    errors.push("isSnapshot must be a boolean");
  }
  if (!isString(payload.data)) {
    errors.push("data must be a string");
  }
  if (!isString(payload.frontierTag)) {
    errors.push("frontierTag must be a string");
  }
  if (payload.updateCount !== undefined && !isNumber(payload.updateCount)) {
    errors.push("updateCount must be a number");
  }
}

function validateErrorPayload(payload: Record<string, unknown>, errors: string[]): void {
  if (!isString(payload.code)) {
    errors.push("code must be a string");
  }
  if (!isString(payload.category) || !ERROR_CATEGORIES.has(payload.category as ErrorCategory)) {
    errors.push("category must be a valid string");
  }
  if (!isString(payload.message)) {
    errors.push("message must be a string");
  }
  if (!isBoolean(payload.retryable)) {
    errors.push("retryable must be a boolean");
  }
  if (payload.retryAfterMs !== undefined && !isNumber(payload.retryAfterMs)) {
    errors.push("retryAfterMs must be a number");
  }
  if (payload.details !== undefined && !isRecord(payload.details)) {
    errors.push("details must be an object");
  }
}

function validatePolicyManifest(manifest: unknown): boolean {
  if (!isRecord(manifest)) {
    return false;
  }
  const result = validateManifest(manifest);
  return result.valid;
}

function validateClientCapabilities(capabilities: unknown): capabilities is ClientCapabilities {
  if (!isRecord(capabilities)) {
    return false;
  }
  if (!isStringArray(capabilities.features)) {
    return false;
  }
  if (!isNumber(capabilities.maxUpdateSize)) {
    return false;
  }
  if (!isBoolean(capabilities.supportsBinary)) {
    return false;
  }
  if (!isBoolean(capabilities.supportsCompression)) {
    return false;
  }
  return true;
}

function validateUserMeta(meta: unknown): meta is UserMeta {
  if (!isRecord(meta)) {
    return false;
  }
  if (!isString(meta.userId)) {
    return false;
  }
  if (!isString(meta.displayName)) {
    return false;
  }
  if (meta.avatarUrl !== undefined && !isString(meta.avatarUrl)) {
    return false;
  }
  if (meta.color !== undefined && !isString(meta.color)) {
    return false;
  }
  return true;
}

const ROLE_VALUES = new Set(["viewer", "editor", "admin"]);

function isRole(value: unknown): value is "viewer" | "editor" | "admin" {
  return isString(value) && ROLE_VALUES.has(value);
}

function validateCursor(cursor: unknown): cursor is PresencePayload["cursor"] {
  if (!isRecord(cursor)) {
    return false;
  }
  if (!isString(cursor.blockId)) {
    return false;
  }
  if (!isNumber(cursor.offset)) {
    return false;
  }
  return true;
}

function validateSelection(selection: unknown): selection is SelectionRange {
  if (!isRecord(selection)) {
    return false;
  }
  if (!validateCursor(selection.anchor)) {
    return false;
  }
  if (!validateCursor(selection.head)) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isEmptyRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}
