import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import http from "node:http";
import https from "node:https";
import { createSubsystemLogger, type Logger } from "@ku0/agent-runtime-telemetry/logging";
import type { RawData, WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { ChannelRegistry } from "../channels/registry";
import type { ChannelMessage, ChannelRegistryStatus } from "../channels/types";
import { GatewayClientRegistry, type GatewayWebSocketLike } from "../clients/client-registry";
import {
  createGatewayEvent,
  type GatewayError,
  type GatewayEventEnvelope,
  type GatewayRequestEnvelope,
  type GatewayRequestId,
  type GatewayResponseEnvelope,
  isGatewayRequest,
} from "../protocol/envelope";
import type { ChannelRouteHandler, ChannelRouter } from "../routing/router";

export type GatewayBindMode = "loopback" | "lan" | "tailnet" | "auto";
export type GatewayAuthMode = "none" | "token" | "password";

export interface GatewayAuthConfig {
  mode: GatewayAuthMode;
  token?: string;
  password?: string;
}

export interface GatewayTlsConfig {
  keyPath: string;
  certPath: string;
  caPath?: string;
}

export interface GatewayHttpChannelConfig {
  enabled?: boolean;
  basePath?: string;
  maxBodyBytes?: number;
}

export interface GatewayServerConfig {
  port?: number;
  bind?: GatewayBindMode;
  auth?: GatewayAuthConfig;
  tls?: GatewayTlsConfig;
  logger?: Logger;
  presenceIntervalMs?: number;
  maxSubscriptions?: number;
  channelRegistry?: ChannelRegistry;
  channelRouter?: ChannelRouter;
  channelRouteHandler?: ChannelRouteHandler;
  enableWebSocketChannel?: boolean;
  httpChannel?: GatewayHttpChannelConfig;
}

export interface GatewayServerStats {
  connectedClients: number;
  totalConnections: number;
  messagesIn: number;
  messagesOut: number;
  lastMessageAt?: number;
}

export interface GatewayHealthSnapshot {
  ok: boolean;
  now: number;
  uptimeMs: number;
  stats: GatewayServerStats;
  channels?: ChannelRegistryStatus;
}

export interface GatewayConnectionHandle {
  clientId: string;
  onMessage: (data: string) => void;
  onClose: () => void;
}

export interface GatewayServerHandle {
  server: http.Server | https.Server;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

export type GatewayMethodHandler = (
  params: unknown,
  context: GatewayMethodContext
) => Promise<unknown> | unknown;

export interface GatewayMethodDefinition {
  handler: GatewayMethodHandler;
  description?: string;
  requiresAuth?: boolean;
}

export interface GatewayMethodContext {
  clientId: string;
  userAgent?: string;
  authenticated: boolean;
  server: GatewayServer;
}

interface ClientState {
  clientId: string;
  socket: GatewayWebSocketLike;
}

export class GatewayServer {
  private readonly logger: Logger;
  private readonly registry: GatewayClientRegistry;
  private readonly channelRegistry?: ChannelRegistry;
  private readonly channelRouter?: ChannelRouter;
  private readonly channelRouteHandler?: ChannelRouteHandler;
  private readonly authMode: GatewayAuthMode;
  private readonly authToken?: string;
  private readonly authPassword?: string;
  private readonly presenceIntervalMs: number;
  private readonly methods = new Map<string, GatewayMethodDefinition>();
  private clientCounter = 0;
  private totalConnections = 0;
  private messagesIn = 0;
  private messagesOut = 0;
  private lastMessageAt?: number;
  private startedAt = Date.now();
  private presenceTimer?: NodeJS.Timeout;

  constructor(config: GatewayServerConfig = {}) {
    this.logger = config.logger ?? createSubsystemLogger("gateway", "server");
    this.registry = new GatewayClientRegistry({
      logger: this.logger,
      maxSubscriptions: config.maxSubscriptions,
    });
    this.channelRegistry = config.channelRegistry;
    this.channelRouter = config.channelRouter;
    this.channelRouteHandler = config.channelRouteHandler;
    this.presenceIntervalMs = config.presenceIntervalMs ?? 5000;

    const auth = normalizeAuthConfig(config.auth);
    this.authMode = auth.mode;
    this.authToken = auth.token;
    this.authPassword = auth.password;

    this.registerCoreMethods();

    if (config.enableWebSocketChannel !== false && this.channelRegistry && this.channelRouter) {
      this.registerWebSocketChannelHandlers();
    }
  }

  registerMethod(name: string, definition: GatewayMethodDefinition): void {
    if (this.methods.has(name)) {
      throw new Error(`Gateway method already registered: ${name}`);
    }
    this.methods.set(name, definition);
  }

  handleConnection(
    socket: GatewayWebSocketLike,
    options?: { clientId?: string; userAgent?: string; subscriptions?: string[]; token?: string }
  ): GatewayConnectionHandle {
    const clientId = options?.clientId ?? this.generateClientId();
    const authenticated = this.isAuthRequired() ? this.verifyToken(options?.token) : true;

    this.registry.registerClient(socket, {
      clientId,
      userAgent: options?.userAgent,
      authenticated,
    });
    this.totalConnections += 1;

    if (options?.subscriptions && options.subscriptions.length > 0) {
      if (!authenticated) {
        this.sendError(clientId, "UNAUTHORIZED", "Authentication required");
      } else {
        this.registry.addSubscriptions(clientId, options.subscriptions);
      }
    }

    return {
      clientId,
      onMessage: (data) => this.handleMessage({ clientId, socket }, data),
      onClose: () => this.handleClose(clientId),
    };
  }

  startPresence(): void {
    if (this.presenceTimer) {
      return;
    }
    this.presenceTimer = setInterval(() => {
      this.broadcastEvent("presence.tick", {
        now: Date.now(),
        clients: this.registry.listClients().length,
      });
    }, this.presenceIntervalMs);
  }

  stopPresence(): void {
    if (!this.presenceTimer) {
      return;
    }
    clearInterval(this.presenceTimer);
    this.presenceTimer = undefined;
  }

  broadcastEvent(event: string, payload: unknown): void {
    const envelope = createGatewayEvent(event, payload);
    const serialized = JSON.stringify(envelope);
    for (const state of this.registry.listSubscribers(event)) {
      try {
        state.socket.send(serialized);
        this.messagesOut += 1;
      } catch (error) {
        this.logger.warn("Failed to send gateway event", { error: String(error), event });
      }
    }
  }

  sendEventToClient(clientId: string, event: GatewayEventEnvelope): void {
    this.registry.sendToClient(clientId, JSON.stringify(event));
    this.messagesOut += 1;
  }

  sendResponse(clientId: string, response: GatewayResponseEnvelope): void {
    this.registry.sendToClient(clientId, JSON.stringify(response));
    this.messagesOut += 1;
  }

  getStats(): GatewayServerStats {
    return {
      connectedClients: this.registry.listClients().length,
      totalConnections: this.totalConnections,
      messagesIn: this.messagesIn,
      messagesOut: this.messagesOut,
      lastMessageAt: this.lastMessageAt,
    };
  }

  getHealthSnapshot(): GatewayHealthSnapshot {
    return {
      ok: true,
      now: Date.now(),
      uptimeMs: Date.now() - this.startedAt,
      stats: this.getStats(),
      channels: this.channelRegistry?.getStatus(),
    };
  }

  closeAll(code?: number, reason?: string): void {
    for (const client of this.registry.listClients()) {
      const state = this.registry.getState(client.id);
      state?.socket.close(code, reason);
      this.registry.removeClient(client.id);
    }
  }

  private handleMessage(state: ClientState, raw: string): void {
    const parsed = this.parseMessage(raw, state.clientId);
    if (!parsed) {
      return;
    }

    this.messagesIn += 1;
    this.lastMessageAt = Date.now();
    this.registry.updateLastMessage(state.clientId, this.lastMessageAt);

    const method = this.methods.get(parsed.method);
    if (!method) {
      this.sendError(state.clientId, "UNSUPPORTED", "Unsupported method", parsed.id);
      return;
    }

    if (method.requiresAuth !== false && !this.isAuthenticated(state.clientId)) {
      this.sendError(state.clientId, "UNAUTHORIZED", "Authentication required", parsed.id);
      return;
    }

    const context: GatewayMethodContext = {
      clientId: state.clientId,
      userAgent: this.registry.getClient(state.clientId)?.userAgent,
      authenticated: this.isAuthenticated(state.clientId),
      server: this,
    };

    Promise.resolve(method.handler(parsed.params, context))
      .then((result) => {
        this.sendResponse(state.clientId, {
          id: parsed.id,
          result,
        });
      })
      .catch((error: Error) => {
        this.logger.warn("Gateway method failed", { error: String(error), method: parsed.method });
        if (error instanceof GatewayMethodError) {
          this.sendError(state.clientId, error.code, error.message, parsed.id);
          return;
        }
        this.sendError(state.clientId, "FAILED", "Gateway method failed", parsed.id);
      });
  }

  private handleClose(clientId: string): void {
    this.registry.removeClient(clientId);
    this.logger.info("Gateway client disconnected", { clientId });
  }

  private registerCoreMethods(): void {
    this.registerMethod("ping", {
      requiresAuth: false,
      handler: () => ({ pong: true, serverTime: Date.now() }),
    });

    this.registerMethod("auth", {
      requiresAuth: false,
      handler: (params, context) => {
        const token = typeof params === "string" ? params : (params as { token?: string })?.token;
        const password =
          typeof params === "string" ? params : (params as { password?: string })?.password;

        if (this.authMode === "none") {
          this.registry.markAuthenticated(context.clientId);
          return { authenticated: true };
        }

        const ok =
          this.authMode === "token" ? token === this.authToken : password === this.authPassword;

        if (!ok) {
          throw new GatewayMethodError("UNAUTHORIZED", "Invalid credentials");
        }

        this.registry.markAuthenticated(context.clientId);
        return { authenticated: true };
      },
    });

    this.registerMethod("subscribe", {
      handler: (params, context) => {
        const patterns = (params as { patterns?: string[] })?.patterns ?? [];
        const { added, rejected } = this.registry.addSubscriptions(context.clientId, patterns);
        return { added, rejected };
      },
    });

    this.registerMethod("unsubscribe", {
      handler: (params, context) => {
        const patterns = (params as { patterns?: string[] })?.patterns ?? [];
        const removed = this.registry.removeSubscriptions(context.clientId, patterns);
        return { removed };
      },
    });

    this.registerMethod("channel.list", {
      handler: () => {
        if (!this.channelRegistry) {
          return { channels: [], total: 0, running: 0, healthy: 0 };
        }
        return this.channelRegistry.getStatus();
      },
    });
  }

  private registerWebSocketChannelHandlers(): void {
    if (!this.channelRegistry || !this.channelRouter) {
      return;
    }
    this.registerMethod("channel.message", {
      handler: async (params) => {
        const message = toChannelMessage(params);
        if (!message) {
          throw new Error("Invalid channel message payload");
        }
        if (!this.channelRouteHandler) {
          throw new Error("Missing channel route handler");
        }
        return this.channelRouter?.handleMessage(message, this.channelRouteHandler);
      },
    });
  }

  private parseMessage(raw: string, clientId: string): GatewayRequestEnvelope | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.logger.warn("Gateway client sent invalid JSON", { clientId, error: String(error) });
      this.sendError(clientId, "INVALID_MESSAGE", "Invalid JSON payload");
      return null;
    }

    if (!parsed || typeof parsed !== "object") {
      this.sendError(clientId, "INVALID_MESSAGE", "Invalid message payload");
      return null;
    }

    if (!isGatewayRequest(parsed)) {
      const id = (parsed as { id?: GatewayRequestId }).id;
      this.sendError(clientId, "INVALID_MESSAGE", "Invalid request envelope", id);
      return null;
    }

    return parsed;
  }

  private isAuthenticated(clientId: string): boolean {
    return !this.isAuthRequired() || this.registry.getClient(clientId)?.authenticated === true;
  }

  private isAuthRequired(): boolean {
    return this.authMode !== "none";
  }

  private verifyToken(token?: string): boolean {
    if (!this.isAuthRequired()) {
      return true;
    }
    if (this.authMode === "token") {
      return Boolean(token && token === this.authToken);
    }
    return Boolean(token && token === this.authPassword);
  }

  private sendError(
    clientId: string,
    code: GatewayErrorCode,
    message: string,
    requestId?: GatewayRequestId
  ): void {
    const error: GatewayError = { code, message };
    if (requestId !== undefined) {
      this.sendResponse(clientId, { id: requestId, error });
      return;
    }
    this.sendEventToClient(clientId, createGatewayEvent("gateway.error", { error }));
  }

  private generateClientId(): string {
    this.clientCounter += 1;
    return `gw-${Date.now().toString(36)}-${this.clientCounter}`;
  }
}

