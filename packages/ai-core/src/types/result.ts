/**
 * Result Type - Functional Error Handling
 *
 * Inspired by Rust's Result<T, E> and fp-ts Either.
 * Eliminates try-catch pollution and enables type-safe error handling.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Success result containing a value.
 */
export interface Ok<T> {
  readonly _tag: "Ok";
  readonly value: T;
}

/**
 * Failure result containing an error.
 */
export interface Err<E> {
  readonly _tag: "Err";
  readonly error: E;
}

/**
 * Result type - either success (Ok) or failure (Err).
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

// ============================================================================
// Constructors
// ============================================================================

/**
 * Create a success result.
 */
export function ok<T>(value: T): Ok<T> {
  return { _tag: "Ok", value };
}

/**
 * Create a failure result.
 */
export function err<E>(error: E): Err<E> {
  return { _tag: "Err", error };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if result is Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === "Ok";
}

/**
 * Check if result is Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === "Err";
}

// ============================================================================
// Transformations
// ============================================================================

/**
 * Map over success value.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

/**
 * Map over error value.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? err(fn(result.error)) : result;
}

/**
 * Chain results (flatMap).
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Alias for flatMap.
 */
export const chain = flatMap;

/**
 * Apply a function wrapped in Result.
 */
export function ap<T, U, E>(
  resultFn: Result<(value: T) => U, E>,
  result: Result<T, E>
): Result<U, E> {
  return flatMap(resultFn, (fn) => map(result, fn));
}

// ============================================================================
// Extraction
// ============================================================================

/**
 * Unwrap success value or throw error.
 */
export function unwrapResult<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap success value or return default.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Unwrap success value or compute default.
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  return isOk(result) ? result.value : fn(result.error);
}

/**
 * Get success value or undefined.
 */
export function toOption<T, E>(result: Result<T, E>): T | undefined {
  return isOk(result) ? result.value : undefined;
}

/**
 * Get error or undefined.
 */
export function toError<T, E>(result: Result<T, E>): E | undefined {
  return isErr(result) ? result.error : undefined;
}

// ============================================================================
// Combinators
// ============================================================================

/**
 * Fold/match on result.
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
}

/**
 * Combine multiple results into one.
 * Returns first error or all success values.
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Return first success or last error.
 */
export function any<T, E>(results: Result<T, E>[]): Result<T, E> {
  let lastError: Err<E> | undefined;
  for (const result of results) {
    if (isOk(result)) {
      return result;
    }
    lastError = result;
  }
  return lastError ?? err(new Error("No results") as E);
}

/**
 * Partition results into successes and failures.
 */
export function partition<T, E>(results: Result<T, E>[]): { ok: T[]; err: E[] } {
  const okValues: T[] = [];
  const errValues: E[] = [];
  for (const result of results) {
    if (isOk(result)) {
      okValues.push(result.value);
    } else {
      errValues.push(result.error);
    }
  }
  return { ok: okValues, err: errValues };
}

// ============================================================================
// Async Support
// ============================================================================

/**
 * Async result type.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Wrap a promise into Result.
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError?: (error: unknown) => E
): AsyncResult<T, E> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    const mapped = mapError
      ? mapError(error)
      : ((error instanceof Error ? error : new Error(String(error))) as E);
    return err(mapped);
  }
}

/**
 * Wrap a throwing function into Result.
 */
export function fromThrowable<T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    const mapped = mapError
      ? mapError(error)
      : ((error instanceof Error ? error : new Error(String(error))) as E);
    return err(mapped);
  }
}

/**
 * Wrap an async throwing function into Result.
 */
export async function fromAsyncThrowable<T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E
): AsyncResult<T, E> {
  return fromPromise(fn(), mapError);
}

/**
 * Map over async result.
 */
export async function mapAsync<T, U, E>(
  result: AsyncResult<T, E>,
  fn: (value: T) => U | Promise<U>
): AsyncResult<U, E> {
  const resolved = await result;
  if (isErr(resolved)) {
    return resolved;
  }
  return ok(await fn(resolved.value));
}

/**
 * Chain async results.
 */
export async function flatMapAsync<T, U, E>(
  result: AsyncResult<T, E>,
  fn: (value: T) => AsyncResult<U, E>
): AsyncResult<U, E> {
  const resolved = await result;
  if (isErr(resolved)) {
    return resolved;
  }
  return fn(resolved.value);
}

// ============================================================================
// Do Notation (Pipeline)
// ============================================================================

/**
 * Result pipeline builder for clean chaining.
 *
 * @example
 * ```ts
 * const result = resultDo<Error>()
 *   .bind('user', () => fetchUser(id))
 *   .bind('posts', ({ user }) => fetchPosts(user.id))
 *   .map(({ user, posts }) => ({ user, posts }))
 *   .run();
 * ```
 */
export function resultDo<E>(): ResultDo<Record<string, never>, E> {
  return new ResultDo<Record<string, never>, E>(ok({}));
}

class ResultDo<Acc extends Record<string, unknown>, E> {
  constructor(private readonly result: Result<Acc, E>) {}

  bind<K extends string, T>(
    key: K,
    fn: (acc: Acc) => Result<T, E>
  ): ResultDo<Acc & Record<K, T>, E> {
    if (isErr(this.result)) {
      return new ResultDo(this.result as Result<Acc & Record<K, T>, E>);
    }
    const nextResult = fn(this.result.value);
    if (isErr(nextResult)) {
      return new ResultDo(nextResult as Result<Acc & Record<K, T>, E>);
    }
    const newAcc = {
      ...this.result.value,
      [key]: nextResult.value,
    } as Acc & Record<K, T>;
    return new ResultDo(ok(newAcc));
  }

  map<T>(fn: (acc: Acc) => T): Result<T, E> {
    return map(this.result, fn);
  }

  run(): Result<Acc, E> {
    return this.result;
  }
}

// ============================================================================
// Async Do Notation
// ============================================================================

/**
 * Async result pipeline builder.
 */
export function asyncResultDo<E>(): AsyncResultDo<Record<string, never>, E> {
  return new AsyncResultDo<Record<string, never>, E>(Promise.resolve(ok({})));
}

class AsyncResultDo<Acc extends Record<string, unknown>, E> {
  constructor(private readonly result: AsyncResult<Acc, E>) {}

  bind<K extends string, T>(
    key: K,
    fn: (acc: Acc) => AsyncResult<T, E>
  ): AsyncResultDo<Acc & Record<K, T>, E> {
    const nextResult = this.result.then(async (res) => {
      if (isErr(res)) {
        return res as Result<Acc & Record<K, T>, E>;
      }
      const next = await fn(res.value);
      if (isErr(next)) {
        return next as Result<Acc & Record<K, T>, E>;
      }
      return ok({
        ...res.value,
        [key]: next.value,
      } as Acc & Record<K, T>);
    });
    return new AsyncResultDo(nextResult);
  }

  map<T>(fn: (acc: Acc) => T): AsyncResult<T, E> {
    return mapAsync(this.result, fn);
  }

  run(): AsyncResult<Acc, E> {
    return this.result;
  }
}
