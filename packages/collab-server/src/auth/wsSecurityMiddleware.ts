/**
 * WebSocket Security Middleware
 *
 * Production-ready security layer for WebSocket connections:
 * - Connection-level rate limiting
 * - Connection timeout management
 * - User identity tracking and audit logging
 * - Session token validation (NextAuth compatible)
 */

import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import type { AuthRole, SessionAuthProvider, SessionAuthResult } from "./sessionAuthProvider";
import { createAuthFailure, isAuthFailure } from "./sessionAuthProvider";

/** Connection state tracking */
export interface ConnectionState {
  /** Unique connection ID */
  connectionId: string;
  /** User ID from auth */
  userId: string;
  /** User role */
  role: AuthRole;
  /** Document ID */
  docId: string;
  /** Client ID (from handshake) */
  clientId: string | null;
  /** Connection timestamp */
  connectedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Message count */
  messageCount: number;
  /** Bytes received */
  bytesReceived: number;
  /** Remote address */
  remoteAddress: string;
  /** User agent */
  userAgent: string;
  /** Token expiration (if known) */
  tokenExp?: number;
  /** Team ID (if applicable) */
  teamId?: string;
}

/** Rate limit configuration per connection */
export interface ConnectionRateLimitConfig {
  /** Max messages per minute per connection (default: 300) */
  maxMessagesPerMinute: number;
  /** Max bytes per minute per connection (default: 1MB) */
  maxBytesPerMinute: number;
  /** Max connections per user (default: 10) */
  maxConnectionsPerUser: number;
  /** Burst allowance multiplier (default: 1.5) */
  burstMultiplier: number;
}

/** Connection timeout configuration */
export interface ConnectionTimeoutConfig {
  /** Handshake timeout in ms (default: 10000) */
  handshakeTimeoutMs: number;
  /** Idle timeout in ms (default: 300000 = 5 minutes) */
  idleTimeoutMs: number;
  /** Max connection duration in ms (default: 86400000 = 24 hours) */
  maxConnectionDurationMs: number;
  /** Ping interval in ms (default: 30000) */
  pingIntervalMs: number;
  /** Pong timeout in ms (default: 10000) */
  pongTimeoutMs: number;
}

/** Security middleware configuration */
export interface WsSecurityConfig {
  /** Auth provider for token validation */
  authProvider: SessionAuthProvider;
  /** Rate limit configuration */
  rateLimit?: Partial<ConnectionRateLimitConfig>;
  /** Timeout configuration */
  timeout?: Partial<ConnectionTimeoutConfig>;
  /** Allow anonymous connections (dev mode) */
  allowAnonymous?: boolean;
  /** Audit logger callback */
  onAuditEvent?: (event: SecurityAuditEvent) => void;
  /** Connection state change callback */
  onConnectionStateChange?: (
    state: ConnectionState,
    event: "connect" | "disconnect" | "update"
  ) => void;
}

/** Security audit event */
export interface SecurityAuditEvent {
  /** Event type */
  type:
    | "connection_attempt"
    | "connection_established"
    | "connection_rejected"
    | "connection_closed"
    | "auth_success"
    | "auth_failure"
    | "rate_limited"
    | "timeout"
    | "error";
  /** Timestamp */
  timestamp: number;
  /** Connection ID */
  connectionId: string;
  /** User ID (if known) */
  userId?: string;
  /** Document ID */
  docId?: string;
  /** Remote address */
  remoteAddress: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/** Rate limit state per connection */
interface RateLimitState {
  /** Messages in current window */
  messagesInWindow: number;
  /** Bytes in current window */
  bytesInWindow: number;
  /** Window start time */
  windowStartMs: number;
  /** Burst tokens available */
  burstTokens: number;
}

/** Connection health state */
interface ConnectionHealth {
  /** Ping timer */
  pingTimer: ReturnType<typeof setInterval> | null;
  /** Pong received flag */
  pongReceived: boolean;
  /** Handshake timer */
  handshakeTimer: ReturnType<typeof setTimeout> | null;
  /** Idle timer */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Max duration timer */
  maxDurationTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_RATE_LIMIT: ConnectionRateLimitConfig = {
  maxMessagesPerMinute: 300,
  maxBytesPerMinute: 1024 * 1024, // 1MB
  maxConnectionsPerUser: 10,
  burstMultiplier: 1.5,
};

const DEFAULT_TIMEOUT: ConnectionTimeoutConfig = {
  handshakeTimeoutMs: 10000,
  idleTimeoutMs: 300000, // 5 minutes
  maxConnectionDurationMs: 86400000, // 24 hours
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
};

/**
 * WebSocket Security Middleware
 *
 * Provides comprehensive security for WebSocket connections including
 * authentication, rate limiting, timeout management, and audit logging.
 */
export class WsSecurityMiddleware {
  private config: {
    authProvider: SessionAuthProvider;
    rateLimit: ConnectionRateLimitConfig;
    timeout: ConnectionTimeoutConfig;
    allowAnonymous: boolean;
    onAuditEvent?: (event: SecurityAuditEvent) => void;
    onConnectionStateChange?: (
      state: ConnectionState,
      event: "connect" | "disconnect" | "update"
    ) => void;
  };

