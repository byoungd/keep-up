/**
 * Scaled Collab Relay
 *
 * Enhanced CollabRelay with scale hardening features:
 * - Message batching for reduced network overhead
 * - Per-client rate limiting
 * - Backpressure handling for slow clients
 * - Snapshot policy integration
 */

import type { WebSocket } from "ws";
import type { AuditLogger } from "../audit/auditLogger";
import type { TokenResolver } from "../auth/tokenResolver";
import type { CollabMessage, CollabPresencePayload } from "../collabRelay";
import type { MetricsCollector } from "../metrics/metricsCollector";
import type { ErrorCode, Role } from "../permissions/types";
import { type BackpressureConfig, BackpressureHandler } from "./backpressureHandler";
import { type BatchedMessage, MessageBatcher, type MessageBatcherConfig } from "./messageBatcher";
import { RateLimiter, type RateLimiterConfig } from "./rateLimiter";
import { SnapshotPolicy, type SnapshotPolicyConfig } from "./snapshotPolicy";

/** Extended error codes for scale features */
export type ScaleErrorCode = ErrorCode | "RATE_LIMITED" | "BACKPRESSURE";

/** Collab connection info with scale tracking */
export type ScaledCollabConnection = {
  ws: WebSocket;
  senderId: string;
  docId: string;
  joinedAt: number;
  role: Role;
  connectionId: string;
  /** Client ID for rate limiting */
  clientId: string;
};

/** Configuration for ScaledCollabRelay */
export interface ScaledCollabRelayConfig {
  /** Token resolver for authentication (optional) */
  tokenResolver?: TokenResolver;
  /** Audit logger (optional) */
  auditLogger?: AuditLogger;
  /** Metrics collector (optional) */
  metricsCollector?: MetricsCollector;
  /** Default role for unauthenticated users */
  defaultRole?: Role;
  /** Message batcher config */
  batcher?: Partial<MessageBatcherConfig>;
  /** Rate limiter config */
  rateLimiter?: Partial<RateLimiterConfig>;
  /** Backpressure handler config */
  backpressure?: Partial<BackpressureConfig>;
  /** Snapshot policy config */
  snapshotPolicy?: Partial<SnapshotPolicyConfig>;
  /** Enable batching (default: true) */
  enableBatching?: boolean;
  /** Enable rate limiting (default: true) */
  enableRateLimiting?: boolean;
  /** Enable backpressure handling (default: true) */
  enableBackpressure?: boolean;
}

/** Scale metrics */
export interface ScaleMetrics {
  batcher: ReturnType<MessageBatcher["getMetrics"]>;
  rateLimiter: ReturnType<RateLimiter["getMetrics"]>;
  backpressure: ReturnType<BackpressureHandler["getMetrics"]>;
  snapshotPolicy: ReturnType<SnapshotPolicy["getMetrics"]>;
}

/**
 * Scaled Collab Relay with scale hardening features.
 */
export class ScaledCollabRelay {
  /** Map of docId -> Set of connections */
  private rooms = new Map<string, Set<ScaledCollabConnection>>();

  /** Map of WebSocket -> connection info */
  private connectionMap = new Map<WebSocket, ScaledCollabConnection>();

  /** Configuration */
  private config: ScaledCollabRelayConfig;

  /** State hashes for divergence detection */
  private stateHashes = new Map<string, Map<string, string>>();

  /** Scale components */
  private batcher: MessageBatcher;
  private rateLimiter: RateLimiter;
  private backpressure: BackpressureHandler;
  private snapshotPolicy: SnapshotPolicy;

  constructor(config: ScaledCollabRelayConfig = {}) {
    this.config = {
      defaultRole: config.defaultRole ?? "editor",
      enableBatching: config.enableBatching ?? true,
      enableRateLimiting: config.enableRateLimiting ?? true,
      enableBackpressure: config.enableBackpressure ?? true,
      ...config,
    };

    // Initialize scale components
    this.batcher = new MessageBatcher(
      (docId, batch) => this.deliverBatch(docId, batch),
      config.batcher
    );

    this.rateLimiter = new RateLimiter(config.rateLimiter);
    this.backpressure = new BackpressureHandler(config.backpressure);
    this.snapshotPolicy = new SnapshotPolicy(config.snapshotPolicy);
  }

