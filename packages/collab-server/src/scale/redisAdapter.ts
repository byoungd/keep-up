import type { CollabPresencePayload, CrdtUpdatePayload } from "../collabRelay";

// ============================================================================
// Types
// ============================================================================

/** Redis adapter configuration */
export interface RedisAdapterConfig {
  /** Redis URL (redis://host:port or redis://user:pass@host:port) */
  redisUrl: string;
  /** Channel prefix for document subscriptions (default: "lfcc:doc:") */
  channelPrefix: string;
  /** Presence channel prefix (default: "lfcc:presence:") */
  presencePrefix: string;
  /** Server instance ID (auto-generated if not provided) */
  serverId: string;
  /** Reconnection config */
  reconnect: {
    /** Maximum reconnection attempts (default: 10) */
    maxAttempts: number;
    /** Reconnection delay in ms (default: 1000) */
    delayMs: number;
    /** Backoff multiplier (default: 1.5) */
    backoffMultiplier: number;
  };
  /** Health check interval in ms (default: 30000) */
  healthCheckIntervalMs: number;
  /** Message TTL in ms (default: 60000) */
  messageTtlMs: number;
}

/** Message routed through Redis */
export interface RoutedMessage {
  /** Message type */
  type: "CRDT_UPDATE" | "PRESENCE" | "JOIN" | "LEAVE" | "SNAPSHOT_REQUEST" | "SNAPSHOT_RESPONSE";
  /** Document ID */
  docId: string;
  /** Sender ID */
  senderId: string;
  /** Origin server ID */
  serverId: string;
  /** Timestamp */
  timestamp: number;
  /** Message payload */
  payload: unknown;
  /** Message ID for deduplication */
  messageId: string;
}

/** Redis connection state */
export type RedisConnectionState = "disconnected" | "connecting" | "connected" | "error";

/** Adapter metrics */
export interface RedisAdapterMetrics {
  /** Current connection state */
  connectionState: RedisConnectionState;
  /** Messages published */
  messagesPublished: number;
  /** Messages received */
  messagesReceived: number;
  /** Messages dropped (failed to publish) */
  messagesDropped: number;
  /** Active document subscriptions */
  activeSubscriptions: number;
  /** Reconnection attempts */
  reconnectionAttempts: number;
  /** Last successful publish timestamp */
  lastPublishTimestamp: number;
  /** Last received message timestamp */
  lastReceiveTimestamp: number;
}

