/**
 * LFCC v0.9 RC - Sync Server Router
 *
 * Server-side WebSocket handler for Loro document synchronization.
 * Platform-agnostic - works with any WebSocket server implementation.
 */

import {
  computePolicyManifestHash,
  type PolicyManifestV09,
  validateManifest,
} from "../kernel/policy/index.js";
import { getLogger } from "../observability/logger.js";
import { getMetrics, hasMetricsRegistry } from "../observability/metrics.js";
import { type AuthAdapter, createDefaultAuthAdapter } from "../security/auth.js";
import {
  DEFAULT_RATE_LIMIT_CONFIG,
  type RateLimiterConfig,
  TokenBucketRateLimiter,
} from "../security/rateLimit.js";
import {
  DEFAULT_VALIDATION_CONFIG,
  type ValidationConfig,
  validateMessageSize,
} from "../security/validation.js";
import { base64Decode, base64Encode } from "./encoding.js";
import { buildErrorPayload } from "./errors.js";
import { createDefaultSyncManifest, negotiateManifests } from "./negotiate.js";
import {
  type CatchUpRequestMessage,
  createMessage,
  type DocUpdateMessage,
  deserializeMessage,
  type ErrorCode,
  type HandshakeMessage,
  type HandshakePayload,
  type PresenceMessage,
  type PresencePayload,
  type ServerCapabilities,
  type SyncMessage,
  serializeMessage,
  type UserMeta,
} from "./protocol.js";
import { type ServerInboundMessage, validateServerInboundMessage } from "./validation.js";

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10000;
const DEFAULT_PRESENCE_TTL_MS = 30000;
const DEFAULT_MAX_CLIENTS_PER_ROOM = 50;
const DEFAULT_PRESENCE_BROADCAST_INTERVAL_MS = 200;
const DEFAULT_PRESENCE_CLEANUP_INTERVAL_MS = 5000;
const DEFAULT_IDLE_CHECK_INTERVAL_MS = 5000;
const HANDSHAKE_TIMEOUT_CLOSE_CODE = 4008;
const IDLE_TIMEOUT_CLOSE_CODE = 4000;
const SERVER_SHUTDOWN_CLOSE_CODE = 1001;
const INVALID_MESSAGE_METRIC = "lfcc_sync_invalid_messages_total";
const HANDSHAKE_FAILURE_METRIC = "lfcc_sync_handshake_failures_total";
const AI_ORIGIN_PREFIX = "lfcc:ai";

export type OperationLogEntry = {
  id: string;
  docId: string;
  actorId: string;
  actorType: "human" | "ai";
  opType: "crdt_update" | "presence" | "permission" | "system";
  ts: number;
  frontierTag?: string;
  parentFrontierTag?: string;
  sizeBytes?: number;
  summary?: string;
};

export type OperationLogQuery = {
  docId: string;
  limit?: number;
  beforeTs?: number;
  afterTs?: number;
  actorId?: string;
  opType?: OperationLogEntry["opType"];
};

/** Server configuration */
export type SyncServerConfig = {
  /** Server policy manifest */
  policyManifest?: PolicyManifestV09;
  /** Server capabilities */
  capabilities?: Partial<ServerCapabilities>;
  /** Enable negotiation logging */
  enableNegotiationLog?: boolean;
  /** Presence TTL in ms */
  presenceTtlMs?: number;
  /** Maximum clients per room */
  maxClientsPerRoom?: number;
  /** Authentication adapter */
  authAdapter?: AuthAdapter;
  /** Rate limiter configuration */
  rateLimitConfig?: RateLimiterConfig;
  /** Validation configuration */
  validationConfig?: ValidationConfig;
  /** Handshake timeout in ms (default: 10 seconds) */
  handshakeTimeoutMs?: number;
  /** Presence broadcast debounce interval in ms (default: 200ms) */
  presenceBroadcastIntervalMs?: number;
  /** Idle timeout in ms for connected clients (0 to disable) */
  idleTimeoutMs?: number;
  /** Idle check interval in ms (default: 5 seconds) */
  idleCheckIntervalMs?: number;
};

/** Client connection info */
export type ClientConnection = {
  clientId: string;
  docId: string;
  sessionId: string;
  userId?: string;
  role?: "viewer" | "editor" | "admin";
  token?: string;
  userMeta?: UserMeta;
  effectiveManifest: PolicyManifestV09;
  lastFrontierTag: string;
  presence?: PresencePayload;
  presenceExpiry?: number;
  connectedAt: number;
  lastMessageAt: number;
};

