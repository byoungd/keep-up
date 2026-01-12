/**
 * LFCC v0.9 RC - AI Module Primitives
 *
 * Linear-quality design primitives for type safety, immutability, and observability.
 * These patterns ensure compile-time correctness and runtime debugging support.
 */

// ============================================
// Branded ID Types
// ============================================

/**
 * Nominal branding for type-safe IDs.
 * Prevents accidental mixing of different ID types at compile time.
 *
 * @example
 * type BlockId = Brand<string, 'BlockId'>;
 * type PeerId = Brand<string, 'PeerId'>;
 *
 * const blockId: BlockId = 'block-1' as BlockId;
 * const peerId: PeerId = 'peer-1' as PeerId;
 *
 * // Type error: Type 'PeerId' is not assignable to type 'BlockId'
 * const wrong: BlockId = peerId;
 */
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

/** Block identifier - unique within a document */
export type BlockId = Brand<string, "BlockId">;

/** Peer identifier - unique across the collaboration network */
export type PeerId = Brand<string, "PeerId">;

/** Annotation identifier */
export type AnnotationId = Brand<string, "AnnotationId">;

/** Session identifier */
export type SessionId = Brand<string, "SessionId">;

/** Operation identifier */
export type OpId = Brand<string, "OpId">;

/** Snapshot identifier */
export type SnapshotId = Brand<string, "SnapshotId">;

/** Conflict identifier */
export type ConflictId = Brand<string, "ConflictId">;

/** Trace identifier for observability */
export type TraceId = Brand<string, "TraceId">;

// Type-safe ID constructors
export function blockId(id: string): BlockId {
  return id as BlockId;
}

export function peerId(id: string): PeerId {
  return id as PeerId;
}

export function annotationId(id: string): AnnotationId {
  return id as AnnotationId;
}

export function sessionId(id: string): SessionId {
  return id as SessionId;
}

export function opId(id: string): OpId {
  return id as OpId;
}

export function snapshotId(id: string): SnapshotId {
  return id as SnapshotId;
}

export function conflictId(id: string): ConflictId {
  return id as ConflictId;
}

export function traceId(): TraceId {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as TraceId;
}

// ============================================
// Result Type (Railway-Oriented Programming)
// ============================================

/**
 * Discriminated union for operation results.
 * Enables explicit error handling without exceptions.
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Create a success result */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Create an error result */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Check if result is success */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Check if result is error */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Unwrap a result or throw */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

/** Unwrap a result with a default value */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/** Map over a success value */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result;
}

/** Chain results (flatMap) */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

// ============================================
// Option Type
// ============================================

/**
 * Explicit optional value type.
 * More explicit than nullable types.
 */
export type Option<T> = { readonly some: true; readonly value: T } | { readonly some: false };

export function Some<T>(value: T): Option<T> {
  return { some: true, value };
}

export const None: Option<never> = { some: false };

export function isSome<T>(option: Option<T>): option is { some: true; value: T } {
  return option.some;
}

export function isNone<T>(option: Option<T>): option is { some: false } {
  return !option.some;
}

export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value != null ? Some(value) : None;
}

export function toNullable<T>(option: Option<T>): T | null {
  return option.some ? option.value : null;
}

// ============================================
// Immutable Utilities
// ============================================

/** Deep readonly type */
export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<K, DeepReadonly<V>>
    : T extends Set<infer U>
      ? ReadonlySet<DeepReadonly<U>>
      : T extends object
        ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
        : T;

/** Freeze an object deeply */
export function deepFreeze<T extends object>(obj: T): DeepReadonly<T> {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  }
  return obj as DeepReadonly<T>;
}

// ============================================
// Observability Types
// ============================================

/** Timing metric for operations */
export type TimingMetric = {
  readonly traceId: TraceId;
  readonly operation: string;
  readonly startMs: number;
  readonly durationMs: number;
  readonly success: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** Observer callback for timing metrics */
export type TimingObserver = (metric: TimingMetric) => void;

/** Global timing observers */
const timingObservers: TimingObserver[] = [];

/** Register a timing observer */
export function addTimingObserver(observer: TimingObserver): () => void {
  timingObservers.push(observer);
  return () => {
    const index = timingObservers.indexOf(observer);
    if (index >= 0) {
      timingObservers.splice(index, 1);
    }
  };
}

/** Report a timing metric */
export function reportTiming(metric: TimingMetric): void {
  for (const observer of timingObservers) {
    try {
      observer(metric);
    } catch {
      // Silently ignore observer errors
    }
  }
}

/** Measure execution time of an operation */
export function withTiming<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  const trace = traceId();
  const startMs = performance.now();
  let success = true;

  try {
    return fn();
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const durationMs = performance.now() - startMs;
    reportTiming({
      traceId: trace,
      operation,
      startMs,
      durationMs,
      success,
      metadata,
    });
  }
}

/** Measure execution time of an async operation */
export async function withTimingAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const trace = traceId();
  const startMs = performance.now();
  let success = true;

  try {
    return await fn();
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const durationMs = performance.now() - startMs;
    reportTiming({
      traceId: trace,
      operation,
      startMs,
      durationMs,
      success,
      metadata,
    });
  }
}

// ============================================
// Validation Errors
// ============================================

/** Structured validation error */
export type ValidationError = {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

/** Create a validation error */
export function validationError(
  code: string,
  message: string,
  options?: { path?: string; details?: Record<string, unknown> }
): ValidationError {
  return {
    code,
    message,
    path: options?.path,
    details: options?.details ? Object.freeze(options.details) : undefined,
  };
}

// ============================================
// Constants
// ============================================

/** Confidence thresholds for annotation migration */
export const CONFIDENCE_THRESHOLDS = {
  /** High confidence - exact match */
  HIGH: 0.9,
  /** Medium confidence - acceptable for automatic migration */
  MEDIUM: 0.7,
  /** Low confidence - requires user confirmation */
  LOW: 0.5,
} as const;

/** Timing constants in milliseconds */
export const TIMING = {
  /** Debounce delay for indexing */
  INDEX_DEBOUNCE_MS: 100,
  /** Cache TTL for query results */
  QUERY_CACHE_TTL_MS: 5000,
  /** Timeout for streaming operations */
  STREAM_TIMEOUT_MS: 30000,
  /** Conflict detection window */
  CONFLICT_WINDOW_MS: 1000,
} as const;

/** Limits for safety */
export const LIMITS = {
  /** Maximum operations in a single liquid refactoring */
  MAX_LIQUID_OPS: 1000,
  /** Maximum history entries to index */
  MAX_HISTORY_ENTRIES: 10000,
  /** Maximum query results */
  MAX_QUERY_RESULTS: 100,
  /** Maximum snapshots in shadow view */
  MAX_SHADOW_SNAPSHOTS: 50,
} as const;