/** Subscription callback */
export type MessageCallback = (message: RoutedMessage) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Omit<RedisAdapterConfig, "redisUrl"> = {
  channelPrefix: "lfcc:doc:",
  presencePrefix: "lfcc:presence:",
  serverId: `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  reconnect: {
    maxAttempts: 10,
    delayMs: 1000,
    backoffMultiplier: 1.5,
  },
  healthCheckIntervalMs: 30000,
  messageTtlMs: 60000,
};

// ============================================================================
// Redis Adapter (Interface Only - No Redis Dependency)
// ============================================================================

/**
 * Redis Adapter Interface
 *
 * This interface defines the contract for Redis-based message routing.
 * The actual implementation requires the `ioredis` package.
 *
 * To use:
 * 1. Install ioredis: `pnpm add ioredis`
 * 2. Use createRedisAdapter() to create an instance
 */
export interface IRedisAdapter {
  /** Connect to Redis */
  connect(): Promise<void>;
  /** Disconnect from Redis */
  disconnect(): Promise<void>;
  /** Subscribe to a document channel */
  subscribe(docId: string, callback: MessageCallback): void;
  /** Unsubscribe from a document channel */
  unsubscribe(docId: string): void;
  /** Publish a message to a document channel */
  publish(
    docId: string,
    message: Omit<RoutedMessage, "serverId" | "timestamp" | "messageId">
  ): Promise<void>;
  /** Get adapter metrics */
  getMetrics(): RedisAdapterMetrics;
  /** Check if connected */
  isConnected(): boolean;
  /** Get connection state */
  getConnectionState(): RedisConnectionState;
}

/**
 * In-Memory Message Bus (For Development/Testing)
 *
 * A simple in-memory implementation that mimics Redis Pub/Sub behavior.
 * Use this for local development or single-server deployments.
 */
export class InMemoryMessageBus implements IRedisAdapter {
  private config: RedisAdapterConfig;
  private state: RedisConnectionState = "disconnected";
  private subscriptions = new Map<string, Set<MessageCallback>>();
  private seenMessageIds = new Set<string>();
  private metrics: RedisAdapterMetrics = {
    connectionState: "disconnected",
    messagesPublished: 0,
    messagesReceived: 0,
    messagesDropped: 0,
    activeSubscriptions: 0,
    reconnectionAttempts: 0,
    lastPublishTimestamp: 0,
    lastReceiveTimestamp: 0,
  };

  constructor(config?: Partial<RedisAdapterConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      redisUrl: config?.redisUrl ?? "memory://local",
      ...config,
    };
  }

  async connect(): Promise<void> {
    this.state = "connected";
    this.metrics.connectionState = "connected";
  }

  async disconnect(): Promise<void> {
    this.state = "disconnected";
    this.metrics.connectionState = "disconnected";
    this.subscriptions.clear();
    this.metrics.activeSubscriptions = 0;
  }

  subscribe(docId: string, callback: MessageCallback): void {
    const channel = `${this.config.channelPrefix}${docId}`;
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)?.add(callback);
    this.metrics.activeSubscriptions = this.subscriptions.size;
  }

  unsubscribe(docId: string): void {
    const channel = `${this.config.channelPrefix}${docId}`;
    this.subscriptions.delete(channel);
    this.metrics.activeSubscriptions = this.subscriptions.size;
  }

  async publish(
    docId: string,
    message: Omit<RoutedMessage, "serverId" | "timestamp" | "messageId">
  ): Promise<void> {
    const channel = `${this.config.channelPrefix}${docId}`;
    const messageId = `${this.config.serverId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fullMessage: RoutedMessage = {
      ...message,
      serverId: this.config.serverId,
      timestamp: Date.now(),
      messageId,
    };

    this.metrics.messagesPublished++;
    this.metrics.lastPublishTimestamp = Date.now();

    // Broadcast to local subscribers (simulates Redis broadcast)
    const callbacks = this.subscriptions.get(channel);
    if (callbacks) {
      for (const callback of callbacks) {
        // Skip messages from same server to avoid echo
        if (fullMessage.serverId !== this.config.serverId) {
          // Deduplication
          if (!this.seenMessageIds.has(messageId)) {
            this.seenMessageIds.add(messageId);
            this.metrics.messagesReceived++;
            this.metrics.lastReceiveTimestamp = Date.now();
            callback(fullMessage);
          }
        }
      }
    }

    // Cleanup old message IDs (prevent memory leak)
    if (this.seenMessageIds.size > 10000) {
      const toDelete = Array.from(this.seenMessageIds).slice(0, 5000);
      for (const id of toDelete) {
        this.seenMessageIds.delete(id);
      }
    }
  }

  getMetrics(): RedisAdapterMetrics {
    return { ...this.metrics };
  }

  isConnected(): boolean {
    return this.state === "connected";
  }

  getConnectionState(): RedisConnectionState {
    return this.state;
  }
}

// ============================================================================
// Stateless Message Relay
// ============================================================================

/**
 * Stateless Message Relay
 *
 * Manages document subscriptions and message routing through Redis.
 * Integrates with local connection management for hybrid local/remote routing.
 */
export interface StatelessRelayConfig {
  /** Redis adapter */
  adapter: IRedisAdapter;
  /** Local message handler (for routing to local WebSocket connections) */
  onRemoteMessage: (docId: string, message: RoutedMessage) => void;
  /** Server instance ID */
  serverId: string;
}

/**
 * Create a stateless message relay.
 */