  /** Active connections by connection ID */
  private connections = new Map<string, ConnectionState>();
  /** Rate limit state by connection ID */
  private rateLimitState = new Map<string, RateLimitState>();
  /** Connection health by connection ID */
  private healthState = new Map<string, ConnectionHealth>();
  /** User connection counts */
  private userConnectionCounts = new Map<string, number>();

  constructor(config: WsSecurityConfig) {
    this.config = {
      authProvider: config.authProvider,
      rateLimit: { ...DEFAULT_RATE_LIMIT, ...config.rateLimit },
      timeout: { ...DEFAULT_TIMEOUT, ...config.timeout },
      allowAnonymous: config.allowAnonymous ?? false,
      onAuditEvent: config.onAuditEvent,
      onConnectionStateChange: config.onConnectionStateChange,
    };
  }

  /**
   * Generate a unique connection ID.
   */
  generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Extract token from request (supports multiple sources).
   */
  extractToken(request: IncomingMessage): string | undefined {
    // 1. Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    // 2. Check query parameter
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      return queryToken;
    }

    // 3. Check Sec-WebSocket-Protocol for token (subprotocol-based auth)
    const protocols = request.headers["sec-websocket-protocol"];
    if (protocols) {
      const protocolList = protocols.split(",").map((p) => p.trim());
      for (const protocol of protocolList) {
        if (protocol.startsWith("auth.")) {
          return protocol.slice(5);
        }
      }
    }

    // 4. Check cookies for session token (NextAuth compatible)
    const cookies = request.headers.cookie;
    if (cookies) {
      const sessionToken =
        this.extractCookie(cookies, "next-auth.session-token") ??
        this.extractCookie(cookies, "__Secure-next-auth.session-token");
      if (sessionToken) {
        return sessionToken;
      }
    }

    return undefined;
  }

  /**
   * Extract a cookie value by name.
   */
  private extractCookie(cookies: string, name: string): string | undefined {
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  /**
   * Authenticate a new connection.
   */
  async authenticateConnection(
    connectionId: string,
    request: IncomingMessage,
    docId: string
  ): Promise<
    | { success: true; session: SessionAuthResult }
    | { success: false; reason: string; retryable: boolean }
  > {
    const remoteAddress = this.getRemoteAddress(request);
    const userAgent = request.headers["user-agent"] ?? "unknown";

    // Emit audit event
    this.emitAuditEvent({
      type: "connection_attempt",
      timestamp: Date.now(),
      connectionId,
      docId,
      remoteAddress,
      details: { userAgent },
    });

    const token = this.extractToken(request);

    // Handle missing token
    if (!token) {
      if (this.config.allowAnonymous) {
        const anonSession: SessionAuthResult = {
          userId: `anon-${connectionId}`,
          role: "viewer",
        };
        return { success: true, session: anonSession };
      }

      this.emitAuditEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        connectionId,
        docId,
        remoteAddress,
        details: { reason: "missing_token" },
      });

      return { success: false, reason: "Authentication token required", retryable: true };
    }

