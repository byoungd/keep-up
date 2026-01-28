import type { RuntimeEventBus, Subscription } from "@ku0/agent-runtime-control";
import {
  createSubsystemLogger,
  getLogger,
  type Logger,
} from "@ku0/agent-runtime-telemetry/logging";
import type {
  GatewayConnectionHandle,
  GatewayControlAuthConfig,
  GatewayControlAuthMode,
  GatewayControlClient,
  GatewayControlInboundMessage,
  GatewayControlOutboundMessage,
  GatewayControlServerConfig,
  GatewayControlStats,
  GatewayWebSocketLike,
} from "./types";

interface ClientState {
  client: GatewayControlClient;
  socket: GatewayWebSocketLike;
  subscriptions: Subscription[];
}

export class GatewayControlServer {
  private readonly eventBus: RuntimeEventBus;
  private readonly logger: Logger;
  private readonly clients = new Map<string, ClientState>();
  private readonly maxSubscriptions: number;
  private readonly allowPublish: boolean;
  private readonly source?: string;
  private readonly authMode: GatewayControlAuthMode;
  private readonly authToken?: string;
  private clientCounter = 0;
  private totalConnections = 0;
  private messagesIn = 0;
  private messagesOut = 0;
  private lastMessageAt?: number;

  constructor(config: GatewayControlServerConfig) {
    this.eventBus = config.eventBus;
    this.logger = config.logger ?? createSubsystemLogger("gateway", "control");
    this.maxSubscriptions = config.maxSubscriptions ?? 50;
    this.allowPublish = config.allowPublish ?? false;
    this.source = config.source;
    const auth = normalizeAuthConfig(config.auth);
    this.authMode = auth.mode;
    this.authToken = auth.token;
  }

  handleConnection(
    socket: GatewayWebSocketLike,
    options?: { clientId?: string; userAgent?: string; subscriptions?: string[] }
  ): GatewayConnectionHandle {
    const clientId = options?.clientId ?? this.generateClientId();
    const client: GatewayControlClient = {
      id: clientId,
      userAgent: options?.userAgent,
      subscriptions: new Set(),
      authenticated: !this.isAuthRequired(),
    };

    const state: ClientState = { client, socket, subscriptions: [] };
    this.clients.set(clientId, state);
    this.totalConnections += 1;

    if (options?.subscriptions && options.subscriptions.length > 0) {
      if (this.isAuthenticated(state)) {
        this.addSubscriptions(state, options.subscriptions);
      } else {
        this.sendUnauthorized(state.socket, "Authentication required");
      }
    }

    this.sendWelcome(state);

    this.logger.info("Gateway client connected", {
      clientId,
      userAgent: options?.userAgent,
    });

    return {
      clientId,
      onMessage: (data) => this.handleMessage(state, data),
      onClose: () => this.handleClose(state),
    };
  }

  broadcast(message: GatewayControlOutboundMessage): void {
    for (const state of this.clients.values()) {
      this.sendMessage(state.socket, message);
    }
  }

  closeAll(code?: number, reason?: string): void {
    for (const state of this.clients.values()) {
      state.socket.close(code, reason);
      this.cleanupClient(state.client.id);
    }
  }

  private handleMessage(state: ClientState, raw: string): void {
    const message = this.parseMessage(raw, state.client.id);
    if (!message) {
      return;
    }

    this.messagesIn += 1;
    this.lastMessageAt = Date.now();

    switch (message.type) {
      case "hello":
        if (message.token) {
          this.tryAuthenticate(state, message.token);
        }
        if (!this.isAuthenticated(state)) {
          this.sendUnauthorized(state.socket, "Authentication required");
          return;
        }
        if (message.subscriptions?.length) {
          this.addSubscriptions(state, message.subscriptions);
        }
        this.sendWelcome(state);
        return;
      case "auth":
        this.tryAuthenticate(state, message.token);
        return;
      case "subscribe":
        if (!this.isAuthenticated(state)) {
          this.sendUnauthorized(state.socket, "Authentication required");
          return;
        }
        this.addSubscriptions(state, message.patterns);
        this.sendMessage(state.socket, {
          type: "subscribed",
          patterns: message.patterns,
        });
        return;
      case "publish":
        if (!this.isAuthenticated(state)) {
          this.sendUnauthorized(state.socket, "Authentication required");
          return;
        }
        if (!this.allowPublish) {
          this.sendMessage(state.socket, {
            type: "error",
            code: "UNSUPPORTED",
            message: "Publishing is disabled",
          });
          return;
        }
        this.eventBus.emitRaw(message.event.type, message.event.payload, {
          source: message.event.meta?.source ?? this.source ?? state.client.id,
          correlationId: message.event.meta?.correlationId,
          priority: message.event.meta?.priority,
        });
        return;
      case "ping":
        this.sendMessage(state.socket, {
          type: "pong",
          nonce: message.nonce,
          serverTime: Date.now(),
        });
        return;
      default:
        this.sendMessage(state.socket, {
          type: "error",
          code: "UNSUPPORTED",
          message: "Unsupported message type",
        });
    }
  }

