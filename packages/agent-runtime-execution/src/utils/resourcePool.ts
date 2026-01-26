/**
 * Resource Pool
 *
 * Manages a pool of reusable resources (connections, workers, etc.)
 * to avoid creation overhead and limit resource usage.
 *
 * Features:
 * - Connection pooling
 * - Automatic cleanup
 * - Health checks
 * - Backpressure handling
 */

import { createSubsystemLogger } from "@ku0/agent-runtime-telemetry/logging";

const logger = createSubsystemLogger("agent", "resource-pool");

// ============================================================================
// Types
// ============================================================================

/** Resource factory */
export type ResourceFactory<T> = () => Promise<T>;

/** Resource health check */
export type HealthCheck<T> = (resource: T) => Promise<boolean>;

/** Resource cleanup */
export type ResourceCleanup<T> = (resource: T) => Promise<void>;

/** Pool configuration */
export interface PoolConfig<T> {
  /** Minimum pool size */
  minSize: number;
  /** Maximum pool size */
  maxSize: number;
  /** Resource factory */
  factory: ResourceFactory<T>;
  /** Health check function */
  healthCheck?: HealthCheck<T>;
  /** Cleanup function */
  cleanup?: ResourceCleanup<T>;
  /** Idle timeout in ms (default: 30000) */
  idleTimeoutMs: number;
  /** Health check interval in ms (default: 60000) */
  healthCheckIntervalMs: number;
  /** Acquire timeout in ms (default: 10000) */
  acquireTimeoutMs: number;
}

/** Pool statistics */
export interface PoolStats {
  /** Current pool size */
  size: number;
  /** Available resources */
  available: number;
  /** In-use resources */
  inUse: number;
  /** Total created */
  totalCreated: number;
  /** Total destroyed */
  totalDestroyed: number;
  /** Wait queue length */
  waitQueueLength: number;
}

/** Pooled resource wrapper */
interface PooledResource<T> {
  /** Resource */
  resource: T;
  /** Created timestamp */
  createdAt: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Is healthy */
  healthy: boolean;
  /** Is in use */
  inUse: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG = {
  minSize: 1,
  maxSize: 10,
  idleTimeoutMs: 30000,
  healthCheckIntervalMs: 60000,
  acquireTimeoutMs: 10000,
};

// ============================================================================
// Resource Pool Implementation
// ============================================================================

/**
 * Resource Pool
 *
 * Manages a pool of reusable resources.
 */
export class ResourcePool<T> {
  private readonly config: Required<PoolConfig<T>>;
  private readonly pool: PooledResource<T>[] = [];
  private readonly waitQueue: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = [];

  private stats: PoolStats = {
    size: 0,
    available: 0,
    inUse: 0,
    totalCreated: 0,
    totalDestroyed: 0,
    waitQueueLength: 0,
  };

  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(config: PoolConfig<T>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<PoolConfig<T>>;

    // Initialize minimum pool size
    this.initialize();

    // Start health checks
    if (this.config.healthCheck !== undefined && this.config.healthCheckIntervalMs > 0) {
      this.startHealthChecks();
    }

    // Start cleanup
    if (this.config.idleTimeoutMs > 0) {
      this.startCleanup();
    }
  }

  /**
   * Acquire a resource from the pool.
   */
  async acquire(): Promise<T> {
    // Try to get from pool
    const available = this.pool.find((r) => !r.inUse && r.healthy);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      this.updateStats();
      return available.resource;
    }

    // Create new if under max size
    if (this.pool.length < this.config.maxSize) {
      const resource = await this.createResource();
      const pooled: PooledResource<T> = {
        resource,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        healthy: true,
        inUse: true,
      };
      this.pool.push(pooled);
      this.updateStats();
      return resource;
    }

    // Wait for resource to become available
    return this.waitForResource();
  }