export function startGatewayServer(config: GatewayServerConfig): GatewayServerHandle {
  const logger = config.logger ?? createSubsystemLogger("gateway", "ws");
  const gateway = new GatewayServer(config);
  const bindAddress = resolveBindAddress(config.bind);
  const port = config.port ?? 18789;
  const httpChannel = normalizeHttpChannelConfig(config.httpChannel);

  const server = config.tls
    ? https.createServer(loadTlsConfig(config.tls), (req, res) => {
        handleHttpRequest(
          req,
          res,
          gateway,
          httpChannel,
          config.channelRouter,
          config.channelRouteHandler
        );
      })
    : http.createServer((req, res) => {
        handleHttpRequest(
          req,
          res,
          gateway,
          httpChannel,
          config.channelRouter,
          config.channelRouteHandler
        );
      });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket: WebSocket, request) => {
    const incoming = request as IncomingMessage;
    const { clientId, subscriptions, token } = parseQuery(incoming);
    const handle = gateway.handleConnection(socket, {
      clientId,
      subscriptions,
      userAgent: incoming.headers["user-agent"],
      token,
    });

    socket.on("message", (data: RawData) => {
      const payload = typeof data === "string" ? data : data.toString();
      handle.onMessage(payload);
    });

    socket.on("close", () => {
      handle.onClose();
    });
  });

  wss.on("listening", () => {
    logger.info("Gateway WS server listening", { port, bind: bindAddress });
  });

  wss.on("error", (error: Error) => {
    logger.error("Gateway WS server error", error);
  });

  gateway.startPresence();

  server.listen(port, bindAddress);

  return {
    server,
    wss,
    close: () =>
      new Promise((resolve, reject) => {
        gateway.stopPresence();
        wss.close((err?: Error) => {
          if (err) {
            reject(err);
            return;
          }
          server.close((serverError?: Error) => {
            if (serverError) {
              reject(serverError);
              return;
            }
            resolve();
          });
        });
      }),
  };
}

