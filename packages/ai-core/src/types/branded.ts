/**
 * Branded Types
 *
 * Nominal typing for type-safe identifiers and validated values.
 * Prevents accidental mixing of structurally identical but semantically different types.
 */

/** Brand symbol for nominal typing */
declare const __brand: unique symbol;

/** Branded type utility */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================================================
// ID Types - Prevent mixing up different identifier types
// ============================================================================

/** User ID - identifies a user in the system */
export type UserId = Brand<string, "UserId">;

/** Document ID - identifies a document */
export type DocId = Brand<string, "DocId">;

/** Chunk ID - identifies a document chunk */
export type ChunkId = Brand<string, "ChunkId">;

/** Trace ID - identifies a distributed trace */
export type TraceId = Brand<string, "TraceId">;

/** Span ID - identifies a span within a trace */
export type SpanId = Brand<string, "SpanId">;

/** Provider ID - identifies an AI provider */
export type ProviderId = Brand<string, "ProviderId">;

/** Request ID - identifies an API request */
export type RequestId = Brand<string, "RequestId">;

// ============================================================================
// Validated Value Types - Ensure values meet constraints
// ============================================================================

/** Non-empty string */
export type NonEmptyString = Brand<string, "NonEmptyString">;

/** Positive integer */
export type PositiveInt = Brand<number, "PositiveInt">;

/** Unit interval [0, 1] */
export type UnitInterval = Brand<number, "UnitInterval">;

/** Token count (non-negative integer) */
export type TokenCount = Brand<number, "TokenCount">;

/** Similarity score [0, 1] */
export type SimilarityScore = Brand<number, "SimilarityScore">;

/** UTF-16 offset (non-negative integer) */
export type UTF16Offset = Brand<number, "UTF16Offset">;

/** Timestamp in milliseconds */
export type Timestamp = Brand<number, "Timestamp">;

// ============================================================================
// Constructors - Create branded types with validation
// ============================================================================

/** Validation error for branded types */
export class BrandValidationError extends Error {
  constructor(
    public readonly typeName: string,
    public readonly value: unknown,
    public readonly constraint: string
  ) {
    super(`Invalid ${typeName}: ${JSON.stringify(value)} - ${constraint}`);
    this.name = "BrandValidationError";
  }
}

/** Result type for validation */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BrandValidationError };

/**
 * Create a UserId from a string.
 */
export function userId(value: string): UserId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("UserId", value, "must be non-empty");
  }
  return value as UserId;
}

/**
 * Create a DocId from a string.
 */
export function docId(value: string): DocId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("DocId", value, "must be non-empty");
  }
  return value as DocId;
}

/**
 * Create a ChunkId from a string.
 */
export function chunkId(value: string): ChunkId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("ChunkId", value, "must be non-empty");
  }
  return value as ChunkId;
}

/**
 * Create a TraceId from a string.
 */
export function traceId(value: string): TraceId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("TraceId", value, "must be non-empty");
  }
  return value as TraceId;
}

/**
 * Create a SpanId from a string.
 */
export function spanId(value: string): SpanId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("SpanId", value, "must be non-empty");
  }
  return value as SpanId;
}

/**
 * Create a ProviderId from a string.
 */
export function providerId(value: string): ProviderId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("ProviderId", value, "must be non-empty");
  }
  return value as ProviderId;
}

/**
 * Create a RequestId from a string.
 */
export function requestId(value: string): RequestId {
  if (!value || value.trim().length === 0) {
    throw new BrandValidationError("RequestId", value, "must be non-empty");
  }
  return value as RequestId;
}

/**
 * Create a NonEmptyString.
 */
export function nonEmptyString(value: string): NonEmptyString {
  if (!value || value.length === 0) {
    throw new BrandValidationError("NonEmptyString", value, "must be non-empty");
  }
  return value as NonEmptyString;
}

/**
 * Create a PositiveInt.
 */
export function positiveInt(value: number): PositiveInt {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BrandValidationError("PositiveInt", value, "must be a positive integer");
  }
  return value as PositiveInt;
}

/**
 * Create a UnitInterval [0, 1].
 */
export function unitInterval(value: number): UnitInterval {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new BrandValidationError("UnitInterval", value, "must be in range [0, 1]");
  }
  return value as UnitInterval;
}

/**
 * Create a TokenCount.
 */
export function tokenCount(value: number): TokenCount {
  if (!Number.isInteger(value) || value < 0) {
    throw new BrandValidationError("TokenCount", value, "must be a non-negative integer");
  }
  return value as TokenCount;
}

/**
 * Create a SimilarityScore [0, 1].
 */
export function similarityScore(value: number): SimilarityScore {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new BrandValidationError("SimilarityScore", value, "must be in range [0, 1]");
  }
  return value as SimilarityScore;
}

/**
 * Create a UTF16Offset.
 */
export function utf16Offset(value: number): UTF16Offset {
  if (!Number.isInteger(value) || value < 0) {
    throw new BrandValidationError("UTF16Offset", value, "must be a non-negative integer");
  }
  return value as UTF16Offset;
}

/**
 * Create a Timestamp.
 */
export function timestamp(value: number): Timestamp {
  if (!Number.isInteger(value) || value < 0) {
    throw new BrandValidationError("Timestamp", value, "must be a non-negative integer");
  }
  return value as Timestamp;
}

// ============================================================================
// Safe Constructors - Return ValidationResult instead of throwing
// ============================================================================

/**
 * Safely create a branded type, returning a result instead of throwing.
 */
export function safeUserId(value: string): ValidationResult<UserId> {
  try {
    return { ok: true, value: userId(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

export function safeDocId(value: string): ValidationResult<DocId> {
  try {
    return { ok: true, value: docId(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

export function safeChunkId(value: string): ValidationResult<ChunkId> {
  try {
    return { ok: true, value: chunkId(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

export function safePositiveInt(value: number): ValidationResult<PositiveInt> {
  try {
    return { ok: true, value: positiveInt(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

export function safeUnitInterval(value: number): ValidationResult<UnitInterval> {
  try {
    return { ok: true, value: unitInterval(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

export function safeSimilarityScore(value: number): ValidationResult<SimilarityScore> {
  try {
    return { ok: true, value: similarityScore(value) };
  } catch (error) {
    return { ok: false, error: error as BrandValidationError };
  }
}

// ============================================================================
// Type Guards - Check if a value is of a branded type
// ============================================================================

/**
 * Check if a string could be a valid UserId.
 */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Check if a number could be a valid PositiveInt.
 */
export function isValidPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Check if a number could be a valid UnitInterval.
 */
export function isValidUnitInterval(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 1;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a random ID with a prefix.
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a new DocId.
 */
export function generateDocId(): DocId {
  return docId(generateId("doc"));
}

/**
 * Generate a new ChunkId.
 */
export function generateChunkId(): ChunkId {
  return chunkId(generateId("chunk"));
}

/**
 * Generate a new TraceId.
 */
export function generateTraceId(): TraceId {
  return traceId(generateId("trace"));
}

/**
 * Generate a new RequestId.
 */
export function generateRequestId(): RequestId {
  return requestId(generateId("req"));
}

/**
 * Extract the raw value from a branded type.
 * Use sparingly - prefer keeping values branded.
 */
export function unwrap<T>(branded: T): T extends Brand<infer U, string> ? U : T {
  return branded as T extends Brand<infer U, string> ? U : T;
}
