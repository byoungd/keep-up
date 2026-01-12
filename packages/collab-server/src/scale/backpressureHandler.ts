/**
 * Backpressure Handler
 *
 * Detects slow clients and implements degradation strategies.
 * Prevents slow clients from blocking the entire system.
 */

/** Backpressure handler configuration */
export interface BackpressureConfig {
  /** Queue depth threshold for slow client detection (default: 100) */
  queueDepthThreshold: number;
  /** Time threshold for slow client detection in ms (default: 5000) */
  timeThresholdMs: number;
  /** Maximum queue depth before disconnect (default: 500) */
  maxQueueDepth: number;
  /** Enable snapshot resync for slow clients (default: true) */
  enableSnapshotResync: boolean;
}

/** Client queue state */
interface ClientQueueState {
  /** Current queue depth */
  queueDepth: number;
  /** Timestamp when queue started growing */
  queueGrowthStartMs: number | null;
  /** Whether client is marked as slow */
  isSlow: boolean;
  /** Number of times marked slow */
  slowCount: number;
  /** Last activity timestamp */
  lastActivityMs: number;
}

/** Backpressure action */
export type BackpressureAction =
  | { type: "none" }
  | { type: "degrade"; reason: "slow_client" }
  | { type: "disconnect"; reason: "unrecoverable" };

/** Backpressure metrics */
export interface BackpressureMetrics {
  /** Total slow client detections */
  slowClientDetections: number;
  /** Total degradations triggered */
  degradationsTriggered: number;
  /** Total disconnects triggered */
  disconnectsTriggered: number;
  /** Current slow client count */
  currentSlowClients: number;
}

const DEFAULT_CONFIG: BackpressureConfig = {
  queueDepthThreshold: 100,
  timeThresholdMs: 5000,
  maxQueueDepth: 500,
  enableSnapshotResync: true,
};

/**
 * Backpressure handler for managing slow clients.
 */
export class BackpressureHandler {
  private config: BackpressureConfig;
  private clients = new Map<string, ClientQueueState>();
  private metrics: BackpressureMetrics = {
    slowClientDetections: 0,
    degradationsTriggered: 0,
    disconnectsTriggered: 0,
    currentSlowClients: 0,
  };

  constructor(config: Partial<BackpressureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a message queued for a client.
   */
  recordQueued(clientId: string): BackpressureAction {
    const state = this.getOrCreateState(clientId);
    state.queueDepth++;
    state.lastActivityMs = Date.now();

    // Start tracking queue growth
    if (state.queueDepth >= this.config.queueDepthThreshold && !state.queueGrowthStartMs) {
      state.queueGrowthStartMs = Date.now();
    }

    return this.checkBackpressure(clientId, state);
  }

  /**
   * Record a message delivered to a client.
   */
  recordDelivered(clientId: string, count = 1): void {
    const state = this.clients.get(clientId);
    if (!state) {
      return;
    }

    state.queueDepth = Math.max(0, state.queueDepth - count);
    state.lastActivityMs = Date.now();

    // Reset queue growth tracking if queue is healthy
    if (state.queueDepth < this.config.queueDepthThreshold) {
      state.queueGrowthStartMs = null;

      // Clear slow status if queue is empty
      if (state.queueDepth === 0 && state.isSlow) {
        state.isSlow = false;
        this.metrics.currentSlowClients = Math.max(0, this.metrics.currentSlowClients - 1);
      }
    }
  }

  /**
   * Check backpressure status for a client.
   */
  private checkBackpressure(_clientId: string, state: ClientQueueState): BackpressureAction {
    const now = Date.now();

    // Check for unrecoverable state
    if (state.queueDepth >= this.config.maxQueueDepth) {
      this.metrics.disconnectsTriggered++;
      return { type: "disconnect", reason: "unrecoverable" };
    }

    // Check for slow client
    if (state.queueGrowthStartMs && now - state.queueGrowthStartMs >= this.config.timeThresholdMs) {
      if (!state.isSlow) {
        state.isSlow = true;
        state.slowCount++;
        this.metrics.slowClientDetections++;
        this.metrics.currentSlowClients++;
      }

      if (this.config.enableSnapshotResync) {
        this.metrics.degradationsTriggered++;
        return { type: "degrade", reason: "slow_client" };
      }
    }

    return { type: "none" };
  }

  /**
   * Get queue depth for a client.
   */
  getQueueDepth(clientId: string): number {
    return this.clients.get(clientId)?.queueDepth ?? 0;
  }

  /**
   * Check if a client is marked as slow.
   */
  isSlowClient(clientId: string): boolean {
    return this.clients.get(clientId)?.isSlow ?? false;
  }

  /**
   * Remove client tracking.
   */
  removeClient(clientId: string): void {
    const state = this.clients.get(clientId);
    if (state?.isSlow) {
      this.metrics.currentSlowClients = Math.max(0, this.metrics.currentSlowClients - 1);
    }
    this.clients.delete(clientId);
  }

  /**
   * Get backpressure metrics.
   */
  getMetrics(): BackpressureMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics.
   */
  resetMetrics(): void {
    this.metrics = {
      slowClientDetections: 0,
      degradationsTriggered: 0,
      disconnectsTriggered: 0,
      currentSlowClients: 0,
    };
  }

  /**
   * Get client count.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Clear all client tracking.
   */
  clear(): void {
    this.clients.clear();
    this.metrics.currentSlowClients = 0;
  }

  /**
   * Get or create state for a client.
   */
  private getOrCreateState(clientId: string): ClientQueueState {
    let state = this.clients.get(clientId);
    if (!state) {
      state = {
        queueDepth: 0,
        queueGrowthStartMs: null,
        isSlow: false,
        slowCount: 0,
        lastActivityMs: Date.now(),
      };
      this.clients.set(clientId, state);
    }
    return state;
  }
}