class GatewayMethodError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type GatewayErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FAILED";

function normalizeAuthConfig(config?: GatewayAuthConfig): GatewayAuthConfig {
  if (!config) {
    return { mode: "none" };
  }
  if (config.mode === "token") {
    return { mode: "token", token: config.token };
  }
  if (config.mode === "password") {
    return { mode: "password", password: config.password };
  }
  return { mode: "none" };
}

function normalizeHttpChannelConfig(config?: GatewayHttpChannelConfig): GatewayHttpChannelConfig {
  return {
    enabled: config?.enabled ?? false,
    basePath: config?.basePath ?? "/channels",
    maxBodyBytes: config?.maxBodyBytes ?? 1024 * 1024,
  };
}

function resolveBindAddress(mode?: GatewayBindMode): string {
  switch (mode) {
    case "lan":
      return "0.0.0.0";
    case "tailnet":
      return process.env.GATEWAY_TAILNET_BIND ?? "0.0.0.0";
    case "auto":
      return "127.0.0.1";
    default:
      return "127.0.0.1";
  }
}

function loadTlsConfig(config: GatewayTlsConfig): https.ServerOptions {
  return {
    key: fs.readFileSync(config.keyPath),
    cert: fs.readFileSync(config.certPath),
    ca: config.caPath ? fs.readFileSync(config.caPath) : undefined,
  };
}

