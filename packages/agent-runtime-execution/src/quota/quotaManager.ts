/**
 * Resource Quota Management
 *
 * Provides resource tracking and enforcement for agent executions.
 * Manages token budgets, time limits, and concurrent execution limits.
 */

// ============================================================================
// Types
// ============================================================================

/** Resource types that can be tracked */
export type ResourceType =
  | "tokens_input"
  | "tokens_output"
  | "tokens_total"
  | "api_calls"
  | "tool_calls"
  | "execution_time_ms"
  | "concurrent_agents"
  | "storage_bytes";

/** Quota limit definition */
export interface QuotaLimit {
  /** Maximum value allowed */
  max: number;

  /** Time window in milliseconds (0 = no window, cumulative) */
  windowMs: number;

  /** Action when exceeded */
  action: "block" | "warn" | "throttle";

  /** Cooldown period after exceeding (ms) */
  cooldownMs?: number;
}

/** Quota configuration for a scope */
export interface QuotaConfig {
  /** Per-resource limits */
  limits: Partial<Record<ResourceType, QuotaLimit>>;

  /** Inherit from parent scope */
  inherit?: boolean;

  /** Priority (higher = checked first) */
  priority?: number;
}

/** Quota scope types */
export type QuotaScopeType = "global" | "user" | "agent" | "session";

/** Quota scope identifier */
export interface QuotaScope {
  type: QuotaScopeType;
  id: string;
}

/** Resource usage record */
export interface ResourceUsage {
  /** Resource type */
  type: ResourceType;

  /** Amount used */
  amount: number;

  /** Timestamp */
  timestamp: number;

  /** Associated scope */
  scope: QuotaScope;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/** Quota check result */
export interface QuotaCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;

  /** Resource type that caused denial (if any) */
  deniedBy?: ResourceType;

  /** Current usage */
  currentUsage: number;

  /** Limit that was exceeded */
  limit?: number;

  /** Time until quota resets (ms) */
  resetInMs?: number;

  /** Suggested wait time for throttling */
  retryAfterMs?: number;

  /** Warning message (for "warn" action) */
  warning?: string;
}

/** Quota usage summary */
export interface QuotaUsageSummary {
  scope: QuotaScope;
  resources: {
    type: ResourceType;
    used: number;
    limit: number;
    percentage: number;
    windowMs: number;
  }[];
  warnings: string[];
}

/** Quota manager configuration */
export interface QuotaManagerConfig {
  /** Default quota config for each scope type */
  defaults?: Partial<Record<QuotaScopeType, QuotaConfig>>;

  /** Cleanup interval for expired records (ms) */
  cleanupIntervalMs?: number;

  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Resource Tracker
// ============================================================================

/**
 * Tracks resource usage with time-windowed storage.
 */
class ResourceTracker {
  private readonly usageRecords: ResourceUsage[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords = 10000) {
    this.maxRecords = maxRecords;
  }

  /**
   * Record resource usage.
   */
  record(usage: ResourceUsage): void {
    this.usageRecords.push(usage);

    // Prune if over limit
    if (this.usageRecords.length > this.maxRecords) {
      this.usageRecords.splice(0, this.usageRecords.length - this.maxRecords);
    }
  }

  /**
   * Get usage sum for a scope within a time window.
   */
  getUsage(scope: QuotaScope, resourceType: ResourceType, windowMs: number): number {
    const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;

    let total = 0;
    for (const record of this.usageRecords) {
      if (
        record.scope.type === scope.type &&
        record.scope.id === scope.id &&
        record.type === resourceType &&
        record.timestamp >= cutoff
      ) {
        total += record.amount;
      }
    }

    return total;
  }

  /**
   * Get oldest record timestamp for a scope/resource.
   */
  getOldestTimestamp(
    scope: QuotaScope,
    resourceType: ResourceType,
    windowMs: number
  ): number | null {
    const cutoff = windowMs > 0 ? Date.now() - windowMs : 0;

    for (const record of this.usageRecords) {
      if (
        record.scope.type === scope.type &&
        record.scope.id === scope.id &&
        record.type === resourceType &&
        record.timestamp >= cutoff
      ) {
        return record.timestamp;
      }
    }

    return null;
  }