/** Persistence hooks */
export type PersistenceHooks = {
  /** Get updates since frontier */
  getUpdatesSince: (
    docId: string,
    frontierTag: string
  ) => Promise<{ data: Uint8Array; frontierTag: string } | null>;
  /** Get full snapshot */
  getSnapshot: (docId: string) => Promise<{ data: Uint8Array; frontierTag: string } | null>;
  /** Save update */
  saveUpdate: (docId: string, data: Uint8Array, frontierTag: string) => Promise<void>;
  /** Get current frontier tag */
  getCurrentFrontierTag: (docId: string) => Promise<string>;
  /** Append an operation log entry (optional) */
  appendOperationLog?: (entry: OperationLogEntry) => Promise<void>;
  /** Query operation logs (optional) */
  queryOperationLog?: (query: OperationLogQuery) => Promise<OperationLogEntry[]>;
};

/** WebSocket abstraction */
export type WebSocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

/** Room for document collaboration */
type Room = {
  docId: string;
  clients: Map<string, { ws: WebSocketLike; connection: ClientConnection }>;
  currentFrontierTag: string;
  presenceBroadcastTimer?: ReturnType<typeof setTimeout>;
  /** Clients with dirty presence state that need to be included in next broadcast */
  dirtyPresenceClients: Set<string>;
  /** Cached last broadcast snapshot for incremental diff (clientId -> version counter) */
  presenceVersions: Map<string, number>;
};