  /**
   * Release a resource back to the pool.
   */
  async release(resource: T): Promise<void> {
    const pooled = this.pool.find((r) => r.resource === resource);
    if (!pooled) {
      return;
    }

    pooled.inUse = false;
    pooled.lastUsed = Date.now();

    // Check health before returning to pool
    if (this.config.healthCheck) {
      try {
        pooled.healthy = await this.config.healthCheck(resource);
      } catch {
        pooled.healthy = false;
      }
    }

    // Remove if unhealthy
    if (!pooled.healthy) {
      await this.destroyResource(pooled);
    }

    this.updateStats();

    // Notify waiting requests
    this.notifyWaiters();
  }

  /**
   * Destroy a resource.
   */
  async destroy(resource: T): Promise<void> {
    const index = this.pool.findIndex((r) => r.resource === resource);
    if (index === -1) {
      return;
    }

    const pooled = this.pool[index];
    this.pool.splice(index, 1);
    await this.destroyResource(pooled);
    this.updateStats();
  }

  /**
   * Get pool statistics.
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Drain the pool (destroy all resources).
   */
  async drain(): Promise<void> {
    this.stopHealthChecks();
    this.stopCleanup();

    const destroyPromises = this.pool.map((p) => this.destroyResource(p));
    await Promise.all(destroyPromises);

    this.pool.length = 0;
    this.updateStats();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initialize(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.minSize; i++) {
      initPromises.push(
        this.createResource().then((resource) => {
          const pooled: PooledResource<T> = {
            resource,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            healthy: true,
            inUse: false,
          };
          this.pool.push(pooled);
        })
      );
    }

    await Promise.all(initPromises);
    this.updateStats();
  }

  private async createResource(): Promise<T> {
    this.stats.totalCreated++;
    return this.config.factory();
  }

  private async destroyResource(pooled: PooledResource<T>): Promise<void> {
    if (this.config.cleanup) {
      try {
        await this.config.cleanup(pooled.resource);
      } catch (error) {
        logger.error("Cleanup error", error as Error);
      }
    }
    this.stats.totalDestroyed++;
  }

  private async waitForResource(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitQueue.findIndex((w) => w.timeout === timeout);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
          this.updateStats();
        }
        reject(new Error("Resource acquisition timeout"));
      }, this.config.acquireTimeoutMs);

      this.waitQueue.push({ resolve, reject, timeout });
      this.updateStats();
    });
  }

  private notifyWaiters(): void {
    if (this.waitQueue.length === 0) {
      return;
    }

    const available = this.pool.find((r) => !r.inUse && r.healthy);
    if (!available) {
      return;
    }

    const waiter = this.waitQueue.shift();
    if (waiter) {
      clearTimeout(waiter.timeout);
      available.inUse = true;
      available.lastUsed = Date.now();
      this.updateStats();
      waiter.resolve(available.resource);
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const pooled of this.pool) {
        if (!pooled.inUse && this.config.healthCheck) {
          try {
            pooled.healthy = await this.config.healthCheck(pooled.resource);
          } catch {
            pooled.healthy = false;
          }
        }
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      const now = Date.now();
      const toRemove: PooledResource<T>[] = [];

      for (const pooled of this.pool) {
        if (
          !pooled.inUse &&
          now - pooled.lastUsed > this.config.idleTimeoutMs &&
          this.pool.length > this.config.minSize
        ) {
          toRemove.push(pooled);
        }
      }

      for (const pooled of toRemove) {
        const index = this.pool.indexOf(pooled);
        if (index !== -1) {
          this.pool.splice(index, 1);
          await this.destroyResource(pooled);
        }
      }

      this.updateStats();
    }, this.config.idleTimeoutMs);
  }

  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private updateStats(): void {
    this.stats.size = this.pool.length;
    this.stats.available = this.pool.filter((r) => !r.inUse && r.healthy).length;
    this.stats.inUse = this.pool.filter((r) => r.inUse).length;
    this.stats.waitQueueLength = this.waitQueue.length;
  }
}

/**
 * Create a resource pool.
 */
export function createResourcePool<T>(config: PoolConfig<T>): ResourcePool<T> {
  return new ResourcePool(config);
}
