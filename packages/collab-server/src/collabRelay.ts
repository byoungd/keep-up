/**
 * Collaboration MVP - Collab Relay Handler
 *
 * Handles simplified collab messages (CRDT_UPDATE, JOIN, LEAVE, PRESENCE, ERROR)
 * for the collaboration MVP. This is a pass-through relay that does not
 * interpret CRDT bytes.
 *
 * Phase 3 additions:
 * - Role-based permission enforcement
 * - Audit logging
 * - Metrics collection
 * - Divergence detection (state hash logging)
 */

import type { WebSocket } from "ws";
import type { AuditLogger } from "./audit/auditLogger";
import type { TokenResolver } from "./auth/tokenResolver";
import type { MetricsCollector } from "./metrics/metricsCollector";
import type { ErrorCode, Role } from "./permissions/types";

/** Simplified collab message types */
export type CollabMessageType =
  | "CRDT_UPDATE"
  | "JOIN"
  | "LEAVE"
  | "PRESENCE"
  | "ERROR"
  | "SNAPSHOT_REQUEST"
  | "SNAPSHOT_RESPONSE";

/** Base collab message structure */
export type CollabMessage = {
  type: CollabMessageType;
  docId: string;
  senderId: string;
  ts: number;
  bytesB64?: string;
  payload?: CollabPresencePayload;
  role?: Role;
  code?: ErrorCode;
};

/** Presence payload with optional state hash */
export type CollabPresencePayload = {
  displayName?: string;
  cursor?: { blockId: string; offset: number };
  status?: "active" | "idle" | "away";
  stateHash?: string;
};

/** CRDT update payload for Redis routing */
export type CrdtUpdatePayload = {
  /** Base64-encoded CRDT bytes */
  bytesB64: string;
  /** Optional version/sequence number */
  version?: number;
};

/** Collab connection info */
export type CollabConnection = {
  ws: WebSocket;
  senderId: string;
  docId: string;
  joinedAt: number;
  role: Role;
  connectionId: string;
};

/** Configuration for CollabRelay */
export type CollabRelayConfig = {
  /** Token resolver for authentication (optional) */
  tokenResolver?: TokenResolver;
  /** Audit logger (optional) */
  auditLogger?: AuditLogger;
  /** Metrics collector (optional) */
  metricsCollector?: MetricsCollector;
  /** Default role for unauthenticated users */
  defaultRole?: Role;
};

/**
 * Collab relay for simplified message broadcasting.
 *
 * Features:
 * - Room management by docId
 * - Pass-through message broadcasting (no CRDT interpretation)
 * - JOIN/LEAVE message handling
 * - Automatic LEAVE broadcast on disconnect
 * - Role-based permission enforcement (Phase 3)
 * - Audit logging (Phase 3)
 * - Metrics collection (Phase 3)
 * - Divergence detection via state hash (Phase 3)
 */
export class CollabRelay {
  /** Map of docId -> Set of connections */
  private rooms = new Map<string, Set<CollabConnection>>();

  /** Map of WebSocket -> connection info */
  private connectionMap = new Map<WebSocket, CollabConnection>();

  /** Configuration */
  private config: CollabRelayConfig;

  /** State hashes for divergence detection */
  private stateHashes = new Map<string, Map<string, string>>(); // docId -> senderId -> hash

  constructor(config: CollabRelayConfig = {}) {
    this.config = {
      defaultRole: config.defaultRole ?? "editor",
      ...config,
    };
  }