  /**
   * Add a connection to a room.
   */
  addToRoom(ws: WebSocket, docId: string, senderId: string, role: Role): void {
    const connectionId = `${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientId = `${senderId}-${docId}`;

    const connection: ScaledCollabConnection = {
      ws,
      senderId,
      docId,
      joinedAt: Date.now(),
      role,
      connectionId,
      clientId,
    };

    // Add to room
    if (!this.rooms.has(docId)) {
      this.rooms.set(docId, new Set());
    }
    this.rooms.get(docId)?.add(connection);

    // Track connection
    this.connectionMap.set(ws, connection);

    // Record metrics
    this.config.metricsCollector?.recordJoin(docId);

    // Log audit event
    this.config.auditLogger?.log({
      docId,
      actorId: senderId,
      role,
      eventType: "JOIN",
      connectionId,
    });
  }

  /**
   * Remove a connection from its room.
   */
  removeFromRoom(ws: WebSocket, broadcastLeave = true): void {
    const connection = this.connectionMap.get(ws);
    if (!connection) {
      return;
    }

    const room = this.rooms.get(connection.docId);
    if (room) {
      room.delete(connection);
      if (room.size === 0) {
        this.rooms.delete(connection.docId);
        this.stateHashes.delete(connection.docId);
      }
    }

    this.connectionMap.delete(ws);

    // Clean up scale tracking
    this.rateLimiter.reset(connection.clientId);
    this.backpressure.removeClient(connection.clientId);

    // Record metrics
    this.config.metricsCollector?.recordLeave(connection.docId);

    // Log audit event
    this.config.auditLogger?.log({
      docId: connection.docId,
      actorId: connection.senderId,
      role: connection.role,
      eventType: "LEAVE",
      connectionId: connection.connectionId,
    });

    // Broadcast LEAVE message
    if (broadcastLeave) {
      const leaveMsg: CollabMessage = {
        type: "LEAVE",
        docId: connection.docId,
        senderId: connection.senderId,
        ts: Date.now(),
      };
      this.broadcast(connection.docId, leaveMsg, ws);
    }
  }

  /**
   * Handle an incoming collab message with scale checks.
   */
  handleMessage(ws: WebSocket, message: string): boolean {
    try {
      const parsed = JSON.parse(message) as CollabMessage;

      if (!this.isValidCollabMessage(parsed)) {
        return false;
      }

      const connection = this.connectionMap.get(ws);

      // Handle JOIN message
      if (parsed.type === "JOIN") {
        return this.handleJoin(ws, parsed, connection);
      }

      // Handle LEAVE message
      if (parsed.type === "LEAVE") {
        this.removeFromRoom(ws, false);
        this.broadcast(parsed.docId, parsed, ws);
        return true;
      }

      // Handle CRDT_UPDATE message with scale checks
      if (parsed.type === "CRDT_UPDATE") {
        return this.handleCrdtUpdate(ws, parsed, connection);
      }

      // Handle PRESENCE message
      if (parsed.type === "PRESENCE") {
        return this.handlePresence(ws, parsed, connection);
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Handle JOIN message.
   */
  private handleJoin(
    ws: WebSocket,
    msg: CollabMessage,
    existingConnection: ScaledCollabConnection | undefined
  ): boolean {
    if (!existingConnection) {
      const role = msg.role ?? this.config.defaultRole ?? "editor";
      this.addToRoom(ws, msg.docId, msg.senderId, role);

      const joinWithRole: CollabMessage = { ...msg, role };
      this.broadcast(msg.docId, joinWithRole, ws);
    } else {
      this.broadcast(msg.docId, msg, ws);
    }
    return true;
  }

  /**
   * Handle CRDT_UPDATE message with scale checks.
   */
  private handleCrdtUpdate(
    ws: WebSocket,
    msg: CollabMessage,
    connection: ScaledCollabConnection | undefined
  ): boolean {
    if (!connection) {
      this.sendError(ws, msg.docId, "UNKNOWN");
      return false;
    }

    // Permission check
    if (connection.role === "viewer") {
      this.sendError(ws, msg.docId, "PERMISSION_DENIED");
      this.config.metricsCollector?.recordPermissionDenied();
      this.config.auditLogger?.log({
        docId: connection.docId,
        actorId: connection.senderId,
        role: connection.role,
        eventType: "ERROR",
        errorCode: "PERMISSION_DENIED",
        connectionId: connection.connectionId,
      });
      return false;
    }

    // Rate limiting check
    if (this.config.enableRateLimiting) {
      const bytesLen = msg.bytesB64 ? msg.bytesB64.length : 0;
      const rateLimitResult = this.rateLimiter.check(connection.clientId, bytesLen);

      if (!rateLimitResult.allowed) {
        this.sendError(ws, msg.docId, "RATE_LIMITED");
        this.config.auditLogger?.log({
          docId: connection.docId,
          actorId: connection.senderId,
          role: connection.role,
          eventType: "ERROR",
          errorCode: "RATE_LIMITED",
          connectionId: connection.connectionId,
        });
        return false;
      }
    }

    // Calculate byte length for audit
    const bytesLen = msg.bytesB64 ? Math.ceil((msg.bytesB64.length * 3) / 4) : 0;

    // Record update for snapshot policy
    this.snapshotPolicy.recordUpdate(msg.docId, bytesLen);

    // Check if snapshot should be triggered
    const snapshotCheck = this.snapshotPolicy.shouldSnapshot(msg.docId);
    if (snapshotCheck.shouldSnapshot) {
      this.triggerSnapshot(msg.docId, snapshotCheck.reason);
    }

    // Record metrics
    this.config.metricsCollector?.recordUpdate(connection.docId);

    // Log audit event
    this.config.auditLogger?.log({
      docId: connection.docId,
      actorId: connection.senderId,
      role: connection.role,
      eventType: "UPDATE",
      updateBytesLen: bytesLen,
      connectionId: connection.connectionId,
    });

    // Broadcast with batching
    if (this.config.enableBatching) {
      this.batcher.queue(msg.docId, msg);
    } else {
      this.broadcast(msg.docId, msg, ws);
    }

    return true;
  }

  /**
   * Handle PRESENCE message.
   */
  private handlePresence(
    ws: WebSocket,
    msg: CollabMessage,
    connection: ScaledCollabConnection | undefined
  ): boolean {
    if (!connection) {
      return false;
    }

    const payload = msg.payload as CollabPresencePayload | undefined;
    if (payload?.stateHash) {
      this.checkDivergence(connection.docId, connection.senderId, payload.stateHash);
    }

    this.broadcast(msg.docId, msg, ws);
    return true;
  }

  /**
   * Deliver a batched message to all clients in a room.
   */
  private deliverBatch(docId: string, batch: BatchedMessage): void {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    for (const msg of batch.messages) {
      this.deliverMessageToRoom(room, msg);
    }
  }

  /**
   * Deliver a single message to all clients in a room.
   */
  private deliverMessageToRoom(room: Set<ScaledCollabConnection>, msg: CollabMessage): void {
    const serialized = JSON.stringify(msg);

    for (const connection of room) {
      if (connection.senderId === msg.senderId) {
        continue;
      }

      if (!this.shouldDeliverToClient(connection)) {
        continue;
      }

      this.sendToClient(connection, serialized);
    }
  }

  /**
   * Check if message should be delivered to client (backpressure check).
   */
  private shouldDeliverToClient(connection: ScaledCollabConnection): boolean {
    if (!this.config.enableBackpressure) {
      return true;
    }

    const action = this.backpressure.recordQueued(connection.clientId);

    if (action.type === "disconnect") {
      this.handleSlowClientDisconnect(connection);
      return false;
    }

    if (action.type === "degrade") {
      return false;
    }

    return true;
  }

  /**
   * Send serialized message to a client.
   */
  private sendToClient(connection: ScaledCollabConnection, serialized: string): void {
    if (connection.ws.readyState !== connection.ws.OPEN) {
      return;
    }

    try {
      connection.ws.send(serialized);
      if (this.config.enableBackpressure) {
        this.backpressure.recordDelivered(connection.clientId);
      }
    } catch (error) {
      console.error("[ScaledCollabRelay] Failed to send message:", error);
    }
  }

  /**
   * Handle slow client disconnect.
   */
  private handleSlowClientDisconnect(connection: ScaledCollabConnection): void {
    this.sendError(connection.ws, connection.docId, "BACKPRESSURE");

    this.config.auditLogger?.log({
      docId: connection.docId,
      actorId: connection.senderId,
      role: connection.role,
      eventType: "ERROR",
      errorCode: "BACKPRESSURE",
      connectionId: connection.connectionId,
    });

    // Close connection
    try {
      connection.ws.close(1008, "Backpressure: client too slow");
    } catch {
      // Ignore close errors
    }

    this.removeFromRoom(connection.ws, true);
  }

  /**
   * Trigger snapshot for a document.
   */
  private triggerSnapshot(docId: string, reason: string): void {
    this.snapshotPolicy.markSnapshotStarted(docId);

    // Log audit event for snapshot
    this.config.auditLogger?.log({
      docId,
      actorId: "system",
      role: "editor",
      eventType: "SNAPSHOT",
      metadata: { reason },
    });

    // In a real implementation, this would persist the snapshot
    // For now, just mark it complete
    this.snapshotPolicy.markSnapshotComplete(
      docId,
      reason as "update_threshold" | "time_threshold" | "manual"
    );
  }

  /**
   * Check for divergence.
   */
  private checkDivergence(docId: string, senderId: string, stateHash: string): void {
    if (!this.stateHashes.has(docId)) {
      this.stateHashes.set(docId, new Map());
    }

    const docHashes = this.stateHashes.get(docId);
    if (!docHashes) {
      return;
    }
    docHashes.set(senderId, stateHash);

    const uniqueHashes = new Set(docHashes.values());
    if (uniqueHashes.size > 1) {
      console.warn(
        `[ScaledCollabRelay] Divergence detected for doc ${docId}: ${uniqueHashes.size} different state hashes`
      );
    }
  }

  /**
   * Send an error message to a client.
   */
  private sendError(ws: WebSocket, docId: string, code: ScaleErrorCode): void {
    const errorMsg: CollabMessage = {
      type: "ERROR",
      docId,
      senderId: "server",
      ts: Date.now(),
      code: code as ErrorCode,
    };

    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error("[ScaledCollabRelay] Failed to send error:", error);
      }
    }
  }

  /**
   * Broadcast a message to all clients in a room except the sender.
   */
  private broadcast(docId: string, message: CollabMessage, excludeWs?: WebSocket): void {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    const serialized = JSON.stringify(message);
    for (const connection of room) {
      if (connection.ws !== excludeWs && connection.ws.readyState === connection.ws.OPEN) {
        try {
          connection.ws.send(serialized);
        } catch (error) {
          console.error("[ScaledCollabRelay] Failed to send message:", error);
        }
      }
    }
  }

  /**
   * Validate message structure.
   */
  private isValidCollabMessage(msg: unknown): msg is CollabMessage {
    if (typeof msg !== "object" || msg === null) {
      return false;
    }
    const m = msg as Record<string, unknown>;
    return (
      typeof m.type === "string" &&
      ["CRDT_UPDATE", "JOIN", "LEAVE", "PRESENCE", "ERROR"].includes(m.type) &&
      typeof m.docId === "string" &&
      m.docId.length > 0 &&
      typeof m.senderId === "string" &&
      m.senderId.length > 0 &&
      typeof m.ts === "number" &&
      m.ts > 0
    );
  }

  /**
   * Get scale metrics.
   */
  getScaleMetrics(): ScaleMetrics {
    return {
      batcher: this.batcher.getMetrics(),
      rateLimiter: this.rateLimiter.getMetrics(),
      backpressure: this.backpressure.getMetrics(),
      snapshotPolicy: this.snapshotPolicy.getMetrics(),
    };
  }

  /**
   * Flush all pending batches.
   */
  flush(): void {
    this.batcher.flush();
  }

  /**
   * Get room size.
   */
  getRoomSize(docId: string): number {
    return this.rooms.get(docId)?.size ?? 0;
  }

  /**
   * Get all room IDs.
   */
  getRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }

  /**
   * Get total connections.
   */
  getTotalConnections(): number {
    return this.connectionMap.size;
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.batcher.clear();
    this.rateLimiter.resetAll();
    this.backpressure.clear();
    this.snapshotPolicy.clear();
    this.rooms.clear();
    this.connectionMap.clear();
    this.stateHashes.clear();
  }
}
