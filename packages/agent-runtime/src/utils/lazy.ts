/**
 * Lazy Initialization Utilities
 *
 * Provides deferred initialization patterns for expensive components.
 * Useful for optional features that may not be used in every run.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A lazy value that is initialized on first access.
 */
export interface Lazy<T> {
  /** Get the value, initializing if needed */
  get(): T;
  /** Check if already initialized */
  isInitialized(): boolean;
  /** Force reinitialization on next access */
  reset(): void;
  /** Get value if initialized, undefined otherwise */
  peek(): T | undefined;
}

/**
 * An async lazy value.
 */
export interface AsyncLazy<T> {
  /** Get the value, initializing if needed */
  get(): Promise<T>;
  /** Check if already initialized */
  isInitialized(): boolean;
  /** Force reinitialization on next access */
  reset(): void;
  /** Get value if initialized, undefined otherwise */
  peek(): T | undefined;
}

/**
 * Lazy initialization options.
 */
export interface LazyOptions<T> {
  /** Optional error handler for initialization failures */
  onError?: (error: Error) => T | undefined;
  /** Optional callback when value is first initialized */
  onInit?: (value: T) => void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a lazy value that initializes on first access.
 *
 * @example
 * ```typescript
 * const expensiveService = lazy(() => new ExpensiveService());
 *
 * // Later, only when needed:
 * const service = expensiveService.get(); // Initializes here
 * ```
 */
export function lazy<T>(factory: () => T, options: LazyOptions<T> = {}): Lazy<T> {
  let value: T | undefined;
  let initialized = false;

  return {
    get(): T {
      if (!initialized) {
        try {
          value = factory();
          initialized = true;
          options.onInit?.(value);
        } catch (error) {
          const errorResult = options.onError?.(error as Error);
          if (errorResult !== undefined) {
            value = errorResult;
            initialized = true;
          } else {
            throw error;
          }
        }
      }
      return value as T;
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      value = undefined;
      initialized = false;
    },

    peek(): T | undefined {
      return initialized ? value : undefined;
    },
  };
}

/**
 * Create an async lazy value.
 *
 * @example
 * ```typescript
 * const dbConnection = asyncLazy(async () => await Database.connect());
 *
 * // Later:
 * const db = await dbConnection.get();
 * ```
 */
export function asyncLazy<T>(
  factory: () => Promise<T>,
  options: LazyOptions<T> = {}
): AsyncLazy<T> {
  let value: T | undefined;
  let initialized = false;
  let pending: Promise<T> | null = null;

  return {
    async get(): Promise<T> {
      if (initialized) {
        return value as T;
      }

      // Prevent concurrent initialization
      if (pending) {
        return pending;
      }

      pending = (async () => {
        try {
          value = await factory();
          initialized = true;
          options.onInit?.(value);
          return value;
        } catch (error) {
          const errorResult = options.onError?.(error as Error);
          if (errorResult !== undefined) {
            value = errorResult;
            initialized = true;
            return value;
          }
          throw error;
        } finally {
          pending = null;
        }
      })();

      return pending;
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      value = undefined;
      initialized = false;
      pending = null;
    },

    peek(): T | undefined {
      return initialized ? value : undefined;
    },
  };
}

/**
 * Create a lazy value that auto-disposes after idle timeout.
 * Useful for expensive resources that should be released when not used.
 */
export function lazyWithDisposal<T>(
  factory: () => T,
  dispose: (value: T) => void,
  idleTimeoutMs: number
): Lazy<T> & { dispose: () => void } {
  let value: T | undefined;
  let initialized = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resetTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      if (initialized && value !== undefined) {
        dispose(value);
        value = undefined;
        initialized = false;
      }
    }, idleTimeoutMs);
  };

  return {
    get(): T {
      if (!initialized) {
        value = factory();
        initialized = true;
      }
      resetTimer();
      return value as T;
    },

    isInitialized(): boolean {
      return initialized;
    },

    reset(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (initialized && value !== undefined) {
        dispose(value);
      }
      value = undefined;
      initialized = false;
    },

    peek(): T | undefined {
      return initialized ? value : undefined;
    },

    dispose(): void {
      this.reset();
    },
  };
}

/**
 * Memoize a function with lazy evaluation.
 * Results are cached based on serialized arguments.
 */
export function memoize<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyFn: (args: TArgs) => string = (args) => JSON.stringify(args)
): (...args: TArgs) => TResult {
  const cache = new Map<string, TResult>();

  return (...args: TArgs): TResult => {
    const key = keyFn(args);
    if (cache.has(key)) {
      return cache.get(key) as TResult;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