    try {
      const session = await this.config.authProvider.validate(token);

      // Check user connection limit
      const currentCount = this.userConnectionCounts.get(session.userId) ?? 0;
      if (currentCount >= this.config.rateLimit.maxConnectionsPerUser) {
        this.emitAuditEvent({
          type: "connection_rejected",
          timestamp: Date.now(),
          connectionId,
          userId: session.userId,
          docId,
          remoteAddress,
          details: { reason: "max_connections_exceeded", currentCount },
        });

        return {
          success: false,
          reason: `Maximum connections (${this.config.rateLimit.maxConnectionsPerUser}) exceeded`,
          retryable: true,
        };
      }

      // Check document access if restricted
      if (session.allowedDocIds && !session.allowedDocIds.includes(docId)) {
        this.emitAuditEvent({
          type: "auth_failure",
          timestamp: Date.now(),
          connectionId,
          userId: session.userId,
          docId,
          remoteAddress,
          details: { reason: "document_access_denied" },
        });

        return {
          success: false,
          reason: "Access to this document is not allowed",
          retryable: false,
        };
      }

      this.emitAuditEvent({
        type: "auth_success",
        timestamp: Date.now(),
        connectionId,
        userId: session.userId,
        docId,
        remoteAddress,
        details: { role: session.role },
      });

      return { success: true, session };
    } catch (error) {
      const failure = isAuthFailure(error)
        ? error
        : createAuthFailure("UNKNOWN", "Authentication failed", false);

      this.emitAuditEvent({
        type: "auth_failure",
        timestamp: Date.now(),
        connectionId,
        docId,
        remoteAddress,
        details: { code: failure.code, reason: failure.message },
      });

      return { success: false, reason: failure.message, retryable: failure.retryable };
    }
  }

  /**
   * Register a successfully authenticated connection.
   */
  registerConnection(
    connectionId: string,
    ws: WebSocket,
    session: SessionAuthResult,
    docId: string,
    request: IncomingMessage
  ): ConnectionState {
    const now = Date.now();
    const remoteAddress = this.getRemoteAddress(request);
    const userAgent = request.headers["user-agent"] ?? "unknown";

    const state: ConnectionState = {
      connectionId,
      userId: session.userId,
      role: session.role,
      docId,
      clientId: null,
      connectedAt: now,
      lastActivityAt: now,
      messageCount: 0,
      bytesReceived: 0,
      remoteAddress,
      userAgent,
      tokenExp: session.exp,
      teamId: session.teamId,
    };

    this.connections.set(connectionId, state);
    this.rateLimitState.set(connectionId, {
      messagesInWindow: 0,
      bytesInWindow: 0,
      windowStartMs: now,
      burstTokens:
        this.config.rateLimit.maxMessagesPerMinute * this.config.rateLimit.burstMultiplier,
    });

    // Increment user connection count
    const currentCount = this.userConnectionCounts.get(session.userId) ?? 0;
    this.userConnectionCounts.set(session.userId, currentCount + 1);

    // Set up connection health monitoring
    this.setupHealthMonitoring(connectionId, ws);

    // Emit events
    this.emitAuditEvent({
      type: "connection_established",
      timestamp: now,
      connectionId,
      userId: session.userId,
      docId,
      remoteAddress,
      details: { role: session.role },
    });

    this.config.onConnectionStateChange?.(state, "connect");

    return state;
  }

