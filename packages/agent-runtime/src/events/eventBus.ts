/**
 * Event Bus System
 *
 * Provides a typed, prioritized event bus for agent runtime communication.
 * Supports wildcard subscriptions, async handlers, and event replay.
 */

import { getLogger } from "../logging/logger.js";

const logger = getLogger("event-bus");

// ============================================================================
// Types
// ============================================================================

/** Event priority levels */
export type EventPriority = "critical" | "high" | "normal" | "low";

/** Priority order for sorting (lower = higher priority) */
const PRIORITY_ORDER: Record<EventPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Base event interface */
export interface RuntimeEvent<T = unknown> {
  /** Unique event type identifier */
  type: string;

  /** Event payload */
  payload: T;

  /** Event metadata */
  meta: EventMeta;
}

/** Event metadata */
export interface EventMeta {
  /** Unique event ID */
  id: string;

  /** Timestamp when event was created */
  timestamp: number;

  /** Source of the event (agent ID, plugin ID, etc.) */
  source?: string;

  /** Correlation ID for tracing related events */
  correlationId?: string;

  /** Event priority */
  priority: EventPriority;

  /** Whether event has been processed */
  processed?: boolean;
}

/** Event handler function */
export type EventHandler<T = unknown> = (event: RuntimeEvent<T>) => void | Promise<void>;

/** Subscription options */
export interface SubscriptionOptions {
  /** Handler priority (affects execution order) */
  priority?: EventPriority;

  /** Only receive events once, then auto-unsubscribe */
  once?: boolean;

  /** Replay historical events on subscribe */
  replay?: boolean;

  /** Maximum number of historical events to replay */
  replayLimit?: number;

  /** Filter function for events */
  filter?: (event: RuntimeEvent) => boolean;
}

/** Subscription handle */
export interface Subscription {
  /** Unique subscription ID */
  id: string;

  /** Event type pattern */
  pattern: string;

  /** Unsubscribe from events */
  unsubscribe: () => void;
}

export interface RuntimeEventOptions {
  source?: string;
  correlationId?: string;
  priority?: EventPriority;
}

export interface RuntimeEventBus {
  emit<K extends keyof RuntimeEventMap>(
    type: K,
    payload: RuntimeEventMap[K],
    options?: RuntimeEventOptions
  ): RuntimeEvent<RuntimeEventMap[K]>;
  emitRaw<T>(type: string, payload: T, options?: RuntimeEventOptions): RuntimeEvent<T>;
  subscribe<K extends keyof RuntimeEventMap>(
    pattern: K | string,
    handler: EventHandler<RuntimeEventMap[K]>,
    options?: SubscriptionOptions
  ): Subscription;
}

/** Internal subscription record */
interface SubscriptionRecord {
  id: string;
  pattern: string;
  handler: EventHandler;
  priority: EventPriority;
  once: boolean;
  filter?: (event: RuntimeEvent) => boolean;
}

/** Event bus configuration */
export interface EventBusConfig {
  /** Maximum number of events to store for replay */
  maxHistorySize?: number;

  /** TTL for historical events in milliseconds */
  historyTtlMs?: number;

  /** Enable debug logging */
  debug?: boolean;

  /** Maximum concurrent handlers */
  maxConcurrentHandlers?: number;
}

/** Event bus statistics */
export interface EventBusStats {
  /** Total events emitted */
  totalEmitted: number;

  /** Total events handled */
  totalHandled: number;

  /** Active subscriptions count */
  activeSubscriptions: number;

  /** Events in history */
  historySize: number;

  /** Handlers currently executing */
  pendingHandlers: number;
}

// ============================================================================
// Built-in Event Types
// ============================================================================

/** Agent lifecycle events */
export interface AgentEvents {
  "agent:spawned": { agentId: string; type: string; task: string };
  "agent:started": { agentId: string };
  "agent:completed": { agentId: string; result: unknown };
  "agent:failed": { agentId: string; error: string };
  "agent:cancelled": { agentId: string; reason: string };
}

/** Tool execution events */
export interface ToolEvents {
  "tool:called": { toolName: string; args: unknown; callId: string };
  "tool:completed": { toolName: string; callId: string; durationMs: number };
  "tool:failed": { toolName: string; callId: string; error: string };
  "tool:rate-limited": { toolName: string; retryAfterMs: number };
}

/** Plugin lifecycle events */
export interface PluginEvents {
  "plugin:loaded": { pluginId: string; version: string };
  "plugin:activated": { pluginId: string };
  "plugin:deactivated": { pluginId: string };
  "plugin:unloaded": { pluginId: string };
  "plugin:error": { pluginId: string; error: string };
}

