/**
 * Result Type Module
 *
 * Provides a type-safe Result pattern for error handling,
 * inspired by Rust's Result type. This enables explicit error
 * handling without exceptions.
 */

// ============================================================================
// Core Result Type
// ============================================================================

/** Successful result */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed result */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Result type - either Ok or Err */
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ============================================================================
// Constructors
// ============================================================================

/** Create a successful result */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed result */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ============================================================================
// Type Guards
// ============================================================================

/** Check if result is Ok */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/** Check if result is Err */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

// ============================================================================
// Combinators
// ============================================================================

/** Map over a successful result */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Map over a failed result */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chain results (flatMap) */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

/** Provide a default value for failed results */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/** Provide a computed default value for failed results */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return result.ok ? result.value : fn(result.error);
}

/** Unwrap or throw - use sparingly at boundaries */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}

// ============================================================================
// Async Helpers
// ============================================================================

/** Wrap a promise in a Result */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/** Execute a function and wrap in Result */
export function tryCatch<T, E = Error>(
  fn: () => T,
  errorMapper?: (error: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

/** Execute an async function and wrap in Result */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
}

// ============================================================================
// Collection Helpers
// ============================================================================

/** Collect an array of Results into a Result of array */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/** Partition results into successes and failures */
export function partition<T, E>(results: Result<T, E>[]): { ok: T[]; err: E[] } {
  const okValues: T[] = [];
  const errValues: E[] = [];

  for (const result of results) {
    if (result.ok) {
      okValues.push(result.value);
    } else {
      errValues.push(result.error);
    }
  }

  return { ok: okValues, err: errValues };
}
