/**
 * Lazy Loading
 *
 * Deferred initialization patterns for expensive resources.
 * Implements:
 * - Lazy singleton with thread-safe initialization
 * - Lazy factory with caching
 * - Resource pooling
 */

/** Lazy initialization state */
type LazyState<T> =
  | { status: "uninitialized" }
  | { status: "initializing"; promise: Promise<T> }
  | { status: "initialized"; value: T }
  | { status: "failed"; error: Error };

/**
 * Lazy singleton - defers initialization until first access.
 */
export class Lazy<T> {
  private state: LazyState<T> = { status: "uninitialized" };
  private readonly factory: () => Promise<T>;

  constructor(factory: () => Promise<T>) {
    this.factory = factory;
  }

  /**
   * Get the value, initializing if needed.
   */
  async get(): Promise<T> {
    switch (this.state.status) {
      case "initialized":
        return this.state.value;

      case "failed":
        throw this.state.error;

      case "initializing":
        return this.state.promise;

      case "uninitialized": {
        const promise = this.initialize();
        this.state = { status: "initializing", promise };
        return promise;
      }
    }
  }

  /**
   * Check if initialized without triggering initialization.
   */
  get isInitialized(): boolean {
    return this.state.status === "initialized";
  }

  /**
   * Check if failed.
   */
  get isFailed(): boolean {
    return this.state.status === "failed";
  }

  /**
   * Get value if already initialized, undefined otherwise.
   */
  getIfReady(): T | undefined {
    return this.state.status === "initialized" ? this.state.value : undefined;
  }

  /**
   * Reset to uninitialized state.
   */
  reset(): void {
    this.state = { status: "uninitialized" };
  }

  /**
   * Initialize the value.
   */
  private async initialize(): Promise<T> {
    try {
      const value = await this.factory();
      this.state = { status: "initialized", value };
      return value;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.state = { status: "failed", error: err };
      throw err;
    }
  }
}

/**
 * Synchronous lazy value.
 */
export class LazySync<T> {
  private initialized = false;
  private value: T | undefined;
  private readonly factory: () => T;

  constructor(factory: () => T) {
    this.factory = factory;
  }

  /**
   * Get the value, initializing if needed.
   */
  get(): T {
    if (!this.initialized) {
      this.value = this.factory();
      this.initialized = true;
    }
    return this.value as T;
  }

  /**
   * Check if initialized.
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset to uninitialized state.
   */
  reset(): void {
    this.initialized = false;
    this.value = undefined;
  }
}

/**
 * Lazy factory - creates instances on demand with caching.
 */
export class LazyFactory<K, V> {
  private readonly cache = new Map<K, Lazy<V>>();
  private readonly factory: (key: K) => Promise<V>;

  constructor(factory: (key: K) => Promise<V>) {
    this.factory = factory;
  }

  /**
   * Get or create an instance.
   */
  async get(key: K): Promise<V> {
    let lazy = this.cache.get(key);

    if (!lazy) {
      lazy = new Lazy(() => this.factory(key));
      this.cache.set(key, lazy);
    }

    return lazy.get();
  }

  /**
   * Check if a key has an initialized instance.
   */
  has(key: K): boolean {
    const lazy = this.cache.get(key);
    return lazy?.isInitialized ?? false;
  }

  /**
   * Remove an instance.
   */
  remove(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all instances.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get all initialized keys.
   */
  keys(): K[] {
    return Array.from(this.cache.entries())
      .filter(([_, lazy]) => lazy.isInitialized)
      .map(([key]) => key);
  }
}

/**
 * Resource Pool - manages a pool of reusable resources.
 */
export class ResourcePool<T> {
  private readonly available: T[] = [];
  private readonly inUse = new Set<T>();
  private readonly waiting: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
  }> = [];

  private readonly factory: () => Promise<T>;
  private readonly destroyer?: (resource: T) => Promise<void>;
  private readonly maxSize: number;
  private readonly acquireTimeoutMs: number;

  private totalCreated = 0;

  constructor(options: {
    factory: () => Promise<T>;
    destroyer?: (resource: T) => Promise<void>;
    maxSize?: number;
    acquireTimeoutMs?: number;
  }) {
    this.factory = options.factory;
    this.destroyer = options.destroyer;
    this.maxSize = options.maxSize ?? 10;
    this.acquireTimeoutMs = options.acquireTimeoutMs ?? 30000;
  }

  /**
   * Acquire a resource from the pool.
   */
  async acquire(): Promise<T> {
    // Try to get an available resource
    const resource = this.available.pop();
    if (resource) {
      this.inUse.add(resource);
      return resource;
    }

    // Create new if under limit
    if (this.totalCreated < this.maxSize) {
      const newResource = await this.factory();
      this.totalCreated++;
      this.inUse.add(newResource);
      return newResource;
    }

    // Wait for a resource to become available
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiting.findIndex((w) => w.resolve === resolve);
        if (index >= 0) {
          this.waiting.splice(index, 1);
        }
        reject(new Error("Resource acquisition timeout"));
      }, this.acquireTimeoutMs);

      this.waiting.push({
        resolve: (resource: T) => {
          clearTimeout(timeout);
          this.inUse.add(resource);
          resolve(resource);
        },
        reject,
      });
    });
  }

  /**
   * Release a resource back to the pool.
   */
  release(resource: T): void {
    if (!this.inUse.has(resource)) {
      return;
    }

    this.inUse.delete(resource);

    // Give to waiting request
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter.resolve(resource);
      return;
    }

    // Return to pool
    this.available.push(resource);
  }

  /**
   * Use a resource with automatic release.
   */
  async use<R>(fn: (resource: T) => Promise<R>): Promise<R> {
    const resource = await this.acquire();
    try {
      return await fn(resource);
    } finally {
      this.release(resource);
    }
  }

  /**
   * Drain the pool, destroying all resources.
   */
  async drain(): Promise<void> {
    // Reject all waiting
    for (const waiter of this.waiting) {
      waiter.reject(new Error("Pool drained"));
    }
    this.waiting.length = 0;

    // Destroy all resources
    const toDestroy = [...this.available, ...this.inUse];
    this.available.length = 0;
    this.inUse.clear();
    this.totalCreated = 0;

    if (this.destroyer) {
      await Promise.all(toDestroy.map((r) => this.destroyer?.(r)));
    }
  }

  /**
   * Get pool statistics.
   */
  getStats(): {
    available: number;
    inUse: number;
    waiting: number;
    totalCreated: number;
    maxSize: number;
  } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waiting.length,
      totalCreated: this.totalCreated,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Create a lazy singleton.
 */
export function lazy<T>(factory: () => Promise<T>): Lazy<T> {
  return new Lazy(factory);
}

/**
 * Create a synchronous lazy value.
 */
export function lazySync<T>(factory: () => T): LazySync<T> {
  return new LazySync(factory);
}

/**
 * Create a lazy factory.
 */
export function lazyFactory<K, V>(factory: (key: K) => Promise<V>): LazyFactory<K, V> {
  return new LazyFactory(factory);
}