  private handleClose(state: ClientState): void {
    this.cleanupClient(state.client.id);
    this.logger.info("Gateway client disconnected", { clientId: state.client.id });
  }

  private cleanupClient(clientId: string): void {
    const state = this.clients.get(clientId);
    if (!state) {
      return;
    }
    for (const subscription of state.subscriptions) {
      subscription.unsubscribe();
    }
    this.clients.delete(clientId);
  }

  private addSubscriptions(state: ClientState, patterns: string[]): void {
    const unique = patterns.filter((pattern) => pattern.trim().length > 0);
    if (unique.length === 0) {
      return;
    }

    const remaining = this.maxSubscriptions - state.client.subscriptions.size;
    if (remaining <= 0) {
      this.sendMessage(state.socket, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "Subscription limit exceeded",
      });
      return;
    }

    const allowed = unique.slice(0, remaining);
    for (const pattern of allowed) {
      if (state.client.subscriptions.has(pattern)) {
        continue;
      }
      const subscription = this.eventBus.subscribe(pattern, (event) => {
        this.sendMessage(state.socket, { type: "event", event });
      });
      state.client.subscriptions.add(pattern);
      state.subscriptions.push(subscription);
    }
  }

  private parseMessage(raw: string, clientId: string): GatewayControlInboundMessage | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("Gateway client sent invalid JSON", { clientId, error: String(error) });
      return null;
    }

    if (!parsed || typeof parsed !== "object") {
      this.sendMessage(this.clients.get(clientId)?.socket, {
        type: "error",
        code: "INVALID_MESSAGE",
        message: "Invalid message payload",
      });
      return null;
    }

    return parsed as GatewayControlInboundMessage;
  }

  getStats(): GatewayControlStats {
    let totalSubscriptions = 0;
    for (const state of this.clients.values()) {
      totalSubscriptions += state.client.subscriptions.size;
    }

    return {
      connectedClients: this.clients.size,
      totalConnections: this.totalConnections,
      totalSubscriptions,
      messagesIn: this.messagesIn,
      messagesOut: this.messagesOut,
      lastMessageAt: this.lastMessageAt,
    };
  }

  private sendWelcome(state: ClientState): void {
    this.sendMessage(state.socket, {
      type: "welcome",
      clientId: state.client.id,
      serverTime: Date.now(),
      subscriptions: Array.from(state.client.subscriptions),
      authRequired: this.isAuthRequired(),
      authenticated: state.client.authenticated,
    });
  }

  private isAuthRequired(): boolean {
    return this.authMode === "token";
  }

  private isAuthenticated(state: ClientState): boolean {
    return !this.isAuthRequired() || state.client.authenticated;
  }

  private tryAuthenticate(state: ClientState, token: string | undefined): void {
    if (!this.isAuthRequired()) {
      state.client.authenticated = true;
      this.sendMessage(state.socket, {
        type: "auth_ok",
        clientId: state.client.id,
        serverTime: Date.now(),
      });
      return;
    }

    if (!token || token !== this.authToken) {
      this.sendUnauthorized(state.socket, "Invalid token");
      return;
    }

    state.client.authenticated = true;
    this.sendMessage(state.socket, {
      type: "auth_ok",
      clientId: state.client.id,
      serverTime: Date.now(),
    });
  }

  private sendMessage(
    socket: GatewayWebSocketLike | undefined,
    message: GatewayControlOutboundMessage
  ): void {
    if (!socket) {
      return;
    }
    try {
      socket.send(JSON.stringify(message));
      this.messagesOut += 1;
    } catch (error) {
      this.logger.warn("Failed to send gateway message", { error: String(error) });
    }
  }

  private sendUnauthorized(socket: GatewayWebSocketLike, message: string): void {
    this.sendMessage(socket, {
      type: "error",
      code: "UNAUTHORIZED",
      message,
    });
  }

  private generateClientId(): string {
    this.clientCounter += 1;
    return `gw-${Date.now().toString(36)}-${this.clientCounter}`;
  }
}

export function createGatewayControlServer(
  config: GatewayControlServerConfig
): GatewayControlServer {
  return new GatewayControlServer(config);
}

export function attachGatewayWebSocket(
  server: GatewayControlServer,
  socket: GatewayWebSocketLike,
  options?: { clientId?: string; userAgent?: string; subscriptions?: string[] }
): GatewayConnectionHandle {
  return server.handleConnection(socket, options);
}

export function resolveGatewayLogger(logger?: Logger): Logger {
  return logger ?? getLogger("gateway-control");
}

function normalizeAuthConfig(config?: GatewayControlAuthConfig): GatewayControlAuthConfig {
  if (!config) {
    return { mode: "none" };
  }
  if (config.mode === "token" && config.token) {
    return config;
  }
  return { mode: "none" };
}
