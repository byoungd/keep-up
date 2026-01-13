/**
 * LFCC v0.9 RC - Track 11: Message Validation
 *
 * Schema validation and size limits for sync messages.
 * Ensures fail-closed on malformed input.
 */

import type { SyncMessage } from "../sync/protocol.js";

/** Validation configuration */
export type ValidationConfig = {
  /** Maximum message size in bytes */
  maxMessageSize: number;
  /** Maximum update payload size in bytes */
  maxUpdateSize: number;
  /** Maximum presence payload size in bytes */
  maxPresenceSize: number;
  /** Allowed message types */
  allowedTypes: Set<string>;
};

/** Default validation config */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxMessageSize: 5 * 1024 * 1024, // 5MB
  maxUpdateSize: 2 * 1024 * 1024, // 2MB
  maxPresenceSize: 16 * 1024, // 16KB
  allowedTypes: new Set([
    "handshake",
    "handshake_ack",
    "doc_update",
    "doc_ack",
    "presence",
    "presence_ack",
    "catch_up_request",
    "catch_up_response",
    "ping",
    "pong",
    "error",
  ]),
};

/** Validation result */
export type ValidationResult = {
  /** Whether validation passed */
  valid: boolean;
  /** Error code (if invalid) */
  code?: "SIZE_EXCEEDED" | "INVALID_TYPE" | "MALFORMED" | "MISSING_FIELD";
  /** Human-readable message */
  message?: string;
};

/**
 * Validate raw message size before parsing.
 */
export function validateMessageSize(
  data: string | ArrayBuffer,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  const size = typeof data === "string" ? data.length : data.byteLength;

  if (size > config.maxMessageSize) {
    return {
      valid: false,
      code: "SIZE_EXCEEDED",
      message: `Message size ${size} exceeds maximum ${config.maxMessageSize}`,
    };
  }

  return { valid: true };
}

/**
 * Validate parsed message structure.
 */
export function validateMessageSchema(
  msg: unknown,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  // Basic type check
  if (!msg || typeof msg !== "object") {
    return { valid: false, code: "MALFORMED", message: "Message must be an object" };
  }

  const m = msg as Record<string, unknown>;

  // Required fields
  if (typeof m.type !== "string") {
    return { valid: false, code: "MISSING_FIELD", message: "Missing 'type' field" };
  }

  if (typeof m.docId !== "string") {
    return { valid: false, code: "MISSING_FIELD", message: "Missing 'docId' field" };
  }

  if (typeof m.clientId !== "string") {
    return { valid: false, code: "MISSING_FIELD", message: "Missing 'clientId' field" };
  }

  // Type whitelist
  if (!config.allowedTypes.has(m.type)) {
    return { valid: false, code: "INVALID_TYPE", message: `Unknown message type: ${m.type}` };
  }

  // Payload check
  if (m.payload !== undefined && typeof m.payload !== "object") {
    return { valid: false, code: "MALFORMED", message: "Payload must be an object" };
  }

  return { valid: true };
}

/**
 * Validate doc_update payload size.
 */
export function validateUpdatePayload(
  payload: unknown,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return { valid: false, code: "MALFORMED", message: "Update payload required" };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.updateData === "string") {
    const size = p.updateData.length;
    if (size > config.maxUpdateSize) {
      return {
        valid: false,
        code: "SIZE_EXCEEDED",
        message: `Update size ${size} exceeds maximum ${config.maxUpdateSize}`,
      };
    }
  }

  if (typeof p.sizeBytes === "number" && p.sizeBytes > config.maxUpdateSize) {
    return {
      valid: false,
      code: "SIZE_EXCEEDED",
      message: `Declared size ${p.sizeBytes} exceeds maximum ${config.maxUpdateSize}`,
    };
  }

  return { valid: true };
}

/**
 * Validate presence payload size.
 */
export function validatePresencePayload(
  payload: unknown,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return { valid: false, code: "MALFORMED", message: "Presence payload required" };
  }

  const serialized = JSON.stringify(payload);
  if (serialized.length > config.maxPresenceSize) {
    return {
      valid: false,
      code: "SIZE_EXCEEDED",
      message: `Presence size ${serialized.length} exceeds maximum ${config.maxPresenceSize}`,
    };
  }

  return { valid: true };
}

/**
 * Full message validation pipeline.
 */
export function validateSyncMessage(
  msg: SyncMessage,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationResult {
  // Schema validation
  const schemaResult = validateMessageSchema(msg, config);
  if (!schemaResult.valid) {
    return schemaResult;
  }

  // Payload-specific validation
  if (msg.type === "doc_update") {
    return validateUpdatePayload(msg.payload, config);
  }

  if (msg.type === "presence") {
    return validatePresencePayload(msg.payload, config);
  }

  return { valid: true };
}