export function createStatelessRelay(config: StatelessRelayConfig) {
  const { adapter, onRemoteMessage, serverId } = config;
  const activeDocuments = new Set<string>();

  /**
   * Subscribe to a document for remote messages.
   */
  function subscribeDocument(docId: string): void {
    if (activeDocuments.has(docId)) {
      return;
    }

    adapter.subscribe(docId, (message) => {
      // Ignore messages from this server
      if (message.serverId === serverId) {
        return;
      }
      onRemoteMessage(docId, message);
    });

    activeDocuments.add(docId);
  }

  /**
   * Unsubscribe from a document.
   */
  function unsubscribeDocument(docId: string): void {
    if (!activeDocuments.has(docId)) {
      return;
    }

    adapter.unsubscribe(docId);
    activeDocuments.delete(docId);
  }

  /**
   * Publish a local message to remote servers.
   */
  async function publishMessage(
    docId: string,
    type: RoutedMessage["type"],
    senderId: string,
    payload: unknown
  ): Promise<void> {
    await adapter.publish(docId, {
      type,
      docId,
      senderId,
      payload,
    });
  }

  /**
   * Broadcast a CRDT update to remote servers.
   */
  async function broadcastCrdtUpdate(
    docId: string,
    senderId: string,
    payload: CrdtUpdatePayload
  ): Promise<void> {
    await publishMessage(docId, "CRDT_UPDATE", senderId, payload);
  }

  /**
   * Broadcast presence to remote servers.
   */
  async function broadcastPresence(
    docId: string,
    senderId: string,
    payload: CollabPresencePayload
  ): Promise<void> {
    await publishMessage(docId, "PRESENCE", senderId, payload);
  }

  /**
   * Broadcast join event to remote servers.
   */
  async function broadcastJoin(docId: string, senderId: string): Promise<void> {
    await publishMessage(docId, "JOIN", senderId, { docId, senderId });
  }

  /**
   * Broadcast leave event to remote servers.
   */
  async function broadcastLeave(docId: string, senderId: string): Promise<void> {
    await publishMessage(docId, "LEAVE", senderId, { docId, senderId });
  }

  /**
   * Request snapshot from other servers/clients.
   */
  async function requestSnapshot(docId: string, requesterId: string): Promise<void> {
    await publishMessage(docId, "SNAPSHOT_REQUEST", requesterId, { docId });
  }

  /**
   * Respond with snapshot to a requesting server/client.
   */
  async function sendSnapshotResponse(
    docId: string,
    senderId: string,
    snapshotData: Uint8Array | string
  ): Promise<void> {
    const dataStr =
      snapshotData instanceof Uint8Array
        ? Buffer.from(snapshotData).toString("base64")
        : snapshotData;

    await publishMessage(docId, "SNAPSHOT_RESPONSE", senderId, {
      docId,
      snapshot: dataStr,
      isBase64: true,
    });
  }

  /**
   * Get active document subscriptions.
   */
  function getActiveDocuments(): string[] {
    return Array.from(activeDocuments);
  }

  /**
   * Check if subscribed to a document.
   */
  function isSubscribed(docId: string): boolean {
    return activeDocuments.has(docId);
  }

  return {
    subscribeDocument,
    unsubscribeDocument,
    publishMessage,
    broadcastCrdtUpdate,
    broadcastPresence,
    broadcastJoin,
    broadcastLeave,
    requestSnapshot,
    sendSnapshotResponse,
    getActiveDocuments,
    isSubscribed,
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an in-memory message bus (for development/testing).
 */
export function createInMemoryMessageBus(
  config?: Partial<Omit<RedisAdapterConfig, "redisUrl">>
): InMemoryMessageBus {
  return new InMemoryMessageBus(config);
}

/**
 * Create a Redis adapter (requires ioredis package).
 *
 * Note: This is a placeholder. The actual implementation requires
 * installing ioredis and implementing the IRedisAdapter interface.
 *
 * @example
 * ```typescript
 * // Install: pnpm add ioredis
 * // Then create adapter:
 * const adapter = await createRedisAdapter({
 *   redisUrl: "redis://localhost:6379",
 * });
 * await adapter.connect();
 * ```
 */
export async function createRedisAdapter(
  config: Partial<RedisAdapterConfig> & { redisUrl: string }
): Promise<IRedisAdapter> {
  // For now, return in-memory adapter with a warning
  console.warn(
    "[Redis] ioredis not available - using InMemoryMessageBus. " +
      "Install ioredis and implement RedisAdapter for production multi-server support."
  );
  const adapter = new InMemoryMessageBus({
    ...DEFAULT_CONFIG,
    ...config,
  });
  await adapter.connect();
  return adapter;
}

/**
 * Generate a unique server ID.
 */
export function generateServerId(): string {
  return `server-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