  /**
   * Get all usage for a scope.
   */
  getAllUsage(scope: QuotaScope): Map<ResourceType, number> {
    const usage = new Map<ResourceType, number>();

    for (const record of this.usageRecords) {
      if (record.scope.type === scope.type && record.scope.id === scope.id) {
        const current = usage.get(record.type) ?? 0;
        usage.set(record.type, current + record.amount);
      }
    }

    return usage;
  }

  /**
   * Prune records older than specified time.
   */
  prune(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const initialLength = this.usageRecords.length;

    let writeIndex = 0;
    for (let i = 0; i < this.usageRecords.length; i++) {
      if (this.usageRecords[i].timestamp >= cutoff) {
        this.usageRecords[writeIndex++] = this.usageRecords[i];
      }
    }
    this.usageRecords.length = writeIndex;

    return initialLength - writeIndex;
  }

  /**
   * Clear all records for a scope.
   */
  clearScope(scope: QuotaScope): number {
    const initialLength = this.usageRecords.length;

    let writeIndex = 0;
    for (let i = 0; i < this.usageRecords.length; i++) {
      if (
        this.usageRecords[i].scope.type !== scope.type ||
        this.usageRecords[i].scope.id !== scope.id
      ) {
        this.usageRecords[writeIndex++] = this.usageRecords[i];
      }
    }
    this.usageRecords.length = writeIndex;

    return initialLength - writeIndex;
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.usageRecords.length = 0;
  }

  /**
   * Get record count.
   */
  get size(): number {
    return this.usageRecords.length;
  }
}

// ============================================================================
// Quota Manager
// ============================================================================

/**
 * Manages resource quotas and usage tracking.
 */
export class QuotaManager {
  private readonly tracker: ResourceTracker;
  private readonly scopeConfigs = new Map<string, QuotaConfig>();
  private readonly defaults: Partial<Record<QuotaScopeType, QuotaConfig>>;
  private readonly debug: boolean;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  /** Cooldown tracking: scope key -> resource -> cooldown end time */
  private readonly cooldowns = new Map<string, Map<ResourceType, number>>();

