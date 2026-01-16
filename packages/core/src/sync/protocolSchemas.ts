/**
 * LFCC v0.9 RC - Sync Protocol Zod Schemas
 *
 * Runtime validation schemas for WebSocket synchronization messages.
 * Ensures message integrity at API boundaries to prevent malformed data.
 *
 * @module protocolSchemas
 */

import { z } from "zod";

// ============================================================================
// Base Schemas
// ============================================================================

export const MessageTypeSchema = z.enum([
  "handshake",
  "handshake_ack",
  "doc_update",
  "doc_ack",
  "presence",
  "presence_ack",
  "catch_up_request",
  "catch_up_response",
  "error",
  "ping",
  "pong",
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

// ============================================================================
// Client/Server Capabilities
// ============================================================================

export const ClientCapabilitiesSchema = z.object({
  features: z.array(z.string()),
  maxUpdateSize: z.number().int().positive(),
  supportsBinary: z.boolean(),
  supportsCompression: z.boolean(),
});

export const ServerCapabilitiesSchema = z.object({
  maxClientsPerRoom: z.number().int().positive(),
  presenceTtlMs: z.number().int().positive(),
  supportsSnapshots: z.boolean(),
});

// ============================================================================
// User and Presence Types
// ============================================================================

export const UserMetaSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const CursorPositionSchema = z.object({
  blockId: z.string().min(1),
  offset: z.number().int().min(0),
});

export const SelectionRangeSchema = z.object({
  anchor: CursorPositionSchema,
  head: CursorPositionSchema,
});

export const PresenceStatusSchema = z.enum(["active", "idle", "away"]);

// ============================================================================
// Negotiation Types
// ============================================================================

export const NegotiationStrategySchema = z.enum([
  "client_wins",
  "server_wins",
  "min",
  "max",
  "intersection",
  "reject",
]);

export const NegotiationLogEntrySchema = z.object({
  field: z.string(),
  clientValue: z.unknown(),
  serverValue: z.unknown(),
  resolvedValue: z.unknown(),
  strategy: NegotiationStrategySchema,
});

// ============================================================================
// Error Types
// ============================================================================

export const ErrorCodeSchema = z.enum([
  "INVALID_MESSAGE",
  "POLICY_MISMATCH",
  "ERR_POLICY_INCOMPATIBLE",
  "FRONTIER_CONFLICT",
  "UPDATE_TOO_LARGE",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "ROOM_FULL",
  "DOC_NOT_FOUND",
  "HANDSHAKE_TIMEOUT",
  "IDLE_TIMEOUT",
  "INTERNAL_ERROR",
]);

export const ErrorCategorySchema = z.enum([
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

// ============================================================================
// Payload Schemas
// ============================================================================

export const HandshakePayloadSchema = z.object({
  client_manifest_v09: z.record(z.string(), z.unknown()), // PolicyManifestV09
  client_manifest_hash: z.string().min(1),
  capabilities: ClientCapabilitiesSchema,
  lastFrontierTag: z.string().optional(),
  token: z.string().optional(),
  userMeta: UserMetaSchema.optional(),
});

export const HandshakeAckPayloadSchema = z.object({
  server_manifest_v09: z.record(z.string(), z.unknown()),
  chosen_manifest_hash: z.string().min(1),
  effective_manifest_v09: z.record(z.string(), z.unknown()),
  negotiationLog: z.array(NegotiationLogEntrySchema).optional(),
  serverCapabilities: ServerCapabilitiesSchema,
  sessionId: z.string().min(1),
  role: z.enum(["viewer", "editor", "admin"]).optional(),
  needsCatchUp: z.boolean(),
  serverFrontierTag: z.string().min(1),
});

export const DocUpdatePayloadSchema = z.object({
  updateData: z.string().min(1),
  isBase64: z.boolean(),
  frontierTag: z.string().min(1),
  parentFrontierTag: z.string().min(1),
  sizeBytes: z.number().int().min(0),
  origin: z.string().optional(),
});

export const DocAckPayloadSchema = z.object({
  ackedSeq: z.number().int().min(0),
  serverFrontierTag: z.string().min(1),
  applied: z.boolean(),
  rejectionReason: z.string().optional(),
});

export const CatchUpRequestPayloadSchema = z.object({
  fromFrontierTag: z.string().min(1),
  preferSnapshot: z.boolean(),
});

export const CatchUpResponsePayloadSchema = z.object({
  isSnapshot: z.boolean(),
  data: z.string().min(1),
  frontierTag: z.string().min(1),
  updateCount: z.number().int().min(0).optional(),
});

export const PresencePayloadSchema = z.object({
  userMeta: UserMetaSchema,
  cursor: CursorPositionSchema.optional(),
  selection: SelectionRangeSchema.optional(),
  status: PresenceStatusSchema,
  lastActivity: z.string().datetime(),
});

export const PresenceAckPayloadSchema = z.object({
  presences: z.array(
    z.object({
      clientId: z.string().min(1),
      presence: PresencePayloadSchema,
    })
  ),
});

export const ErrorPayloadSchema = z.object({
  code: ErrorCodeSchema,
  category: ErrorCategorySchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().min(0).optional(),
});

export const EmptyPayloadSchema = z.object({}).strict();

// ============================================================================
// Message Envelope Schema Factory
// ============================================================================

function createMessageEnvelopeSchema<T extends z.ZodTypeAny>(
  type: z.ZodLiteral<string>,
  payloadSchema: T
) {
  return z.object({
    version: z.string().min(1),
    type,
    docId: z.string().min(1),
    clientId: z.string().min(1),
    seq: z.number().int().min(0),
    timestamp: z.string().datetime(),
    payload: payloadSchema,
  });
}

// ============================================================================
// Typed Message Schemas
// ============================================================================

export const HandshakeMessageSchema = createMessageEnvelopeSchema(
  z.literal("handshake"),
  HandshakePayloadSchema
);

export const HandshakeAckMessageSchema = createMessageEnvelopeSchema(
  z.literal("handshake_ack"),
  HandshakeAckPayloadSchema
);

export const DocUpdateMessageSchema = createMessageEnvelopeSchema(
  z.literal("doc_update"),
  DocUpdatePayloadSchema
);

export const DocAckMessageSchema = createMessageEnvelopeSchema(
  z.literal("doc_ack"),
  DocAckPayloadSchema
);

export const PresenceMessageSchema = createMessageEnvelopeSchema(
  z.literal("presence"),
  PresencePayloadSchema
);

export const PresenceAckMessageSchema = createMessageEnvelopeSchema(
  z.literal("presence_ack"),
  PresenceAckPayloadSchema
);

export const CatchUpRequestMessageSchema = createMessageEnvelopeSchema(
  z.literal("catch_up_request"),
  CatchUpRequestPayloadSchema
);

export const CatchUpResponseMessageSchema = createMessageEnvelopeSchema(
  z.literal("catch_up_response"),
  CatchUpResponsePayloadSchema
);

export const ErrorMessageSchema = createMessageEnvelopeSchema(
  z.literal("error"),
  ErrorPayloadSchema
);

export const PingMessageSchema = createMessageEnvelopeSchema(z.literal("ping"), EmptyPayloadSchema);

export const PongMessageSchema = createMessageEnvelopeSchema(z.literal("pong"), EmptyPayloadSchema);

// ============================================================================
// Discriminated Union for All Messages
// ============================================================================

export const SyncMessageSchema = z.discriminatedUnion("type", [
  HandshakeMessageSchema,
  HandshakeAckMessageSchema,
  DocUpdateMessageSchema,
  DocAckMessageSchema,
  PresenceMessageSchema,
  PresenceAckMessageSchema,
  CatchUpRequestMessageSchema,
  CatchUpResponseMessageSchema,
  ErrorMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
]);

export type SyncMessage = z.infer<typeof SyncMessageSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: z.ZodIssue[] };

/**
 * Validate an incoming sync message with detailed error reporting.
 */
export function validateSyncMessage(data: unknown): ValidationResult<SyncMessage> {
  const result = SyncMessageSchema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: `Invalid sync message: ${result.error.issues.map((i) => i.message).join(", ")}`,
    issues: result.error.issues,
  };
}

/**
 * Validate a specific message type.
 */
export function validateMessageType<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: `Validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`,
    issues: result.error.issues,
  };
}

/**
 * Format Zod validation errors for logging.
 */
export function formatValidationError(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}