  /**
   * Set up health monitoring for a connection.
   */
  private setupHealthMonitoring(connectionId: string, ws: WebSocket): void {
    const health: ConnectionHealth = {
      pingTimer: null,
      pongReceived: true,
      handshakeTimer: null,
      idleTimer: null,
      maxDurationTimer: null,
    };

    // Ping/pong for keepalive
    health.pingTimer = setInterval(() => {
      if (!health.pongReceived) {
        // No pong received since last ping - connection might be dead
        this.emitAuditEvent({
          type: "timeout",
          timestamp: Date.now(),
          connectionId,
          remoteAddress: this.connections.get(connectionId)?.remoteAddress ?? "unknown",
          details: { reason: "pong_timeout" },
        });
        ws.terminate();
        return;
      }

      health.pongReceived = false;
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, this.config.timeout.pingIntervalMs);

    // Max connection duration
    health.maxDurationTimer = setTimeout(() => {
      const state = this.connections.get(connectionId);
      this.emitAuditEvent({
        type: "timeout",
        timestamp: Date.now(),
        connectionId,
        userId: state?.userId,
        remoteAddress: state?.remoteAddress ?? "unknown",
        details: { reason: "max_duration_exceeded" },
      });
      ws.close(1000, "Maximum connection duration exceeded");
    }, this.config.timeout.maxConnectionDurationMs);

    // Set up idle timeout
    this.resetIdleTimer(connectionId, ws, health);

    // Handle pong
    ws.on("pong", () => {
      health.pongReceived = true;
    });

    this.healthState.set(connectionId, health);
  }

  /**
   * Reset idle timer for a connection.
   */
  private resetIdleTimer(connectionId: string, ws: WebSocket, health: ConnectionHealth): void {
    if (health.idleTimer) {
      clearTimeout(health.idleTimer);
    }

    health.idleTimer = setTimeout(() => {
      const state = this.connections.get(connectionId);
      this.emitAuditEvent({
        type: "timeout",
        timestamp: Date.now(),
        connectionId,
        userId: state?.userId,
        remoteAddress: state?.remoteAddress ?? "unknown",
        details: { reason: "idle_timeout" },
      });
      ws.close(1000, "Connection idle timeout");
    }, this.config.timeout.idleTimeoutMs);
  }

  /**
   * Check rate limit for a message.
   */
  checkRateLimit(
    connectionId: string,
    messageBytes: number
  ): { allowed: boolean; retryAfterMs?: number } {
    const state = this.rateLimitState.get(connectionId);
    if (!state) {
      return { allowed: false, retryAfterMs: 1000 };
    }

    const now = Date.now();
    const windowMs = 60000; // 1 minute window

    // Reset window if expired
    if (now - state.windowStartMs >= windowMs) {
      state.messagesInWindow = 0;
      state.bytesInWindow = 0;
      state.windowStartMs = now;
      state.burstTokens =
        this.config.rateLimit.maxMessagesPerMinute * this.config.rateLimit.burstMultiplier;
    }

    // Replenish burst tokens
    const elapsedMs = now - state.windowStartMs;
    const tokensToAdd = (elapsedMs / windowMs) * this.config.rateLimit.maxMessagesPerMinute;
    state.burstTokens = Math.min(
      state.burstTokens + tokensToAdd,
      this.config.rateLimit.maxMessagesPerMinute * this.config.rateLimit.burstMultiplier
    );

    // Check message rate
    if (
      state.messagesInWindow >= this.config.rateLimit.maxMessagesPerMinute &&
      state.burstTokens < 1
    ) {
      const connState = this.connections.get(connectionId);
      this.emitAuditEvent({
        type: "rate_limited",
        timestamp: now,
        connectionId,
        userId: connState?.userId,
        remoteAddress: connState?.remoteAddress ?? "unknown",
        details: { reason: "message_rate", messagesInWindow: state.messagesInWindow },
      });

      const retryAfterMs = windowMs - (now - state.windowStartMs);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 100) };
    }