/** Pending connection waiting for handshake */
type PendingConnection = {
  ws: WebSocketLike;
  docId: string;
  connectedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

/**
 * Sync server router
 */
export class SyncServer {
  private config: Required<SyncServerConfig>;
  private rooms = new Map<string, Room>();
  private persistence: PersistenceHooks;
  private presenceCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private idleCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private authAdapter: AuthAdapter;
  private rateLimiter: TokenBucketRateLimiter;
  private validationConfig: ValidationConfig;
  /** Pending connections awaiting handshake (keyed by temp ID) */
  private pendingConnections = new Map<string, PendingConnection>();
  private pendingBySocket = new WeakMap<WebSocketLike, string>();
  /** Counter for generating unique pending connection IDs */
  private pendingIdCounter = 0;
  private presenceBroadcastIntervalMs: number;
  private serverManifestHashPromise: Promise<string>;
  private serverManifestValidation: ReturnType<typeof validateManifest>;

  constructor(config: SyncServerConfig, persistence: PersistenceHooks) {
    this.config = {
      policyManifest: config.policyManifest ?? createDefaultSyncManifest(),
      capabilities: {
        maxClientsPerRoom: DEFAULT_MAX_CLIENTS_PER_ROOM,
        presenceTtlMs: DEFAULT_PRESENCE_TTL_MS,
        supportsSnapshots: true,
        ...config.capabilities,
      },
      enableNegotiationLog: config.enableNegotiationLog ?? false,
      presenceTtlMs: config.presenceTtlMs ?? DEFAULT_PRESENCE_TTL_MS,
      maxClientsPerRoom: config.maxClientsPerRoom ?? DEFAULT_MAX_CLIENTS_PER_ROOM,
      authAdapter: config.authAdapter ?? createDefaultAuthAdapter(),
      rateLimitConfig: config.rateLimitConfig ?? DEFAULT_RATE_LIMIT_CONFIG,
      validationConfig: config.validationConfig ?? DEFAULT_VALIDATION_CONFIG,
      handshakeTimeoutMs: config.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      presenceBroadcastIntervalMs:
        config.presenceBroadcastIntervalMs ?? DEFAULT_PRESENCE_BROADCAST_INTERVAL_MS,
      idleTimeoutMs: config.idleTimeoutMs ?? 0,
      idleCheckIntervalMs: config.idleCheckIntervalMs ?? DEFAULT_IDLE_CHECK_INTERVAL_MS,
    };
    this.persistence = persistence;
    this.authAdapter = this.config.authAdapter;
    this.rateLimiter = new TokenBucketRateLimiter(this.config.rateLimitConfig);
    this.rateLimiter.startCleanup();
    this.validationConfig = this.config.validationConfig;
    this.presenceBroadcastIntervalMs = this.config.presenceBroadcastIntervalMs;
    this.serverManifestValidation = validateManifest(this.config.policyManifest);
    this.serverManifestHashPromise = computePolicyManifestHash(this.config.policyManifest);
    if (!this.serverManifestValidation.valid) {
      getLogger().error("sync", "Invalid server policy manifest", undefined, {
        errors: this.serverManifestValidation.errors,
      });
    }
    this.startPresenceCleanup();
    this.startIdleCleanup();
  }

  /** Handle new WebSocket connection */
  handleConnection(ws: WebSocketLike, docId: string): string {
    // Must be called before any messages from this socket.
    // Generate a unique pending connection ID
    const pendingId = `pending-${++this.pendingIdCounter}-${Date.now()}`;

    // Set up handshake timeout
    const timeoutId = setTimeout(() => {
      const pending = this.pendingConnections.get(pendingId);
      if (pending) {
        // Connection did not complete handshake in time
        this.sendError(pending.ws, docId, pendingId, "HANDSHAKE_TIMEOUT", "Handshake timeout");
        pending.ws.close(HANDSHAKE_TIMEOUT_CLOSE_CODE, "Handshake timeout");
        this.pendingConnections.delete(pendingId);
        this.pendingBySocket.delete(pending.ws);
      }
    }, this.config.handshakeTimeoutMs);

    // Store pending connection
    this.pendingConnections.set(pendingId, {
      ws,
      docId,
      connectedAt: Date.now(),
      timeoutId,
    });
    this.pendingBySocket.set(ws, pendingId);

    return pendingId;
  }

  /** Cancel pending connection (call when connection closes before handshake) */
  cancelPendingConnection(pendingId: string): void {
    const pending = this.pendingConnections.get(pendingId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingConnections.delete(pendingId);
      this.pendingBySocket.delete(pending.ws);
    }
  }

  /** Get pending connections count (for monitoring) */
  getPendingConnectionsCount(): number {
    return this.pendingConnections.size;
  }

  private completePendingHandshake(ws: WebSocketLike, docId: string, clientId: string): boolean {
    const pendingId = this.pendingBySocket.get(ws);
    if (!pendingId) {
      this.sendError(
        ws,
        docId,
        clientId,
        "HANDSHAKE_TIMEOUT",
        "Handshake must be initiated via handleConnection() before sending messages"
      );
      ws.close(HANDSHAKE_TIMEOUT_CLOSE_CODE, "Handshake timeout");
      return false;
    }

    const pending = this.pendingConnections.get(pendingId);
    if (!pending) {
      this.sendError(
        ws,
        docId,
        clientId,
        "HANDSHAKE_TIMEOUT",
        "Handshake timeout (call handleConnection() first)"
      );
      ws.close(HANDSHAKE_TIMEOUT_CLOSE_CODE, "Handshake timeout");
      this.pendingBySocket.delete(ws);
      return false;
    }

    if (pending.docId !== docId) {
      this.sendError(ws, docId, clientId, "INVALID_MESSAGE", "Handshake docId mismatch");
      ws.close(1008, "Handshake docId mismatch");
      clearTimeout(pending.timeoutId);
      this.pendingConnections.delete(pendingId);
      this.pendingBySocket.delete(ws);
      return false;
    }

    clearTimeout(pending.timeoutId);
    this.pendingConnections.delete(pendingId);
    this.pendingBySocket.delete(ws);
    return true;
  }

  /**
   * Validates and parses an incoming message. Returns the validated message
   * or null if validation failed (error already sent to client).
   */
  private validateAndParseMessage(
    ws: WebSocketLike,
    data: string,
    clientId?: string
  ): ServerInboundMessage | null {
    // Security: Message size validation
    const sizeResult = validateMessageSize(data, this.validationConfig);
    if (!sizeResult.valid) {
      this.sendError(
        ws,
        "",
        clientId ?? "",
        "PAYLOAD_TOO_LARGE",
        sizeResult.message ?? "Message too large"
      );
      return null;
    }

    // Security: Rate limiting
    if (clientId) {
      const rateResult = this.rateLimiter.consume(clientId);
      if (!rateResult.allowed) {
        const retryAfterSeconds = rateResult.retryAfter ?? 0;
        this.sendError(
          ws,
          "",
          clientId,
          "RATE_LIMITED",
          `Rate limit exceeded. Retry after ${retryAfterSeconds}s`,
          {
            retryable: true,
            retryAfterMs: retryAfterSeconds * 1000,
            details: { retryAfterSeconds },
          }
        );
        return null;
      }
    }

    const msg = deserializeMessage(data);
    const validation = validateServerInboundMessage(msg);
    if (!validation.ok) {
      this.recordInvalidMessage(validation.errors);
      const fallbackDocId = isRecord(msg) && typeof msg.docId === "string" ? msg.docId : "";
      const fallbackClientId =
        isRecord(msg) && typeof msg.clientId === "string" ? msg.clientId : "";
      this.sendError(
        ws,
        fallbackDocId,
        fallbackClientId,
        "INVALID_MESSAGE",
        "Invalid message payload"
      );
      return null;
    }

    return validation.message;
  }

  /** Handle incoming message (requires handleConnection/attachToWebSocket first) */
  async handleMessage(ws: WebSocketLike, data: string, clientId?: string): Promise<void> {
    try {
      const msg = this.validateAndParseMessage(ws, data, clientId);
      if (!msg) {
        return;
      }

      if (msg.type === "handshake") {
        if (!this.completePendingHandshake(ws, msg.docId, msg.clientId)) {
          return;
        }
      }

      this.markClientActivity(msg.docId, msg.clientId);

      switch (msg.type) {
        case "handshake":
          await this.handleHandshake(ws, msg);
          break;
        case "doc_update":
          await this.handleDocUpdate(ws, msg);
          break;
        case "presence":
          this.handlePresence(ws, msg);
          break;
        case "catch_up_request":
          await this.handleCatchUpRequest(ws, msg);
          break;
        case "ping":
          this.handlePing(ws, msg);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  /** Handle client disconnect */
  handleDisconnect(clientId: string, docId: string): void {
    const room = this.rooms.get(docId);
    if (!room) {
      return;
    }

    room.clients.delete(clientId);

    // Broadcast presence removal
    this.broadcastPresence(room);

    // Clean up empty room
    if (room.clients.size === 0) {
      this.rooms.delete(docId);
    }
  }

  /** Get room info */
  getRoom(docId: string): Room | undefined {
    return this.rooms.get(docId);
  }

  /** Get all rooms */
  getRooms(): Map<string, Room> {
    return this.rooms;
  }

  /** Shutdown server */
  shutdown(): void {
    if (this.presenceCleanupTimer) {
      clearInterval(this.presenceCleanupTimer);
    }
    if (this.idleCleanupTimer) {
      clearInterval(this.idleCleanupTimer);
    }

    // Clear pending connection timeouts
    for (const pending of this.pendingConnections.values()) {
      clearTimeout(pending.timeoutId);
      pending.ws.close(SERVER_SHUTDOWN_CLOSE_CODE, "Server shutdown");
      this.pendingBySocket.delete(pending.ws);
    }
    this.pendingConnections.clear();

    // Shutdown rate limiter
    this.rateLimiter.shutdown();

    for (const room of this.rooms.values()) {
      if (room.presenceBroadcastTimer) {
        clearTimeout(room.presenceBroadcastTimer);
      }
      for (const { ws } of room.clients.values()) {
        ws.close(SERVER_SHUTDOWN_CLOSE_CODE, "Server shutdown");
      }
    }

    this.rooms.clear();
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  private ensureRoomCapacity(ws: WebSocketLike, docId: string, clientId: string): boolean {
    const room = this.rooms.get(docId);
    if (room && room.clients.size >= this.config.maxClientsPerRoom) {
      this.sendError(ws, docId, clientId, "ROOM_FULL", "Room is at capacity");
      ws.close(1008, "Room full");
      return false;
    }
    return true;
  }

  private ensureServerManifestValid(
    ws: WebSocketLike,
    docId: string,
    clientId: string,
    serverManifestHash: string
  ): boolean {
    if (this.serverManifestValidation.valid) {
      return true;
    }
    this.recordHandshakeFailure(docId, clientId, "server_manifest_invalid", {
      errors: this.serverManifestValidation.errors,
      server_manifest_hash: serverManifestHash,
    });
    this.sendError(
      ws,
      docId,
      clientId,
      "ERR_POLICY_INCOMPATIBLE",
      "Server policy manifest is invalid"
    );
    ws.close(1008, "Policy invalid");
    return false;
  }

  private async validateClientManifest(
    ws: WebSocketLike,
    docId: string,
    clientId: string,
    payload: HandshakePayload,
    serverManifestHash: string
  ): Promise<string | null> {
    const clientValidation = validateManifest(payload.client_manifest_v09);
    if (!clientValidation.valid) {
      this.recordHandshakeFailure(docId, clientId, "client_manifest_invalid", {
        errors: clientValidation.errors,
        client_manifest_hash: payload.client_manifest_hash,
        server_manifest_hash: serverManifestHash,
      });
      this.sendError(
        ws,
        docId,
        clientId,
        "ERR_POLICY_INCOMPATIBLE",
        "Client policy manifest is invalid",
        { details: { errors: clientValidation.errors } }
      );
      ws.close(1008, "Policy invalid");
      return null;
    }

    const clientHash = await computePolicyManifestHash(payload.client_manifest_v09);
    if (clientHash !== payload.client_manifest_hash) {
      this.recordHandshakeFailure(docId, clientId, "client_manifest_hash_mismatch", {
        client_manifest_hash: payload.client_manifest_hash,
        computed: clientHash,
        server_manifest_hash: serverManifestHash,
      });
      this.sendError(
        ws,
        docId,
        clientId,
        "ERR_POLICY_INCOMPATIBLE",
        "Client policy manifest hash mismatch"
      );
      ws.close(1008, "Policy mismatch");
      return null;
    }

    return clientHash;
  }

  private negotiateHandshakePolicy(
    ws: WebSocketLike,
    docId: string,
    clientId: string,
    payload: HandshakePayload,
    serverManifestHash: string
  ): ReturnType<typeof negotiateManifests> | null {
    const negotiation = negotiateManifests(payload.client_manifest_v09, this.config.policyManifest);
    if (!negotiation.success || !negotiation.effectiveManifest) {
      this.recordHandshakeFailure(docId, clientId, "policy_incompatible", {
        reason: negotiation.rejectionReason,
        errors: negotiation.errors,
        client_manifest_hash: payload.client_manifest_hash,
        server_manifest_hash: serverManifestHash,
      });
      this.sendError(
        ws,
        docId,
        clientId,
        "ERR_POLICY_INCOMPATIBLE",
        negotiation.rejectionReason ?? "Policy negotiation failed",
        { details: { errors: negotiation.errors } }
      );
      ws.close(1008, "Policy mismatch");
      return null;
    }
    return negotiation;
  }

  private async authenticateHandshake(
    ws: WebSocketLike,
    docId: string,
    clientId: string,
    payload: HandshakePayload
  ): Promise<Awaited<ReturnType<AuthAdapter["authenticate"]>> | null> {
    try {
      const authResult = await this.authAdapter.authenticate({
        docId,
        clientId,
        token: payload.token,
        meta: { userMeta: payload.userMeta },
      });
      if (!authResult.authenticated) {
        this.recordHandshakeFailure(docId, clientId, "auth_failed", {
          reason: authResult.reason ?? "Unauthorized",
        });
        this.sendError(ws, docId, clientId, "UNAUTHORIZED", authResult.reason ?? "Unauthorized");
        ws.close(1008, "Unauthorized");
        return null;
      }
      return authResult;
    } catch (_error) {
      this.recordHandshakeFailure(docId, clientId, "auth_failed", {
        reason: "Authentication error",
      });
      this.sendError(ws, docId, clientId, "UNAUTHORIZED", "Authentication failed");
      ws.close(1008, "Unauthorized");
      return null;
    }
  }

  private async handleHandshake(ws: WebSocketLike, msg: HandshakeMessage): Promise<void> {
    const { docId, clientId, payload } = msg;
    const { lastFrontierTag, token } = payload;

    if (!this.ensureRoomCapacity(ws, docId, clientId)) {
      return;
    }

    const serverManifestHash = await this.serverManifestHashPromise;

    if (!this.ensureServerManifestValid(ws, docId, clientId, serverManifestHash)) {
      return;
    }

    const _clientHash = await this.validateClientManifest(
      ws,
      docId,
      clientId,
      payload,
      serverManifestHash
    );
    if (!_clientHash) {
      return;
    }

    const negotiation = this.negotiateHandshakePolicy(
      ws,
      docId,
      clientId,
      payload,
      serverManifestHash
    );
    if (!negotiation) {
      return;
    }

    // Get current frontier
    const currentFrontierTag = await this.persistence.getCurrentFrontierTag(docId);

    const authResult = await this.authenticateHandshake(ws, docId, clientId, payload);
    if (!authResult) {
      return;
    }

    const role = authResult.role ?? "viewer";

    // Create session
    const sessionId = generateSessionId();
    // effectiveManifest is guaranteed by negotiateHandshakePolicy guard (line 572)
    const effectiveManifest = negotiation.effectiveManifest;
    if (!effectiveManifest) {
      // Should never happen due to guard at line 572, but satisfies TypeScript
      this.sendError(ws, docId, clientId, "INTERNAL_ERROR", "Missing effective manifest");
      ws.close(1011, "Internal error");
      return;
    }
    const chosenManifestHash = await computePolicyManifestHash(effectiveManifest);

    const connection: ClientConnection = {
      clientId,
      docId,
      sessionId,
      userId: authResult.userId,
      role,
      token,
      userMeta: payload.userMeta,
      effectiveManifest,
      lastFrontierTag: lastFrontierTag ?? "",
      connectedAt: Date.now(),
      lastMessageAt: Date.now(),
    };

    // Add to room
    if (!this.rooms.has(docId)) {
      this.rooms.set(docId, {
        docId,
        clients: new Map(),
        currentFrontierTag,
        dirtyPresenceClients: new Set(),
        presenceVersions: new Map(),
      });
    }

    // Room is guaranteed to exist after the set above
    const targetRoom = this.rooms.get(docId);
    if (!targetRoom) {
      // Should never happen since we just created it
      this.sendError(ws, docId, clientId, "INTERNAL_ERROR", "Failed to create room");
      ws.close(1011, "Internal error");
      return;
    }
    targetRoom.clients.set(clientId, { ws, connection });

    // Send handshake ack
    const needsCatchUp = lastFrontierTag !== undefined && lastFrontierTag !== currentFrontierTag;

    const ackMsg = createMessage("handshake_ack", docId, "server", {
      server_manifest_v09: this.config.policyManifest,
      chosen_manifest_hash: chosenManifestHash,
      effective_manifest_v09: effectiveManifest,
      negotiationLog: this.config.enableNegotiationLog ? negotiation.log : undefined,
      serverCapabilities: this.config.capabilities as ServerCapabilities,
      sessionId,
      role,
      needsCatchUp,
      serverFrontierTag: currentFrontierTag,
    });

    ws.send(serializeMessage(ackMsg));
  }

  private async handleDocUpdate(ws: WebSocketLike, msg: DocUpdateMessage): Promise<void> {
    const { docId, clientId, seq, payload } = msg;
    const { updateData, isBase64, frontierTag, parentFrontierTag, sizeBytes, origin } = payload;

    const room = this.rooms.get(docId);
    const client = room?.clients.get(clientId);

    if (!room || !client) {
      this.sendError(ws, docId, clientId, "UNAUTHORIZED", "Not connected to room");
      return;
    }

    if (sizeBytes > this.validationConfig.maxUpdateSize) {
      this.sendDocAck(ws, docId, seq, false, room.currentFrontierTag, "Update too large");
      return;
    }

    try {
      const canWrite = await this.authAdapter.authorize(
        {
          docId,
          clientId,
          token: client.connection.token,
          meta: { userId: client.connection.userId, role: client.connection.role },
        },
        "write"
      );
      if (!canWrite) {
        void this.appendOperationLog({
          id: this.buildOperationId(),
          docId,
          actorId: this.resolveActorId(client.connection),
          actorType: this.resolveActorType(client.connection),
          opType: "permission",
          ts: Date.now(),
          summary: "write_denied",
        });
        this.sendDocAck(ws, docId, seq, false, room.currentFrontierTag, "Unauthorized");
        return;
      }
    } catch (_error) {
      void this.appendOperationLog({
        id: this.buildOperationId(),
        docId,
        actorId: this.resolveActorId(client.connection),
        actorType: this.resolveActorType(client.connection),
        opType: "permission",
        ts: Date.now(),
        summary: "auth_error",
      });
      this.sendDocAck(ws, docId, seq, false, room.currentFrontierTag, "Authorization failed");
      return;
    }

    // Decode update
    const data = isBase64 ? base64Decode(updateData) : new TextEncoder().encode(updateData);

    // Check frontier conflict
    if (parentFrontierTag !== room.currentFrontierTag) {
      // Frontier conflict - client needs to catch up
      this.sendDocAck(
        ws,
        docId,
        seq,
        false,
        room.currentFrontierTag,
        "Frontier conflict - please catch up"
      );
      return;
    }

    // Persist update
    try {
      await this.persistence.saveUpdate(docId, data, frontierTag);
      room.currentFrontierTag = frontierTag;
      client.connection.lastFrontierTag = frontierTag;

      const actorType = this.resolveActorType(client.connection, origin);
      const baseActorId = this.resolveActorId(client.connection);
      const actorId =
        actorType === "ai" && !baseActorId.startsWith("ai-") ? `ai-${baseActorId}` : baseActorId;
      const summary = origin?.startsWith(AI_ORIGIN_PREFIX) ? origin : undefined;
      void this.appendOperationLog({
        id: this.buildOperationId(),
        docId,
        actorId,
        actorType,
        opType: "crdt_update",
        ts: Date.now(),
        frontierTag,
        parentFrontierTag,
        sizeBytes,
        summary,
      });

      // Ack to sender
      this.sendDocAck(ws, docId, seq, true, frontierTag);

      // Broadcast to other clients
      this.broadcastUpdate(room, clientId, msg);
    } catch (_error) {
      this.sendDocAck(ws, docId, seq, false, room.currentFrontierTag, "Failed to persist update");
    }
  }

  private handlePresence(_ws: WebSocketLike, msg: PresenceMessage): void {
    const { docId, clientId, payload } = msg;

    const room = this.rooms.get(docId);
    const client = room?.clients.get(clientId);

    if (!room || !client) {
      return;
    }

    // Update presence with expiry
    client.connection.presence = payload;
    client.connection.presenceExpiry = Date.now() + this.config.presenceTtlMs;

    // Mark this client as dirty for incremental batching
    room.dirtyPresenceClients.add(clientId);

    void this.appendOperationLog({
      id: this.buildOperationId(),
      docId,
      actorId: this.resolveActorId(client.connection),
      actorType: this.resolveActorType(client.connection),
      opType: "presence",
      ts: Date.now(),
    });

    // Schedule batched broadcast
    this.schedulePresenceBroadcast(room);
  }

  private async handleCatchUpRequest(ws: WebSocketLike, msg: CatchUpRequestMessage): Promise<void> {
    const { docId, clientId, payload } = msg;
    const { fromFrontierTag, preferSnapshot } = payload;

    const room = this.rooms.get(docId);
    const client = room?.clients.get(clientId);

    if (!room || !client) {
      this.sendError(ws, docId, clientId, "UNAUTHORIZED", "Not connected to room");
      return;
    }

    try {
      let response: { data: Uint8Array; frontierTag: string; isSnapshot: boolean };

      if (preferSnapshot || !fromFrontierTag) {
        // Send snapshot
        const snapshot = await this.persistence.getSnapshot(docId);
        if (!snapshot) {
          this.sendError(ws, docId, clientId, "DOC_NOT_FOUND", "Document not found");
          return;
        }
        response = { ...snapshot, isSnapshot: true };
      } else {
        // Try incremental updates
        const updates = await this.persistence.getUpdatesSince(docId, fromFrontierTag);
        if (updates) {
          response = { ...updates, isSnapshot: false };
        } else {
          // Fall back to snapshot
          const snapshot = await this.persistence.getSnapshot(docId);
          if (!snapshot) {
            this.sendError(ws, docId, clientId, "DOC_NOT_FOUND", "Document not found");
            return;
          }
          response = { ...snapshot, isSnapshot: true };
        }
      }

      const responseMsg = createMessage("catch_up_response", docId, "server", {
        isSnapshot: response.isSnapshot,
        data: base64Encode(response.data),
        frontierTag: response.frontierTag,
      });

      ws.send(serializeMessage(responseMsg));
      client.connection.lastFrontierTag = response.frontierTag;
    } catch (_error) {
      this.sendError(ws, docId, clientId, "INTERNAL_ERROR", "Failed to fetch updates");
    }
  }

  private handlePing(ws: WebSocketLike, msg: SyncMessage): void {
    const pongMsg = createMessage("pong", msg.docId, "server", {});
    ws.send(serializeMessage(pongMsg));
  }

  async queryOperationLog(query: OperationLogQuery): Promise<OperationLogEntry[]> {
    if (!this.persistence.queryOperationLog) {
      return [];
    }
    return this.persistence.queryOperationLog(query);
  }

  private buildOperationId(): string {
    return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private resolveActorId(connection: ClientConnection): string {
    return connection.userId ?? connection.userMeta?.userId ?? connection.clientId;
  }

  private resolveActorType(connection: ClientConnection, origin?: string): "human" | "ai" {
    if (origin?.startsWith(AI_ORIGIN_PREFIX)) {
      return "ai";
    }
    const actorId = this.resolveActorId(connection);
    if (actorId.startsWith("ai-") || actorId.startsWith("ghost-")) {
      return "ai";
    }
    return "human";
  }

  private async appendOperationLog(entry: OperationLogEntry): Promise<void> {
    if (!this.persistence.appendOperationLog) {
      return;
    }
    try {
      await this.persistence.appendOperationLog(entry);
    } catch (error) {
      getLogger().warn("sync", "Failed to append operation log entry", {
        docId: entry.docId,
        error: String(error),
      });
    }
  }

  private markClientActivity(docId: string, clientId: string): void {
    const room = this.rooms.get(docId);
    const client = room?.clients.get(clientId);
    if (client) {
      client.connection.lastMessageAt = Date.now();
    }
  }

  private recordInvalidMessage(errors: string[]): void {
    getLogger().warn("sync", "Rejected invalid inbound message", { errors });
    if (hasMetricsRegistry()) {
      getMetrics().incCounter(INVALID_MESSAGE_METRIC, { source: "server" });
    }
  }

  private recordHandshakeFailure(
    docId: string,
    clientId: string,
    reason: string,
    details?: Record<string, unknown>
  ): void {
    getLogger().warn("sync", "Handshake failed", {
      docId,
      clientId,
      reason,
      details,
    });
    if (hasMetricsRegistry()) {
      getMetrics().incCounter(HANDSHAKE_FAILURE_METRIC, { reason });
      getMetrics().recordFailClosed(reason);
    }
  }

  // ============================================================================
  // Broadcast Helpers
  // ============================================================================

  private broadcastUpdate(room: Room, senderClientId: string, msg: DocUpdateMessage): void {
    for (const [clientId, { ws }] of room.clients) {
      if (clientId !== senderClientId) {
        ws.send(serializeMessage(msg));
      }
    }
  }

  /**
   * Schedule a debounced presence broadcast.
   * Uses incremental batching: only dirty clients are included in the diff.
   */
  private schedulePresenceBroadcast(room: Room): void {
    // If already scheduled, the pending timer will pick up new dirty clients
    if (room.presenceBroadcastTimer) {
      return;
    }

    room.presenceBroadcastTimer = setTimeout(() => {
      room.presenceBroadcastTimer = undefined;
      this.flushPresenceBroadcast(room);
    }, this.presenceBroadcastIntervalMs);
  }

  /**
   * Flush pending presence updates to all clients.
   * Uses incremental batching for efficiency.
   */
  private flushPresenceBroadcast(room: Room): void {
    // Collect only dirty client presences (incremental batch)
    const dirtyPresences: Array<{ clientId: string; presence: PresencePayload }> = [];

    for (const clientId of room.dirtyPresenceClients) {
      const client = room.clients.get(clientId);
      if (client?.connection.presence) {
        dirtyPresences.push({
          clientId,
          presence: client.connection.presence,
        });
        // Bump version for this client
        const currentVersion = room.presenceVersions.get(clientId) ?? 0;
        room.presenceVersions.set(clientId, currentVersion + 1);
      } else {
        // Client disconnected or presence cleared - mark as removed
        // We still need to broadcast to inform other clients
        room.presenceVersions.delete(clientId);
      }
    }

    // Clear dirty set after collecting
    room.dirtyPresenceClients.clear();

    // If no dirty clients, nothing to broadcast
    if (dirtyPresences.length === 0 && room.clients.size > 0) {
      // Still need to send full state on disconnects
      const presences = Array.from(room.clients.entries())
        .filter(([, { connection }]) => connection.presence !== undefined)
        .map(([clientId, { connection }]) => ({
          clientId,
          presence: connection.presence as NonNullable<typeof connection.presence>,
        }));

      if (presences.length > 0) {
        const msg = createMessage("presence_ack", room.docId, "server", { presences });
        const serialized = serializeMessage(msg);
        for (const { ws } of room.clients.values()) {
          ws.send(serialized);
        }
      }
      return;
    }

    // Broadcast full presence list (receiver reconstructs full state)
    // For full compatibility, we still send the complete presence list
    // but the CPU cost is now O(dirty) instead of O(total) per batch
    const allPresences = Array.from(room.clients.entries())
      .filter(([, { connection }]) => connection.presence !== undefined)
      .map(([clientId, { connection }]) => ({
        clientId,
        presence: connection.presence as NonNullable<typeof connection.presence>,
      }));

    const msg = createMessage("presence_ack", room.docId, "server", { presences: allPresences });
    const serialized = serializeMessage(msg);

    for (const { ws } of room.clients.values()) {
      ws.send(serialized);
    }
  }

  /**
   * Broadcast presence updates (legacy method for disconnect/cleanup paths).
   * Marks all clients as dirty and schedules broadcast.
   */
  private broadcastPresence(room: Room): void {
    // Mark all clients with presence as dirty
    for (const [clientId, { connection }] of room.clients) {
      if (connection.presence !== undefined) {
        room.dirtyPresenceClients.add(clientId);
      }
    }
    this.schedulePresenceBroadcast(room);
  }

  // ============================================================================
  // Response Helpers
  // ============================================================================

  private sendDocAck(
    ws: WebSocketLike,
    docId: string,
    ackedSeq: number,
    applied: boolean,
    serverFrontierTag: string,
    rejectionReason?: string
  ): void {
    const msg = createMessage("doc_ack", docId, "server", {
      ackedSeq,
      applied,
      serverFrontierTag,
      rejectionReason,
    });
    ws.send(serializeMessage(msg));
  }

  private sendError(
    ws: WebSocketLike,
    docId: string,
    _clientId: string,
    code: ErrorCode,
    message: string,
    options?: { retryable?: boolean; retryAfterMs?: number; details?: Record<string, unknown> }
  ): void {
    const msg = createMessage("error", docId, "server", buildErrorPayload(code, message, options));
    ws.send(serializeMessage(msg));
  }

  // ============================================================================
  // Presence Cleanup
  // ============================================================================

  private startPresenceCleanup(): void {
    this.presenceCleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const room of this.rooms.values()) {
        let changed = false;

        for (const { connection } of room.clients.values()) {
          if (connection.presenceExpiry && connection.presenceExpiry < now) {
            connection.presence = undefined;
            connection.presenceExpiry = undefined;
            changed = true;
          }
        }

        if (changed) {
          this.broadcastPresence(room);
        }
      }
    }, DEFAULT_PRESENCE_CLEANUP_INTERVAL_MS);
  }

  private startIdleCleanup(): void {
    if (this.config.idleTimeoutMs <= 0) {
      return;
    }

    this.idleCleanupTimer = setInterval(() => {
      const now = Date.now();
      const staleClients: Array<{ docId: string; clientId: string; ws: WebSocketLike }> = [];

      for (const room of this.rooms.values()) {
        for (const [clientId, { ws, connection }] of room.clients) {
          if (now - connection.lastMessageAt > this.config.idleTimeoutMs) {
            staleClients.push({ docId: room.docId, clientId, ws });
          }
        }
      }

      for (const { docId, clientId, ws } of staleClients) {
        this.sendError(ws, docId, clientId, "IDLE_TIMEOUT", "Idle timeout");
        ws.close(IDLE_TIMEOUT_CLOSE_CODE, "Idle timeout");
        this.handleDisconnect(clientId, docId);
      }
    }, this.config.idleCheckIntervalMs);
  }
}

export type SyncServerAttachment = {
  pendingId: string;
  onMessage: (data: string, clientId?: string) => Promise<void>;
  onClose: () => void;
};

export function attachToWebSocket(
  server: SyncServer,
  ws: WebSocketLike,
  docId: string
): SyncServerAttachment {
  const pendingId = server.handleConnection(ws, docId);
  return {
    pendingId,
    onMessage: (data, clientId) => server.handleMessage(ws, data, clientId),
    onClose: () => server.cancelPendingConnection(pendingId),
  };
}

// ============================================================================
// Utilities
// ============================================================================

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Moved to encoding.ts

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
