/**
 * Health Check and Graceful Failover
 *
 * Production-grade health monitoring with automatic failover capabilities.
 *
 * Features:
 * - Multi-probe health checking
 * - Circuit breaker pattern for failing nodes
 * - Graceful connection draining
 * - Health status aggregation
 * - Metrics collection
 */

import type { ConsistentHashRing, ServerNode } from "./consistentHashing";
import type { IRedisAdapter } from "./redisAdapter";

// ============================================================================
// Types
// ============================================================================

/** Health status */
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

/** Health check result */
export interface HealthCheckResult {
  /** Node ID */
  nodeId: string;
  /** Health status */
  status: HealthStatus;
  /** Response time in ms */
  responseTimeMs: number;
  /** Error message if unhealthy */
  error?: string;
  /** Check timestamp */
  timestamp: number;
  /** Check type */
  checkType: string;
}

/** Node health state */
export interface NodeHealthState {
  /** Node ID */
  nodeId: string;
  /** Current status */
  status: HealthStatus;
  /** Last N check results */
  history: HealthCheckResult[];
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Circuit breaker state */
  circuitState: "closed" | "open" | "half-open";
  /** Circuit breaker opened at */
  circuitOpenedAt?: number;
  /** Last successful check */
  lastSuccessAt?: number;
  /** Is draining connections */
  draining: boolean;
  /** Drain started at */
  drainStartedAt?: number;
}

/** Health monitor configuration */
export interface HealthMonitorConfig {
  /** Check interval in ms (default: 10000) */
  checkIntervalMs: number;
  /** Check timeout in ms (default: 5000) */
  checkTimeoutMs: number;
  /** Failures before marking unhealthy (default: 3) */
  failureThreshold: number;
  /** Successes before marking healthy (default: 2) */
  successThreshold: number;
  /** History length to keep (default: 10) */
  historyLength: number;
  /** Circuit breaker open duration in ms (default: 30000) */
  circuitOpenDurationMs: number;
  /** Drain timeout in ms (default: 60000) */
  drainTimeoutMs: number;
  /** Enable auto-recovery (default: true) */
  autoRecovery: boolean;
  /** Check types to run */
  checkTypes: Array<"ping" | "tcp" | "http" | "redis">;
}

/** Health check function */
export type HealthChecker = (node: ServerNode) => Promise<HealthCheckResult>;

/** Health event */
export type HealthEvent =
  | { type: "node_healthy"; nodeId: string; previousStatus: HealthStatus }
  | { type: "node_unhealthy"; nodeId: string; error: string }
  | { type: "node_degraded"; nodeId: string; reason: string }
  | { type: "circuit_opened"; nodeId: string }
  | { type: "circuit_closed"; nodeId: string }
  | { type: "drain_started"; nodeId: string }
  | { type: "drain_completed"; nodeId: string }
  | { type: "node_recovered"; nodeId: string };

/** Event listener */
export type HealthEventListener = (event: HealthEvent) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 10000,
  checkTimeoutMs: 5000,
  failureThreshold: 3,
  successThreshold: 2,
  historyLength: 10,
  circuitOpenDurationMs: 30000,
  drainTimeoutMs: 60000,
  autoRecovery: true,
  checkTypes: ["ping"],
};

// ============================================================================
// Health Monitor Implementation
// ============================================================================

/**
 * Health Monitor
 *
 * Monitors node health and manages failover.
 */
export class HealthMonitor {
  private readonly config: HealthMonitorConfig;
  private readonly hashRing: ConsistentHashRing;
  private readonly checkers: Map<string, HealthChecker> = new Map();
  private readonly nodeStates = new Map<string, NodeHealthState>();
  private readonly listeners: Set<HealthEventListener> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(hashRing: ConsistentHashRing, config: Partial<HealthMonitorConfig> = {}) {
    this.hashRing = hashRing;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Register default checkers
    this.registerChecker("ping", this.createPingChecker());
  }

  /**
   * Start health monitoring.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    // Initialize states for all nodes
    for (const node of this.hashRing.getNodes()) {
      this.initializeNodeState(node.id);
    }

    // Start periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.config.checkIntervalMs);

    // Run initial check
    this.runHealthChecks();
  }

  /**
   * Stop health monitoring.
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register a health checker.
   */
  registerChecker(name: string, checker: HealthChecker): void {
    this.checkers.set(name, checker);
  }

