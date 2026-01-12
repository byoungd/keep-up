/**
 * Health Aggregation - System Health Monitoring
 *
 * Aggregates health from multiple providers/services for unified health checks.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Health status levels.
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

/**
 * Individual component health.
 */
export interface ComponentHealth {
  /** Component name */
  name: string;
  /** Health status */
  status: HealthStatus;
  /** Response time in ms (if applicable) */
  latencyMs?: number;
  /** Last check timestamp */
  lastCheckedAt: number;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Aggregated system health.
 */
export interface SystemHealth {
  /** Overall status (worst of all components) */
  status: HealthStatus;
  /** Timestamp of health check */
  timestamp: number;
  /** Individual component health */
  components: ComponentHealth[];
  /** Summary statistics */
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
}

/**
 * Health check function type.
 */
export type HealthCheck = () => Promise<ComponentHealth>;

/**
 * Health aggregator configuration.
 */
export interface HealthAggregatorConfig {
  /** Check timeout in ms (default: 5000) */
  timeoutMs: number;
  /** Cache duration in ms (default: 10000) */
  cacheDurationMs: number;
  /** Run checks in parallel (default: true) */
  parallel: boolean;
}

// ============================================================================
// Health Aggregator
// ============================================================================

/**
 * Aggregates health checks from multiple components.
 */
export class HealthAggregator {
  private readonly checks = new Map<string, HealthCheck>();
  private readonly config: HealthAggregatorConfig;
  private cachedHealth: SystemHealth | null = null;
  private cacheTimestamp = 0;

  constructor(config: Partial<HealthAggregatorConfig> = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 5000,
      cacheDurationMs: config.cacheDurationMs ?? 10000,
      parallel: config.parallel ?? true,
    };
  }

  /**
   * Register a health check.
   */
  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  /**
   * Unregister a health check.
   */
  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Get aggregated health status.
   */
  async getHealth(options?: { skipCache?: boolean }): Promise<SystemHealth> {
    // Check cache
    const now = Date.now();
    if (
      !options?.skipCache &&
      this.cachedHealth &&
      now - this.cacheTimestamp < this.config.cacheDurationMs
    ) {
      return this.cachedHealth;
    }

    // Run health checks
    const components = this.config.parallel
      ? await this.runParallelChecks()
      : await this.runSequentialChecks();

    // Calculate summary
    const summary = {
      total: components.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    };

    for (const component of components) {
      summary[component.status]++;
    }

    // Determine overall status
    let status: HealthStatus = "healthy";
    if (summary.unhealthy > 0) {
      status = "unhealthy";
    } else if (summary.degraded > 0) {
      status = "degraded";
    } else if (summary.unknown > 0 && summary.healthy === 0) {
      status = "unknown";
    }

    const health: SystemHealth = {
      status,
      timestamp: now,
      components,
      summary,
    };

    // Cache result
    this.cachedHealth = health;
    this.cacheTimestamp = now;

    return health;
  }

  /**
   * Check if system is healthy.
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status === "healthy";
  }

  /**
   * Clear the health cache.
   */
  clearCache(): void {
    this.cachedHealth = null;
    this.cacheTimestamp = 0;
  }

  private async runParallelChecks(): Promise<ComponentHealth[]> {
    const entries = Array.from(this.checks.entries());
    const results = await Promise.all(entries.map(([name, check]) => this.runCheck(name, check)));
    return results;
  }

  private async runSequentialChecks(): Promise<ComponentHealth[]> {
    const results: ComponentHealth[] = [];
    for (const [name, check] of this.checks) {
      results.push(await this.runCheck(name, check));
    }
    return results;
  }

  private async runCheck(name: string, check: HealthCheck): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Race against timeout
      const result = await Promise.race([check(), this.timeout(name)]);
      return result;
    } catch (error) {
      return {
        name,
        status: "unhealthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private timeout(name: string): Promise<ComponentHealth> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout for ${name}`));
      }, this.config.timeoutMs);
    });
  }
}

// ============================================================================
// Health Check Builders
// ============================================================================

/**
 * Create a simple ping health check.
 */
export function createPingCheck(name: string, pingFn: () => Promise<void>): HealthCheck {
  return async () => {
    const startTime = Date.now();
    try {
      await pingFn();
      return {
        name,
        status: "healthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
      };
    } catch (error) {
      return {
        name,
        status: "unhealthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Create a latency-based health check.
 * Returns degraded if latency exceeds threshold.
 */
export function createLatencyCheck(
  name: string,
  pingFn: () => Promise<void>,
  options: { degradedThresholdMs: number; unhealthyThresholdMs: number }
): HealthCheck {
  return async () => {
    const startTime = Date.now();
    try {
      await pingFn();
      const latencyMs = Date.now() - startTime;

      let status: HealthStatus = "healthy";
      if (latencyMs >= options.unhealthyThresholdMs) {
        status = "unhealthy";
      } else if (latencyMs >= options.degradedThresholdMs) {
        status = "degraded";
      }

      return {
        name,
        status,
        latencyMs,
        lastCheckedAt: Date.now(),
        details: {
          degradedThreshold: options.degradedThresholdMs,
          unhealthyThreshold: options.unhealthyThresholdMs,
        },
      };
    } catch (error) {
      return {
        name,
        status: "unhealthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Create a health check from a provider's healthCheck method.
 */
export function createProviderHealthCheck(
  name: string,
  provider: { healthCheck(): Promise<boolean> }
): HealthCheck {
  return async () => {
    const startTime = Date.now();
    try {
      const isHealthy = await provider.healthCheck();
      return {
        name,
        status: isHealthy ? "healthy" : "unhealthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
      };
    } catch (error) {
      return {
        name,
        status: "unhealthy",
        latencyMs: Date.now() - startTime,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a health aggregator with defaults.
 */
export function createHealthAggregator(config?: Partial<HealthAggregatorConfig>): HealthAggregator {
  return new HealthAggregator(config);
}

// ============================================================================
// HTTP Health Endpoint Helper
// ============================================================================

/**
 * Format health for HTTP response.
 */
export function formatHealthResponse(health: SystemHealth): {
  status: number;
  body: SystemHealth;
} {
  const statusCodes: Record<HealthStatus, number> = {
    healthy: 200,
    degraded: 200,
    unhealthy: 503,
    unknown: 503,
  };

  return {
    status: statusCodes[health.status],
    body: health,
  };
}
