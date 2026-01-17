/**
 * Stateless Collaboration Relay
 *
 * A stateless WebSocket relay for multi-server deployments.
 * Key principles:
 * - Servers maintain only connection mappings (in-memory)
 * - No persistent document state on servers
 * - Messages are routed through Redis Pub/Sub
 * - Snapshots are obtained from connected clients
 */

import type { WebSocket } from "ws";
import type { AuditLogger } from "../audit/auditLogger";
import type { TokenResolver } from "../auth/tokenResolver";
import type { CollabMessage, CrdtUpdatePayload } from "../collabRelay";
import type { MetricsCollector } from "../metrics/metricsCollector";
import type { Role } from "../permissions/types";
import { type BackpressureConfig, BackpressureHandler } from "./backpressureHandler";
import { MessageBatcher, type MessageBatcherConfig } from "./messageBatcher";
import { RateLimiter, type RateLimiterConfig } from "./rateLimiter";
import {
  createInMemoryMessageBus,
  createStatelessRelay,
  generateServerId,
  type IRedisAdapter,
  type RoutedMessage,
} from "./redisAdapter";

// ============================================================================
// Types
// ============================================================================

/** Connection info */
export interface StatelessConnection {
  ws: WebSocket;
  senderId: string;
  docId: string;
  joinedAt: number;
  role: Role;
  connectionId: string;
  clientId: string;
  /** Whether this client has a complete document snapshot */
  hasSnapshot: boolean;
  /** Last activity timestamp */
  lastActivity: number;
}

/** Relay configuration */
export interface StatelessRelayConfig {
  /** Server instance ID */
  serverId?: string;
  /** Redis adapter (optional - uses in-memory if not provided) */
  redisAdapter?: IRedisAdapter;
  /** Token resolver for authentication */
  tokenResolver?: TokenResolver;
  /** Audit logger */
  auditLogger?: AuditLogger;
  /** Metrics collector */
  metricsCollector?: MetricsCollector;
  /** Default role for unauthenticated users */
  defaultRole?: Role;
  /** Message batcher config */
  batcher?: Partial<MessageBatcherConfig>;
  /** Rate limiter config */
  rateLimiter?: Partial<RateLimiterConfig>;
  /** Backpressure handler config */
  backpressure?: Partial<BackpressureConfig>;
  /** Enable batching */
  enableBatching?: boolean;
  /** Enable rate limiting */
  enableRateLimiting?: boolean;
  /** Enable backpressure handling */
  enableBackpressure?: boolean;
  /** Snapshot request timeout in ms */
  snapshotRequestTimeoutMs?: number;
}

/** Relay metrics */
export interface StatelessRelayMetrics {
  /** Active connections */
  activeConnections: number;
  /** Unique documents */
  activeDocuments: number;
  /** Messages routed locally */
  localMessages: number;
  /** Messages routed via Redis */
  remoteMessages: number;
  /** Snapshot requests sent */
  snapshotRequests: number;
  /** Snapshot responses received */
  snapshotResponses: number;
  /** Rate limited messages */
  rateLimitedMessages: number;
  /** Backpressure events */
  backpressureEvents: number;
}

// ============================================================================
// Stateless Collab Relay
// ============================================================================

/**
 * Stateless Collaboration Relay
 *
 * Manages WebSocket connections and routes messages through Redis Pub/Sub.
 * Designed for horizontal scaling with no shared state between servers.
 */
export class StatelessCollabRelay {
  private serverId: string;
  private config: StatelessRelayConfig;

  /** Local connections: docId -> Set<connection> */
  private rooms = new Map<string, Set<StatelessConnection>>();
  /** WebSocket -> connection mapping */
  private connectionMap = new Map<WebSocket, StatelessConnection>();

  /** Scale components */
  private redisAdapter: IRedisAdapter;
  private relay: ReturnType<typeof createStatelessRelay>;
  private batcher: MessageBatcher;
  private rateLimiter: RateLimiter;
  private backpressure: BackpressureHandler;

  /** Metrics */
  private metrics: StatelessRelayMetrics = {
    activeConnections: 0,
    activeDocuments: 0,
    localMessages: 0,
    remoteMessages: 0,
    snapshotRequests: 0,
    snapshotResponses: 0,
    rateLimitedMessages: 0,
    backpressureEvents: 0,
  };