  /**
   * Add event listener.
   */
  addEventListener(listener: HealthEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get node health state.
   */
  getNodeState(nodeId: string): NodeHealthState | undefined {
    return this.nodeStates.get(nodeId);
  }

  /**
   * Get all node states.
   */
  getAllStates(): NodeHealthState[] {
    return Array.from(this.nodeStates.values());
  }

  /**
   * Get aggregated cluster health.
   */
  getClusterHealth(): {
    status: HealthStatus;
    healthyNodes: number;
    totalNodes: number;
    degradedNodes: number;
    unhealthyNodes: number;
  } {
    const states = this.getAllStates();
    const healthyNodes = states.filter((s) => s.status === "healthy").length;
    const degradedNodes = states.filter((s) => s.status === "degraded").length;
    const unhealthyNodes = states.filter((s) => s.status === "unhealthy").length;
    const totalNodes = states.length;

    let status: HealthStatus;
    if (unhealthyNodes === totalNodes) {
      status = "unhealthy";
    } else if (healthyNodes === totalNodes) {
      status = "healthy";
    } else if (healthyNodes > 0) {
      status = "degraded";
    } else {
      status = "unknown";
    }

    return { status, healthyNodes, totalNodes, degradedNodes, unhealthyNodes };
  }

  /**
   * Manually mark a node as draining.
   */
  startDrain(nodeId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (!state || state.draining) {
      return;
    }

    state.draining = true;
    state.drainStartedAt = Date.now();

    this.hashRing.updateNodeHealth(nodeId, false);
    this.emit({ type: "drain_started", nodeId });

    // Set drain timeout
    setTimeout(() => {
      this.completeDrain(nodeId);
    }, this.config.drainTimeoutMs);
  }

  /**
   * Complete the drain process.
   */
  completeDrain(nodeId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (!state || !state.draining) {
      return;
    }

    state.draining = false;
    state.drainStartedAt = undefined;

    this.emit({ type: "drain_completed", nodeId });
  }

  /**
   * Force circuit breaker reset for a node.
   */
  resetCircuit(nodeId: string): void {
    const state = this.nodeStates.get(nodeId);
    if (!state) {
      return;
    }

    state.circuitState = "closed";
    state.circuitOpenedAt = undefined;
    state.consecutiveFailures = 0;

    this.emit({ type: "circuit_closed", nodeId });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private initializeNodeState(nodeId: string): void {
    if (this.nodeStates.has(nodeId)) {
      return;
    }

    this.nodeStates.set(nodeId, {
      nodeId,
      status: "unknown",
      history: [],
      consecutiveFailures: 0,
      circuitState: "closed",
      draining: false,
    });
  }

  private async runHealthChecks(): Promise<void> {
    const nodes = this.hashRing.getNodes();

    for (const node of nodes) {
      this.initializeNodeState(node.id);
      const state = this.nodeStates.get(node.id);
      if (!state) {
        continue;
      }

      // Skip if draining
      if (state.draining) {
        continue;
      }

      // Check circuit breaker
      if (state.circuitState === "open") {
        const elapsed = Date.now() - (state.circuitOpenedAt || 0);
        if (elapsed >= this.config.circuitOpenDurationMs) {
          state.circuitState = "half-open";
        } else {
          continue; // Skip check while circuit is open
        }
      }

      // Run checks
      await this.checkNode(node, state);
    }
  }

  private async checkNode(node: ServerNode, state: NodeHealthState): Promise<void> {
    const results: HealthCheckResult[] = [];

    for (const checkType of this.config.checkTypes) {
      const checker = this.checkers.get(checkType);
      if (!checker) {
        continue;
      }

      try {
        const result = await Promise.race([
          checker(node),
          this.createTimeoutResult(node.id, checkType),
        ]);
        results.push(result);
      } catch (error) {
        results.push({
          nodeId: node.id,
          status: "unhealthy",
          responseTimeMs: this.config.checkTimeoutMs,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
          checkType,
        });
      }
    }

    // Aggregate results
    this.processCheckResults(node.id, state, results);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: aggregates multiple health states
  private processCheckResults(
    nodeId: string,
    state: NodeHealthState,
    results: HealthCheckResult[]
  ): void {
    const previousStatus = state.status;

    // Add to history
    for (const result of results) {
      state.history.push(result);
    }

    // Trim history
    while (state.history.length > this.config.historyLength) {
      state.history.shift();
    }

    // Determine current status
    const latestResults = results;
    const allHealthy = latestResults.every((r) => r.status === "healthy");
    const anyUnhealthy = latestResults.some((r) => r.status === "unhealthy");
    const anyDegraded = latestResults.some((r) => r.status === "degraded");

    if (allHealthy) {
      state.consecutiveFailures = 0;
      state.lastSuccessAt = Date.now();

      if (state.circuitState === "half-open") {
        // Successfully recovered
        state.circuitState = "closed";
        this.emit({ type: "circuit_closed", nodeId });
      }

      if (previousStatus !== "healthy") {
        state.status = "healthy";
        this.hashRing.updateNodeHealth(nodeId, true);
        this.emit({ type: "node_healthy", nodeId, previousStatus });

        if (previousStatus === "unhealthy") {
          this.emit({ type: "node_recovered", nodeId });
        }
      }
    } else if (anyUnhealthy) {
      state.consecutiveFailures++;

      if (state.circuitState === "half-open") {
        // Failed during recovery attempt
        state.circuitState = "open";
        state.circuitOpenedAt = Date.now();
        this.emit({ type: "circuit_opened", nodeId });
      }

      if (state.consecutiveFailures >= this.config.failureThreshold) {
        if (previousStatus !== "unhealthy") {
          state.status = "unhealthy";
          this.hashRing.updateNodeHealth(nodeId, false);

          const error = latestResults.find((r) => r.error)?.error || "Unknown error";
          this.emit({ type: "node_unhealthy", nodeId, error });

          // Open circuit
          if (state.circuitState === "closed") {
            state.circuitState = "open";
            state.circuitOpenedAt = Date.now();
            this.emit({ type: "circuit_opened", nodeId });
          }
        }
      }
    } else if (anyDegraded) {
      if (previousStatus !== "degraded") {
        state.status = "degraded";
        this.emit({
          type: "node_degraded",
          nodeId,
          reason: "Partial health check failure",
        });
      }
    }
  }

  private createPingChecker(): HealthChecker {
    return async (node: ServerNode): Promise<HealthCheckResult> => {
      const start = performance.now();

      // Simulate a ping check (in real implementation, use actual TCP/HTTP ping)
      // This is a placeholder that checks if the node exists
      const isHealthy = node.healthy;
      const responseTime = performance.now() - start;

      return {
        nodeId: node.id,
        status: isHealthy ? "healthy" : "unhealthy",
        responseTimeMs: responseTime,
        timestamp: Date.now(),
        checkType: "ping",
        error: isHealthy ? undefined : "Node marked as unhealthy",
      };
    };
  }

  private async createTimeoutResult(nodeId: string, checkType: string): Promise<HealthCheckResult> {
    await new Promise((resolve) => setTimeout(resolve, this.config.checkTimeoutMs));
    return {
      nodeId,
      status: "unhealthy",
      responseTimeMs: this.config.checkTimeoutMs,
      error: "Health check timeout",
      timestamp: Date.now(),
      checkType,
    };
  }

  private emit(event: HealthEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[HealthMonitor] Event listener error:", error);
      }
    }
  }
}

/**
 * Create HTTP health checker.
 */
export function createHttpChecker(path = "/health", expectedStatus = 200): HealthChecker {
  return async (node: ServerNode): Promise<HealthCheckResult> => {
    const start = performance.now();

    try {
      const response = await fetch(`http://${node.address}${path}`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      const responseTime = performance.now() - start;

      return {
        nodeId: node.id,
        status: response.status === expectedStatus ? "healthy" : "degraded",
        responseTimeMs: responseTime,
        timestamp: Date.now(),
        checkType: "http",
        error:
          response.status !== expectedStatus ? `Unexpected status: ${response.status}` : undefined,
      };
    } catch (error) {
      return {
        nodeId: node.id,
        status: "unhealthy",
        responseTimeMs: performance.now() - start,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        checkType: "http",
      };
    }
  };
}

/**
 * Create Redis health checker.
 */
export function createRedisChecker(adapter: IRedisAdapter): HealthChecker {
  return async (node: ServerNode): Promise<HealthCheckResult> => {
    const start = performance.now();

    try {
      const isConnected = adapter.isConnected();
      const state = adapter.getConnectionState();
      const responseTime = performance.now() - start;

      return {
        nodeId: node.id,
        status: isConnected && state === "connected" ? "healthy" : "unhealthy",
        responseTimeMs: responseTime,
        timestamp: Date.now(),
        checkType: "redis",
        error: !isConnected ? `Redis state: ${state}` : undefined,
      };
    } catch (error) {
      return {
        nodeId: node.id,
        status: "unhealthy",
        responseTimeMs: performance.now() - start,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        checkType: "redis",
      };
    }
  };
}

/**
 * Create a health monitor.
 */
export function createHealthMonitor(
  hashRing: ConsistentHashRing,
  config: Partial<HealthMonitorConfig> = {}
): HealthMonitor {
  return new HealthMonitor(hashRing, config);
}