  constructor(config: QuotaManagerConfig = {}) {
    this.tracker = new ResourceTracker();
    this.defaults = config.defaults ?? {};
    this.debug = config.debug ?? false;

    // Start cleanup timer
    const cleanupIntervalMs = config.cleanupIntervalMs ?? 60000;
    if (cleanupIntervalMs > 0) {
      this.startCleanup(cleanupIntervalMs);
    }
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set quota config for a specific scope.
   */
  setQuota(scope: QuotaScope, config: QuotaConfig): void {
    const key = this.scopeKey(scope);
    this.scopeConfigs.set(key, config);

    if (this.debug) {
      // Debug hook: config updated
    }
  }

  /**
   * Get quota config for a scope.
   */
  getQuota(scope: QuotaScope): QuotaConfig | undefined {
    const key = this.scopeKey(scope);
    return this.scopeConfigs.get(key) ?? this.defaults[scope.type];
  }

  /**
   * Remove quota config for a scope.
   */
  removeQuota(scope: QuotaScope): boolean {
    const key = this.scopeKey(scope);
    return this.scopeConfigs.delete(key);
  }

  // ==========================================================================
  // Usage Tracking
  // ==========================================================================

  /**
   * Record resource usage.
   */
  record(
    scope: QuotaScope,
    resourceType: ResourceType,
    amount: number,
    metadata?: Record<string, unknown>
  ): void {
    this.tracker.record({
      type: resourceType,
      amount,
      timestamp: Date.now(),
      scope,
      metadata,
    });

    if (this.debug) {
      // Debug hook: scopes registered
    }
  }

  /**
   * Check if an operation would exceed quota.
   */
  check(scope: QuotaScope, resourceType: ResourceType, requestedAmount = 1): QuotaCheckResult {
    const config = this.getQuota(scope);

    // No config = allowed
    if (!config) {
      return { allowed: true, currentUsage: 0 };
    }

    const limit = config.limits[resourceType];
    if (!limit) {
      return { allowed: true, currentUsage: 0 };
    }

    // Check cooldown
    const cooldownEnd = this.getCooldownEnd(scope, resourceType);
    if (cooldownEnd && Date.now() < cooldownEnd) {
      return {
        allowed: false,
        deniedBy: resourceType,
        currentUsage: limit.max,
        limit: limit.max,
        retryAfterMs: cooldownEnd - Date.now(),
      };
    }

    // Get current usage
    const currentUsage = this.tracker.getUsage(scope, resourceType, limit.windowMs);
    const wouldExceed = currentUsage + requestedAmount > limit.max;

    if (!wouldExceed) {
      return { allowed: true, currentUsage };
    }

    // Calculate reset time
    const oldest = this.tracker.getOldestTimestamp(scope, resourceType, limit.windowMs);
    const resetInMs = oldest ? oldest + limit.windowMs - Date.now() : limit.windowMs;

    // Handle by action type
    switch (limit.action) {
      case "block":
        // Set cooldown if configured
        if (limit.cooldownMs) {
          this.setCooldown(scope, resourceType, limit.cooldownMs);
        }
        return {
          allowed: false,
          deniedBy: resourceType,
          currentUsage,
          limit: limit.max,
          resetInMs: Math.max(0, resetInMs),
          retryAfterMs: limit.cooldownMs ?? Math.max(0, resetInMs),
        };

      case "warn":
        return {
          allowed: true,
          currentUsage,
          limit: limit.max,
          warning: `Quota warning: ${resourceType} usage (${currentUsage + requestedAmount}) exceeds limit (${limit.max})`,
        };

      case "throttle":
        return {
          allowed: false,
          deniedBy: resourceType,
          currentUsage,
          limit: limit.max,
          resetInMs: Math.max(0, resetInMs),
          retryAfterMs: Math.min(resetInMs, 1000), // Short retry for throttling
        };
    }
  }

  /**
   * Check and record in one operation.
   */
  checkAndRecord(
    scope: QuotaScope,
    resourceType: ResourceType,
    amount = 1,
    metadata?: Record<string, unknown>
  ): QuotaCheckResult {
    const result = this.check(scope, resourceType, amount);

    if (result.allowed) {
      this.record(scope, resourceType, amount, metadata);
    }

    return result;
  }

  // ==========================================================================
  // Usage Queries
  // ==========================================================================

  /**
   * Get current usage for a scope.
   */
  getUsage(scope: QuotaScope, resourceType: ResourceType): number {
    const config = this.getQuota(scope);
    const windowMs = config?.limits[resourceType]?.windowMs ?? 0;
    return this.tracker.getUsage(scope, resourceType, windowMs);
  }

  /**
   * Get usage summary for a scope.
   */
  getUsageSummary(scope: QuotaScope): QuotaUsageSummary {
    const config = this.getQuota(scope);
    const resources: QuotaUsageSummary["resources"] = [];
    const warnings: string[] = [];

    if (config) {
      for (const [resourceType, limit] of Object.entries(config.limits)) {
        const type = resourceType as ResourceType;
        const used = this.tracker.getUsage(scope, type, limit.windowMs);
        const percentage = limit.max > 0 ? (used / limit.max) * 100 : 0;

        resources.push({
          type,
          used,
          limit: limit.max,
          percentage,
          windowMs: limit.windowMs,
        });

        if (percentage >= 90) {
          warnings.push(`${type} usage is at ${percentage.toFixed(1)}% of limit`);
        }
      }
    }

    return { scope, resources, warnings };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Start automatic cleanup.
   */
  private startCleanup(intervalMs: number): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => {
      // Prune old records (keep 1 hour by default)
      this.tracker.prune(60 * 60 * 1000);

      // Clean expired cooldowns
      const now = Date.now();
      for (const [scopeKey, resources] of this.cooldowns) {
        for (const [resource, endTime] of resources) {
          if (now >= endTime) {
            resources.delete(resource);
          }
        }
        if (resources.size === 0) {
          this.cooldowns.delete(scopeKey);
        }
      }
    }, intervalMs);

    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop automatic cleanup.
   */
  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clear usage for a scope.
   */
  clearUsage(scope: QuotaScope): number {
    const cleared = this.tracker.clearScope(scope);
    this.cooldowns.delete(this.scopeKey(scope));
    return cleared;
  }

  /**
   * Dispose the manager.
   */
  dispose(): void {
    this.stopCleanup();
    this.tracker.clear();
    this.scopeConfigs.clear();
    this.cooldowns.clear();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private scopeKey(scope: QuotaScope): string {
    return `${scope.type}:${scope.id}`;
  }

  private setCooldown(scope: QuotaScope, resourceType: ResourceType, durationMs: number): void {
    const key = this.scopeKey(scope);
    let resources = this.cooldowns.get(key);
    if (!resources) {
      resources = new Map();
      this.cooldowns.set(key, resources);
    }
    resources.set(resourceType, Date.now() + durationMs);
  }

  private getCooldownEnd(scope: QuotaScope, resourceType: ResourceType): number | null {
    const key = this.scopeKey(scope);
    return this.cooldowns.get(key)?.get(resourceType) ?? null;
  }
}

// ============================================================================
// Preset Configurations
// ============================================================================

/** Standard quota presets */
export const QUOTA_PRESETS = {
  /** Free tier limits */
  free: {
    limits: {
      tokens_total: { max: 100_000, windowMs: 24 * 60 * 60 * 1000, action: "block" as const },
      api_calls: { max: 100, windowMs: 60 * 60 * 1000, action: "block" as const },
      tool_calls: { max: 500, windowMs: 60 * 60 * 1000, action: "warn" as const },
      concurrent_agents: { max: 2, windowMs: 0, action: "block" as const },
    },
  },

  /** Pro tier limits */
  pro: {
    limits: {
      tokens_total: { max: 1_000_000, windowMs: 24 * 60 * 60 * 1000, action: "warn" as const },
      api_calls: { max: 1000, windowMs: 60 * 60 * 1000, action: "warn" as const },
      tool_calls: { max: 5000, windowMs: 60 * 60 * 1000, action: "warn" as const },
      concurrent_agents: { max: 10, windowMs: 0, action: "block" as const },
    },
  },

  /** Enterprise tier (high limits) */
  enterprise: {
    limits: {
      tokens_total: { max: 10_000_000, windowMs: 24 * 60 * 60 * 1000, action: "warn" as const },
      api_calls: { max: 10000, windowMs: 60 * 60 * 1000, action: "warn" as const },
      tool_calls: { max: 50000, windowMs: 60 * 60 * 1000, action: "warn" as const },
      concurrent_agents: { max: 50, windowMs: 0, action: "warn" as const },
    },
  },

  /** Development (unlimited for testing) */
  development: {
    limits: {
      tokens_total: { max: Number.MAX_SAFE_INTEGER, windowMs: 0, action: "warn" as const },
      api_calls: { max: Number.MAX_SAFE_INTEGER, windowMs: 0, action: "warn" as const },
    },
  },
} satisfies Record<string, QuotaConfig>;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a quota manager with optional preset defaults.
 */
export function createQuotaManager(config?: QuotaManagerConfig): QuotaManager {
  return new QuotaManager(config);
}

/**
 * Create a quota manager with tier-based defaults.
 */
export function createTieredQuotaManager(tier: keyof typeof QUOTA_PRESETS = "free"): QuotaManager {
  const preset = QUOTA_PRESETS[tier];
  return new QuotaManager({
    defaults: {
      user: preset,
      session: preset,
    },
  });
}