/** System events */
export interface SystemEvents {
  "system:ready": { startupTimeMs: number };
  "system:shutdown": { reason: string };
  "system:error": { error: string; fatal: boolean };
  "system:checkpoint": { checkpointId: string };
}

/** Combined event map */
export interface RuntimeEventMap extends AgentEvents, ToolEvents, PluginEvents, SystemEvents {
  // Allow custom events with string index
  [key: string]: unknown;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Typed event bus with priority handling and wildcard subscriptions.
 */
export class EventBus {
  private readonly subscriptions = new Map<string, SubscriptionRecord[]>();
  private readonly history: RuntimeEvent[] = [];
  private readonly config: Required<EventBusConfig>;

  private subscriptionIdCounter = 0;
  private totalEmitted = 0;
  private totalHandled = 0;
  private pendingHandlers = 0;

  constructor(config: EventBusConfig = {}) {
    this.config = {
      maxHistorySize: config.maxHistorySize ?? 1000,
      historyTtlMs: config.historyTtlMs ?? 5 * 60 * 1000, // 5 minutes
      debug: config.debug ?? false,
      maxConcurrentHandlers: config.maxConcurrentHandlers ?? 100,
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Emit a typed event.
   */
  emit<K extends keyof RuntimeEventMap>(
    type: K,
    payload: RuntimeEventMap[K],
    options: Partial<Pick<EventMeta, "source" | "correlationId" | "priority">> = {}
  ): RuntimeEvent<RuntimeEventMap[K]> {
    const event = this.createEvent(type as string, payload, options);
    this.processEvent(event);
    return event;
  }

  /**
   * Emit a raw event (for custom event types).
   */
  emitRaw<T>(
    type: string,
    payload: T,
    options: Partial<Pick<EventMeta, "source" | "correlationId" | "priority">> = {}
  ): RuntimeEvent<T> {
    const event = this.createEvent(type, payload, options);
    this.processEvent(event);
    return event;
  }

  /**
   * Subscribe to events matching a pattern.
   *
   * Patterns support:
   * - Exact match: "agent:spawned"
   * - Wildcard suffix: "agent:*"
   * - Full wildcard: "*"
   */
  subscribe<K extends keyof RuntimeEventMap>(
    pattern: K | string,
    handler: EventHandler<RuntimeEventMap[K]>,
    options: SubscriptionOptions = {}
  ): Subscription {
    const id = this.generateSubscriptionId();
    const patternStr = pattern as string;

    const record: SubscriptionRecord = {
      id,
      pattern: patternStr,
      handler: handler as EventHandler,
      priority: options.priority ?? "normal",
      once: options.once ?? false,
      filter: options.filter,
    };

    // Add to subscriptions map
    const existing = this.subscriptions.get(patternStr) ?? [];
    existing.push(record);
    // Sort by priority
    existing.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    this.subscriptions.set(patternStr, existing);

    // Replay historical events if requested
    if (options.replay) {
      this.replayEvents(record, options.replayLimit);
    }

    if (this.config.debug) {
      // Debug mode: subscription registered
    }

    return {
      id,
      pattern: patternStr,
      unsubscribe: () => this.unsubscribe(patternStr, id),
    };
  }

  /**
   * Subscribe to an event once.
   */
  once<K extends keyof RuntimeEventMap>(
    pattern: K | string,
    handler: EventHandler<RuntimeEventMap[K]>,
    options: Omit<SubscriptionOptions, "once"> = {}
  ): Subscription {
    return this.subscribe(pattern, handler, { ...options, once: true });
  }

  /**
   * Wait for an event to occur.
   */
  waitFor<K extends keyof RuntimeEventMap>(
    pattern: K | string,
    options: { timeoutMs?: number; filter?: (event: RuntimeEvent) => boolean } = {}
  ): Promise<RuntimeEvent<RuntimeEventMap[K]>> {
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? 30000;

      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Timeout waiting for event: ${pattern as string}`));
      }, timeoutMs);

      const subscription = this.once(
        pattern,
        (event) => {
          clearTimeout(timeout);
          resolve(event as RuntimeEvent<RuntimeEventMap[K]>);
        },
        { filter: options.filter }
      );
    });
  }

  /**
   * Get event history matching a pattern.
   */
  getHistory(pattern?: string, limit?: number): RuntimeEvent[] {
    this.pruneHistory();

    let events = this.history;

    if (pattern) {
      events = events.filter((e) => this.matchesPattern(e.type, pattern));
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return [...events];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Get event bus statistics.
   */
  getStats(): EventBusStats {
    let activeSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      activeSubscriptions += subs.length;
    }

    return {
      totalEmitted: this.totalEmitted,
      totalHandled: this.totalHandled,
      activeSubscriptions,
      historySize: this.history.length,
      pendingHandlers: this.pendingHandlers,
    };
  }

  /**
   * Remove all subscriptions for a pattern.
   */
  removeAllListeners(pattern?: string): void {
    if (pattern) {
      this.subscriptions.delete(pattern);
    } else {
      this.subscriptions.clear();
    }
  }

  /**
   * Dispose the event bus.
   */
  dispose(): void {
    this.subscriptions.clear();
    this.history.length = 0;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private createEvent<T>(
    type: string,
    payload: T,
    options: Partial<Pick<EventMeta, "source" | "correlationId" | "priority">>
  ): RuntimeEvent<T> {
    return {
      type,
      payload,
      meta: {
        id: this.generateEventId(),
        timestamp: Date.now(),
        source: options.source,
        correlationId: options.correlationId,
        priority: options.priority ?? "normal",
      },
    };
  }

  private processEvent(event: RuntimeEvent): void {
    this.totalEmitted++;

    // Add to history
    this.history.push(event);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }

    if (this.config.debug) {
      // Debug mode: emitting event
    }

    // Find matching handlers
    const handlers = this.findMatchingHandlers(event);

    // Sort by priority
    handlers.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    // Execute handlers
    for (const record of handlers) {
      this.executeHandler(record, event);
    }
  }

  private findMatchingHandlers(event: RuntimeEvent): SubscriptionRecord[] {
    const handlers: SubscriptionRecord[] = [];

    for (const [pattern, records] of this.subscriptions) {
      if (this.matchesPattern(event.type, pattern)) {
        for (const record of records) {
          // Apply filter if present
          if (record.filter && !record.filter(event)) {
            continue;
          }
          handlers.push(record);
        }
      }
    }

    return handlers;
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith(":*")) {
      const prefix = pattern.slice(0, -1); // Remove "*"
      return eventType.startsWith(prefix);
    }

    return eventType === pattern;
  }

  private executeHandler(record: SubscriptionRecord, event: RuntimeEvent): void {
    this.pendingHandlers++;
    this.totalHandled++;

    // Remove if once
    if (record.once) {
      this.unsubscribe(record.pattern, record.id);
    }

    try {
      const result = record.handler(event);

      // Handle async handlers
      if (result instanceof Promise) {
        result
          .catch((error) => {
            logger.error(`Handler error for ${event.type}`, error as Error, {
              eventType: event.type,
              pattern: record.pattern,
            });
          })
          .finally(() => {
            this.pendingHandlers--;
          });
      } else {
        this.pendingHandlers--;
      }
    } catch (error) {
      this.pendingHandlers--;
      logger.error(`Handler error for ${event.type}`, error as Error, {
        eventType: event.type,
        pattern: record.pattern,
      });
    }
  }

  private replayEvents(record: SubscriptionRecord, limit?: number): void {
    this.pruneHistory();

    let events = this.history.filter((e) => this.matchesPattern(e.type, record.pattern));

    if (record.filter) {
      events = events.filter(record.filter);
    }

    if (limit) {
      events = events.slice(-limit);
    }

    for (const event of events) {
      this.executeHandler(record, event);
    }
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - this.config.historyTtlMs;
    while (this.history.length > 0 && this.history[0].meta.timestamp < cutoff) {
      this.history.shift();
    }
  }

  private unsubscribe(pattern: string, id: string): void {
    const records = this.subscriptions.get(pattern);
    if (!records) {
      return;
    }

    const index = records.findIndex((r) => r.id === id);
    if (index !== -1) {
      records.splice(index, 1);
      if (records.length === 0) {
        this.subscriptions.delete(pattern);
      }
    }

    if (this.config.debug) {
      // Debug mode: completed emit
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${++this.subscriptionIdCounter}`;
  }
}

// ============================================================================
// Factory
// ============================================================================

/** Global event bus instance */
let globalEventBus: EventBus | null = null;

/**
 * Create a new event bus instance.
 */
export function createEventBus(config?: EventBusConfig): EventBus {
  return new EventBus(config);
}

/**
 * Get or create the global event bus instance.
 */
export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing).
 */
export function resetGlobalEventBus(): void {
  globalEventBus?.dispose();
  globalEventBus = null;
}