function parseQuery(request: IncomingMessage): {
  clientId?: string;
  subscriptions?: string[];
  token?: string;
} {
  const url = request.url;
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url, "http://localhost");
    const clientId = parsed.searchParams.get("clientId") ?? undefined;
    const subscriptionsParam = parsed.searchParams.get("subscriptions");
    const token = parsed.searchParams.get("token") ?? undefined;
    const subscriptions = subscriptionsParam
      ? subscriptionsParam
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined;
    return { clientId, subscriptions, token };
  } catch {
    return {};
  }
}

function handleHttpRequest(
  request: IncomingMessage,
  response: http.ServerResponse,
  gateway: GatewayServer,
  httpChannel: GatewayHttpChannelConfig,
  router?: ChannelRouter,
  routeHandler?: ChannelRouteHandler
): void {
  if (request.method === "GET" && request.url?.startsWith("/health")) {
    respondJson(response, 200, gateway.getHealthSnapshot());
    return;
  }

  if (!httpChannel.enabled || !router || !routeHandler) {
    respondJson(response, 404, { error: "Not found" });
    return;
  }

  if (request.method !== "POST") {
    respondJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const url = request.url ?? "";
  const { channelId, suffix } = parseChannelPath(url, httpChannel.basePath ?? "/channels");
  if (!channelId || suffix !== "messages") {
    respondJson(response, 404, { error: "Unknown channel path" });
    return;
  }

  readJsonBody(request, httpChannel.maxBodyBytes ?? 1024 * 1024)
    .then(async (body) => {
      const message = toChannelMessage({ ...body, channelId });
      if (!message) {
        respondJson(response, 400, { error: "Invalid channel message payload" });
        return;
      }
      const result = await router.handleMessage(message, routeHandler);
      respondJson(response, 200, result);
    })
    .catch((error: Error) => {
      respondJson(response, 400, { error: String(error.message || error) });
    });
}

function parseChannelPath(url: string, basePath: string): { channelId?: string; suffix?: string } {
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  if (!url.startsWith(normalizedBase)) {
    return {};
  }
  const trimmed = url.slice(normalizedBase.length);
  const parts = trimmed.split("/").filter(Boolean);
  return { channelId: parts[0], suffix: parts[1] };
}

function readJsonBody(
  request: IncomingMessage,
  maxBytes: number
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let payload = "";
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      payload += chunk.toString();
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        resolve(parsed);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid JSON"));
      }
    });
    request.on("error", (error) => reject(error));
  });
}

function respondJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function toChannelMessage(params: unknown): ChannelMessage | null {
  if (!params || typeof params !== "object") {
    return null;
  }
  const candidate = params as Partial<ChannelMessage>;
  if (!candidate.channelId || !candidate.conversationId || typeof candidate.text !== "string") {
    return null;
  }
  return {
    channelId: candidate.channelId,
    conversationId: candidate.conversationId,
    peerId: candidate.peerId,
    text: candidate.text,
    timestamp: candidate.timestamp ?? Date.now(),
    raw: candidate.raw,
  };
}