    // Check byte rate
    const maxBytesWithBurst =
      this.config.rateLimit.maxBytesPerMinute * this.config.rateLimit.burstMultiplier;
    if (state.bytesInWindow + messageBytes > maxBytesWithBurst) {
      const connState = this.connections.get(connectionId);
      this.emitAuditEvent({
        type: "rate_limited",
        timestamp: now,
        connectionId,
        userId: connState?.userId,
        remoteAddress: connState?.remoteAddress ?? "unknown",
        details: { reason: "byte_rate", bytesInWindow: state.bytesInWindow },
      });

      const retryAfterMs = windowMs - (now - state.windowStartMs);
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 100) };
    }

    // Allow and update state
    state.messagesInWindow++;
    state.bytesInWindow += messageBytes;
    if (state.messagesInWindow > this.config.rateLimit.maxMessagesPerMinute) {
      state.burstTokens--;
    }

    return { allowed: true };
  }

  /**
   * Record activity for a connection.
   */
  recordActivity(connectionId: string, ws: WebSocket, messageBytes: number): void {
    const state = this.connections.get(connectionId);
    if (state) {
      state.lastActivityAt = Date.now();
      state.messageCount++;
      state.bytesReceived += messageBytes;
      this.config.onConnectionStateChange?.(state, "update");
    }

    // Reset idle timer
    const health = this.healthState.get(connectionId);
    if (health) {
      this.resetIdleTimer(connectionId, ws, health);
    }
  }

  /**
   * Set client ID after handshake.
   */
  setClientId(connectionId: string, clientId: string): void {
    const state = this.connections.get(connectionId);
    if (state) {
      state.clientId = clientId;
      this.config.onConnectionStateChange?.(state, "update");
    }
  }

  /**
   * Unregister a connection.
   */
  unregisterConnection(connectionId: string): void {
    const state = this.connections.get(connectionId);
    if (!state) {
      return;
    }

    // Clear health monitoring
    const health = this.healthState.get(connectionId);
    if (health) {
      if (health.pingTimer) {
        clearInterval(health.pingTimer);
      }
      if (health.idleTimer) {
        clearTimeout(health.idleTimer);
      }
      if (health.maxDurationTimer) {
        clearTimeout(health.maxDurationTimer);
      }
      if (health.handshakeTimer) {
        clearTimeout(health.handshakeTimer);
      }
      this.healthState.delete(connectionId);
    }

    // Decrement user connection count
    const currentCount = this.userConnectionCounts.get(state.userId) ?? 1;
    if (currentCount <= 1) {
      this.userConnectionCounts.delete(state.userId);
    } else {
      this.userConnectionCounts.set(state.userId, currentCount - 1);
    }

    // Emit events
    this.emitAuditEvent({
      type: "connection_closed",
      timestamp: Date.now(),
      connectionId,
      userId: state.userId,
      docId: state.docId,
      remoteAddress: state.remoteAddress,
      details: {
        duration: Date.now() - state.connectedAt,
        messageCount: state.messageCount,
        bytesReceived: state.bytesReceived,
      },
    });

    this.config.onConnectionStateChange?.(state, "disconnect");

    // Clean up
    this.connections.delete(connectionId);
    this.rateLimitState.delete(connectionId);
  }

  /**
   * Get connection state.
   */
  getConnectionState(connectionId: string): ConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all active connections.
   */
  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connections by user.
   */
  getConnectionsByUser(userId: string): ConnectionState[] {
    return Array.from(this.connections.values()).filter((c) => c.userId === userId);
  }

  /**
   * Get connections by document.
   */
  getConnectionsByDocument(docId: string): ConnectionState[] {
    return Array.from(this.connections.values()).filter((c) => c.docId === docId);
  }

  /**
   * Get security metrics.
   */
  getMetrics(): {
    activeConnections: number;
    uniqueUsers: number;
    totalMessagesProcessed: number;
    totalBytesReceived: number;
  } {
    let totalMessages = 0;
    let totalBytes = 0;

    for (const state of this.connections.values()) {
      totalMessages += state.messageCount;
      totalBytes += state.bytesReceived;
    }

    return {
      activeConnections: this.connections.size,
      uniqueUsers: this.userConnectionCounts.size,
      totalMessagesProcessed: totalMessages,
      totalBytesReceived: totalBytes,
    };
  }

  /**
   * Get remote address from request.
   */
  private getRemoteAddress(request: IncomingMessage): string {
    // Check X-Forwarded-For header (for proxied connections)
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) {
      const addresses = typeof forwarded === "string" ? forwarded : forwarded[0];
      const firstAddress = addresses?.split(",")[0]?.trim();
      if (firstAddress) {
        return firstAddress;
      }
    }

    // Check X-Real-IP header
    const realIp = request.headers["x-real-ip"];
    if (realIp) {
      return typeof realIp === "string" ? realIp : (realIp[0] ?? "unknown");
    }

    // Fall back to socket remote address
    return request.socket.remoteAddress ?? "unknown";
  }

  /**
   * Emit an audit event.
   */
  private emitAuditEvent(event: SecurityAuditEvent): void {
    this.config.onAuditEvent?.(event);
  }
}