  /** Pending snapshot requests */
  private pendingSnapshotRequests = new Map<
    string,
    {
      resolve: (data: Uint8Array | null) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(config: StatelessRelayConfig = {}) {
    this.serverId = config.serverId ?? generateServerId();
    this.config = {
      defaultRole: config.defaultRole ?? "editor",
      enableBatching: config.enableBatching ?? true,
      enableRateLimiting: config.enableRateLimiting ?? true,
      enableBackpressure: config.enableBackpressure ?? true,
      snapshotRequestTimeoutMs: config.snapshotRequestTimeoutMs ?? 10000,
      ...config,
    };

    // Initialize Redis adapter
    this.redisAdapter = config.redisAdapter ?? createInMemoryMessageBus();

    // Initialize stateless relay
    this.relay = createStatelessRelay({
      adapter: this.redisAdapter,
      serverId: this.serverId,
      onRemoteMessage: (docId, message) => this.handleRemoteMessage(docId, message),
    });

    // Initialize scale components
    this.batcher = new MessageBatcher(
      (docId, batch) => this.sendBatchedMessages(docId, batch),
      config.batcher ?? {}
    );

    this.rateLimiter = new RateLimiter(config.rateLimiter);
    this.backpressure = new BackpressureHandler(config.backpressure);
  }

  /**
   * Initialize the relay (connect to Redis).
   */
  async initialize(): Promise<void> {
    await this.redisAdapter.connect();
  }

  /**
   * Shutdown the relay.
   */
  async shutdown(): Promise<void> {
    // Close all connections
    for (const [ws, conn] of this.connectionMap) {
      this.relay.unsubscribeDocument(conn.docId);
      ws.close(1001, "Server shutting down");
    }

    this.rooms.clear();
    this.connectionMap.clear();
    this.batcher.flush();

    await this.redisAdapter.disconnect();
  }

  /**
   * Handle new WebSocket connection.
   */
  handleConnection(
    ws: WebSocket,
    docId: string,
    senderId: string,
    options: { role?: Role; hasSnapshot?: boolean } = {}
  ): StatelessConnection {
    const connectionId = `${this.serverId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const connection: StatelessConnection = {
      ws,
      senderId,
      docId,
      joinedAt: Date.now(),
      role: options.role ?? this.config.defaultRole ?? "editor",
      connectionId,
      clientId: senderId,
      hasSnapshot: options.hasSnapshot ?? false,
      lastActivity: Date.now(),
    };

    // Add to room
    if (!this.rooms.has(docId)) {
      this.rooms.set(docId, new Set());
      // Subscribe to document channel on first connection
      this.relay.subscribeDocument(docId);
    }
    this.rooms.get(docId)?.add(connection);
    this.connectionMap.set(ws, connection);

    // Update metrics
    this.metrics.activeConnections = this.connectionMap.size;
    this.metrics.activeDocuments = this.rooms.size;

    // Broadcast join to remote servers
    void this.relay.broadcastJoin(docId, senderId);

    // Broadcast join to local connections
    this.broadcastLocal(
      docId,
      {
        type: "JOIN",
        docId,
        senderId,
        ts: Date.now(),
        payload: { status: "active" },
      },
      ws
    );

    return connection;
  }

  /**
   * Handle WebSocket disconnection.
   */
  handleDisconnection(ws: WebSocket): void {
    const connection = this.connectionMap.get(ws);
    if (!connection) {
      return;
    }

    const { docId, senderId } = connection;

    // Remove from room
    const room = this.rooms.get(docId);
    if (room) {
      room.delete(connection);
      if (room.size === 0) {
        this.rooms.delete(docId);
        // Unsubscribe from document channel when last connection leaves
        this.relay.unsubscribeDocument(docId);
      }
    }

    this.connectionMap.delete(ws);

    // Update metrics
    this.metrics.activeConnections = this.connectionMap.size;
    this.metrics.activeDocuments = this.rooms.size;

    // Broadcast leave to remote servers
    void this.relay.broadcastLeave(docId, senderId);

    // Broadcast leave to local connections
    this.broadcastLocal(
      docId,
      {
        type: "LEAVE",
        docId,
        senderId,
        ts: Date.now(),
        payload: { status: "away" },
      },
      undefined
    );

    // Clean up rate limiter
    this.rateLimiter.reset(connection.clientId);
  }

  /**
   * Handle incoming message from a client.
   */
  async handleMessage(ws: WebSocket, rawMessage: string): Promise<void> {
    const connection = this.connectionMap.get(ws);
    if (!connection) {
      return;
    }

    // Update activity timestamp
    connection.lastActivity = Date.now();

    // Rate limiting
    if (this.config.enableRateLimiting) {
      const rateResult = this.rateLimiter.check(connection.clientId, rawMessage.length);
      if (!rateResult.allowed) {
        this.metrics.rateLimitedMessages++;
        ws.send(
          JSON.stringify({
            type: "ERROR",
            docId: connection.docId,
            senderId: "server",
            payload: {
              code: "RATE_LIMITED",
              retryAfterMs: rateResult.retryAfterMs,
            },
          })
        );
        return;
      }
    }

    // Parse message
    let message: CollabMessage;
    try {
      message = JSON.parse(rawMessage) as CollabMessage;
    } catch {
      return; // Ignore malformed messages
    }

    // Handle message types
    switch (message.type) {
      case "CRDT_UPDATE":
        await this.handleCrdtUpdate(connection, message);
        break;

      case "PRESENCE":
        await this.handlePresence(connection, message);
        break;

      case "SNAPSHOT_REQUEST":
        await this.handleSnapshotRequest(connection);
        break;

      case "SNAPSHOT_RESPONSE":
        this.handleSnapshotResponse(connection, message);
        break;

      default:
        // Forward other messages locally
        this.broadcastLocal(connection.docId, message, ws);
    }
  }

  /**
   * Handle CRDT update message.
   */
  private async handleCrdtUpdate(
    connection: StatelessConnection,
    message: CollabMessage
  ): Promise<void> {
    const { docId, senderId } = connection;

    // Mark client as having snapshot
    connection.hasSnapshot = true;

    // Broadcast to local connections
    this.metrics.localMessages++;
    this.broadcastLocal(docId, message, connection.ws);

    // Broadcast to remote servers via Redis
    await this.relay.broadcastCrdtUpdate(docId, senderId, message.payload as CrdtUpdatePayload);
  }

  /**
   * Handle presence message.
   */
  private async handlePresence(
    connection: StatelessConnection,
    message: CollabMessage
  ): Promise<void> {
    const { docId, senderId } = connection;

    // Broadcast to local connections
    this.broadcastLocal(docId, message, connection.ws);

    // Broadcast to remote servers via Redis
    if (message.payload) {
      await this.relay.broadcastPresence(docId, senderId, message.payload);
    }
  }

  /**
   * Handle snapshot request.
   */
  private async handleSnapshotRequest(connection: StatelessConnection): Promise<void> {
    const { docId } = connection;

    this.metrics.snapshotRequests++;

    // First, try to get snapshot from local clients
    const localSnapshot = await this.getLocalSnapshot(docId, connection.ws);
    if (localSnapshot) {
      connection.ws.send(
        JSON.stringify({
          type: "SNAPSHOT_RESPONSE",
          docId,
          senderId: "server",
          payload: {
            snapshot: Buffer.from(localSnapshot).toString("base64"),
            isBase64: true,
          },
        })
      );
      return;
    }

    // If no local snapshot, request from remote servers
    await this.relay.requestSnapshot(docId, connection.senderId);
  }

  /**
   * Handle snapshot response.
   */
  private handleSnapshotResponse(connection: StatelessConnection, message: CollabMessage): void {
    this.metrics.snapshotResponses++;

    const payload = message.payload as { snapshot?: string; isBase64?: boolean };
    if (!payload.snapshot) {
      return;
    }

    // Resolve pending request
    const pending = this.pendingSnapshotRequests.get(connection.docId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingSnapshotRequests.delete(connection.docId);

      const data = payload.isBase64
        ? Buffer.from(payload.snapshot, "base64")
        : new TextEncoder().encode(payload.snapshot);

      pending.resolve(new Uint8Array(data));
    }
  }

  /**
   * Handle message from remote server (via Redis).
   */
  private handleRemoteMessage(docId: string, message: RoutedMessage): void {
    this.metrics.remoteMessages++;

    const room = this.rooms.get(docId);
    if (!room || room.size === 0) {
      return;
    }

    if (this.handleSnapshotResponseMessage(docId, message)) {
      return;
    }

    if (message.type === "SNAPSHOT_REQUEST") {
      void this.handleRemoteSnapshotRequest(docId);
      return;
    }

    this.broadcastToRoom(room, docId, message);
  }

  private handleSnapshotResponseMessage(docId: string, message: RoutedMessage): boolean {
    if (message.type !== "SNAPSHOT_RESPONSE") {
      return false;
    }

    const pending = this.pendingSnapshotRequests.get(docId);
    if (!pending) {
      return true;
    }

    const payload = message.payload as { snapshot?: string; isBase64?: boolean };
    if (!payload.snapshot) {
      return true;
    }

    clearTimeout(pending.timeout);
    this.pendingSnapshotRequests.delete(docId);

    const data = payload.isBase64
      ? Buffer.from(payload.snapshot, "base64")
      : new TextEncoder().encode(payload.snapshot);

    pending.resolve(new Uint8Array(data));
    return true;
  }

  private broadcastToRoom(
    room: Set<StatelessConnection>,
    docId: string,
    message: RoutedMessage
  ): void {
    const collabMessage: CollabMessage = {
      type: message.type as CollabMessage["type"],
      docId,
      senderId: message.senderId,
      ts: message.timestamp,
      payload: message.payload as CollabMessage["payload"],
    };

    for (const conn of room) {
      if (this.config.enableBatching) {
        this.batcher.queue(docId, collabMessage);
      } else {
        this.sendToClient(conn.ws, collabMessage);
      }
    }
  }

  /**
   * Handle snapshot request from remote server.
   */
  private async handleRemoteSnapshotRequest(docId: string): Promise<void> {
    const snapshot = await this.getLocalSnapshot(docId);
    if (snapshot) {
      await this.relay.sendSnapshotResponse(docId, this.serverId, snapshot);
    }
  }

  /**
   * Get snapshot from local clients.
   */
  private async getLocalSnapshot(docId: string, excludeWs?: WebSocket): Promise<Uint8Array | null> {
    const room = this.rooms.get(docId);
    if (!room) {
      return null;
    }

    // Find a client with a snapshot
    for (const conn of room) {
      if (conn.ws === excludeWs) {
        continue;
      }
      if (!conn.hasSnapshot) {
        continue;
      }

      // Request snapshot from client
      return new Promise<Uint8Array | null>((resolve) => {
        const requestId = `${docId}-${Date.now()}`;
        const timeout = setTimeout(() => {
          this.pendingSnapshotRequests.delete(requestId);
          resolve(null);
        }, this.config.snapshotRequestTimeoutMs ?? 10000);

        this.pendingSnapshotRequests.set(requestId, { resolve, timeout });

        conn.ws.send(
          JSON.stringify({
            type: "SNAPSHOT_REQUEST",
            docId,
            senderId: "server",
            payload: { requestId },
          })
        );
      });
    }

    return null;
  }

  /**
   * Broadcast message to local connections.
   */
  private broadcastLocal(docId: string, message: CollabMessage, excludeWs?: WebSocket): void {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    for (const conn of room) {
      if (conn.ws === excludeWs) {
        continue;
      }

      // Backpressure check
      if (this.config.enableBackpressure) {
        const action = this.backpressure.recordQueued(conn.clientId);
        if (action.type === "disconnect") {
          this.metrics.backpressureEvents++;
          continue;
        }
      }

      if (this.config.enableBatching) {
        this.batcher.queue(docId, message);
      } else {
        this.sendToClient(conn.ws, message);
      }
    }
  }

  /**
   * Send message to a client.
   */
  private sendToClient(ws: WebSocket, message: CollabMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send batched messages (called by batcher).
   */
  private sendBatchedMessages(docId: string, batch: { messages: CollabMessage[] }): void {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    for (const conn of room) {
      if (conn.ws.readyState !== conn.ws.OPEN) {
        continue;
      }

      if (batch.messages.length === 1) {
        conn.ws.send(JSON.stringify(batch.messages[0]));
      } else {
        conn.ws.send(
          JSON.stringify({
            type: "BATCH",
            messages: batch.messages,
          })
        );
      }
    }
  }

  /**
   * Get relay metrics.
   */
  getMetrics(): StatelessRelayMetrics & {
    redis: ReturnType<IRedisAdapter["getMetrics"]>;
    batcher: ReturnType<MessageBatcher["getMetrics"]>;
    rateLimiter: ReturnType<RateLimiter["getMetrics"]>;
    backpressure: ReturnType<BackpressureHandler["getMetrics"]>;
  } {
    return {
      ...this.metrics,
      redis: this.redisAdapter.getMetrics(),
      batcher: this.batcher.getMetrics(),
      rateLimiter: this.rateLimiter.getMetrics(),
      backpressure: this.backpressure.getMetrics(),
    };
  }

  /**
   * Get server ID.
   */
  getServerId(): string {
    return this.serverId;
  }

  /**
   * Get connections for a document.
   */
  getDocumentConnections(docId: string): StatelessConnection[] {
    const room = this.rooms.get(docId);
    return room ? Array.from(room) : [];
  }

  /**
   * Get all active documents.
   */
  getActiveDocuments(): string[] {
    return Array.from(this.rooms.keys());
  }
}