  /**
   * Add a connection to a room.
   */
  addToRoom(ws: WebSocket, docId: string, senderId: string, role: Role): void {
    const connectionId = `${senderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const connection: CollabConnection = {
      ws,
      senderId,
      docId,
      joinedAt: Date.now(),
      role,
      connectionId,
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
   * Optionally broadcasts a LEAVE message.
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
        // Clean up state hashes for this doc
        this.stateHashes.delete(connection.docId);
      }
    }

    this.connectionMap.delete(ws);

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

    // Broadcast LEAVE message to remaining clients
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
   * Handle an incoming collab message.
   * Validates and broadcasts to other clients in the room.
   */
  handleMessage(ws: WebSocket, message: string): boolean {
    try {
      const parsed = JSON.parse(message) as CollabMessage;

      // Validate message structure
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
        // Broadcast LEAVE to others
        this.broadcast(parsed.docId, parsed, ws);
        return true;
      }

      // Handle CRDT_UPDATE message
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
    existingConnection: CollabConnection | undefined
  ): boolean {
    if (!existingConnection) {
      // Determine role - use message role or default
      const role = msg.role ?? this.config.defaultRole ?? "editor";

      // New connection joining
      this.addToRoom(ws, msg.docId, msg.senderId, role);

      // Broadcast JOIN with role to others
      const joinWithRole: CollabMessage = {
        ...msg,
        role,
      };
      this.broadcast(msg.docId, joinWithRole, ws);
    } else {
      // Already connected, just broadcast
      this.broadcast(msg.docId, msg, ws);
    }
    return true;
  }

  /**
   * Handle CRDT_UPDATE message with permission check.
   */
  private handleCrdtUpdate(
    ws: WebSocket,
    msg: CollabMessage,
    connection: CollabConnection | undefined
  ): boolean {
    if (!connection) {
      // Not connected, reject
      this.sendError(ws, msg.docId, "UNKNOWN");
      return false;
    }

    // Check permission - viewers cannot send updates
    if (connection.role === "viewer") {
      // Send error to client
      this.sendError(ws, msg.docId, "PERMISSION_DENIED");

      // Record metrics
      this.config.metricsCollector?.recordPermissionDenied();

      // Log audit event
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

    // Calculate byte length for audit (not content!)
    const bytesLen = msg.bytesB64 ? Math.ceil((msg.bytesB64.length * 3) / 4) : 0;

    // Record metrics
    this.config.metricsCollector?.recordUpdate(connection.docId);

    // Log audit event (metadata only)
    this.config.auditLogger?.log({
      docId: connection.docId,
      actorId: connection.senderId,
      role: connection.role,
      eventType: "UPDATE",
      updateBytesLen: bytesLen,
      connectionId: connection.connectionId,
    });

    // Pass-through broadcast to all other clients in the room
    this.broadcast(msg.docId, msg, ws);
    return true;
  }

  /**
   * Handle PRESENCE message with divergence detection.
   */
  private handlePresence(
    ws: WebSocket,
    msg: CollabMessage,
    connection: CollabConnection | undefined
  ): boolean {
    if (!connection) {
      return false;
    }

    // Check for state hash (divergence detection)
    const payload = msg.payload as CollabPresencePayload | undefined;
    if (payload?.stateHash) {
      this.checkDivergence(connection.docId, connection.senderId, payload.stateHash);
    }

    // Pass-through broadcast to all other clients in the room
    this.broadcast(msg.docId, msg, ws);
    return true;
  }

  /**
   * Check for divergence by comparing state hashes.
   * Logs mismatches but does not block.
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

    // Check for mismatches
    const uniqueHashes = new Set(docHashes.values());
    if (uniqueHashes.size > 1) {
      console.warn(
        `[CollabRelay] Divergence detected for doc ${docId}: ${uniqueHashes.size} different state hashes`
      );
      // This is for debugging only - we don't block or reject
    }
  }

  /**
   * Send an error message to a client.
   */
  private sendError(ws: WebSocket, docId: string, code: ErrorCode): void {
    const errorMsg: CollabMessage = {
      type: "ERROR",
      docId,
      senderId: "server",
      ts: Date.now(),
      code,
    };

    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(errorMsg));
      } catch (error) {
        console.error("[CollabRelay] Failed to send error:", error);
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
          console.error("[CollabRelay] Failed to send message:", error);
        }
      }
    }
  }

  /**
   * Validate that a message has the required collab message structure.
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
   * Get the number of clients in a room.
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
   * Get participants in a room.
   */
  getParticipants(docId: string): Array<{ senderId: string; joinedAt: number; role: Role }> {
    const room = this.rooms.get(docId);
    if (!room) {
      return [];
    }
    return Array.from(room).map((conn) => ({
      senderId: conn.senderId,
      joinedAt: conn.joinedAt,
      role: conn.role,
    }));
  }

  /**
   * Get total number of connections.
   */
  getTotalConnections(): number {
    return this.connectionMap.size;
  }

  /**
   * Get connection info for a WebSocket.
   */
  getConnection(ws: WebSocket): CollabConnection | undefined {
    return this.connectionMap.get(ws);
  }

  /**
   * Clear all rooms and connections.
   */
  clear(): void {
    this.rooms.clear();
    this.connectionMap.clear();
    this.stateHashes.clear();
  }
}
