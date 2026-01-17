/**
 * LFCC v0.9 RC - Collaboration Server
 *
 * Production-ready WebSocket server wrapping @ku0/core SyncServer.
 * Integrates JWT authentication, file-system persistence, and protocol enforcement.
 */

import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { SyncServer, type SyncServerConfig } from "@ku0/core/sync/server";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { RotatingFileAuditStore, type RotatingFileAuditStoreConfig } from "./audit";
import { JwtAuthAdapter, type JwtAuthConfig } from "./auth";
import { CollabRelay } from "./collabRelay";
import { MetricsCollector } from "./metrics";
import { FileSystemPersistenceAdapter } from "./persistence";
import { validateProtocolVersion } from "./protocol/versionGuard";
import { type RolloutPolicyConfig, RolloutPolicyEngine, type RolloutPolicyInput } from "./rollout";

/** Collaboration server configuration */
export interface CollabServerConfig {
  /** HTTP port to listen on */
  port: number;
  /** JWT secret for authentication */
  jwtSecret: string;
  /** Storage path for persistence (default: ".lfcc/storage") */
  storagePath?: string;
  /** CORS origins (default: ["*"]) */
  corsOrigins?: string[];
  /** Server configuration overrides */
  syncServerConfig?: Partial<SyncServerConfig>;
  /** Allow connections without JWT (dev mode) */
  allowAnonymous?: boolean;
  /** Environment (dev/staging/prod) - affects rollout policy defaults */
  environment?: "dev" | "staging" | "prod";
  /** Rollout policy configuration */
  rolloutPolicy?: Partial<RolloutPolicyConfig>;
  /** Enable metrics endpoint (default: true in dev, false in prod) */
  enableMetrics?: boolean;
  /** Admin token for protected endpoints (required for /metrics and /audit in prod) */
  adminToken?: string;
  /** Audit store configuration */
  auditConfig?: Partial<RotatingFileAuditStoreConfig>;
  /** Enable audit logging (default: true) */
  enableAudit?: boolean;
}

/** Active connection tracking */
interface ActiveConnection {
  ws: WebSocket;
  docId: string;
  clientId: string | null;
  pendingId: string;
}

type HandshakePayload = {
  client_manifest_v09?: { lfcc_version?: string };
  client_manifest_hash?: string;
  userMeta?: Record<string, unknown>;
};

type ClientMessage = {
  type?: string;
  version?: string;
  clientId?: string;
  payload?: HandshakePayload;
};

type WebSocketAdapter = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

const AI_ORIGIN_PREFIX = "lfcc:ai";

type PollingPullRequest = {
  docId?: string;
  fromFrontierTag?: string;
  preferSnapshot?: boolean;
  token?: string;
  clientId?: string;
};

/** Validated pull request with required fields guaranteed */
type ValidatedPollingPullRequest = PollingPullRequest & {
  docId: string;
};

type PollingPullResponse =
  | {
      ok: true;
      hasUpdates: boolean;
      frontierTag: string;
      role?: "viewer" | "editor" | "admin";
      isSnapshot?: boolean;
      dataB64?: string;
      updateCount?: number;
    }
  | { ok: false; error: string };

type PollingPushRequest = {
  docId?: string;
  updateData?: string;
  isBase64?: boolean;
  frontierTag?: string;
  parentFrontierTag?: string;
  sizeBytes?: number;
  origin?: string;
  token?: string;
  clientId?: string;
};

/** Validated push request with required fields guaranteed */
type ValidatedPollingPushRequest = PollingPushRequest & {
  docId: string;
  updateData: string;
  isBase64: boolean;
  frontierTag: string;
  parentFrontierTag: string;
};

type PollingPushResponse =
  | {
      ok: true;
      applied: boolean;
      serverFrontierTag: string;
      role?: "viewer" | "editor" | "admin";
      rejectionReason?: string;
    }
  | { ok: false; error: string };

/**
 * Production WebSocket collaboration server.
 */
export class CollabServer {
  private config: Required<
    Omit<CollabServerConfig, "syncServerConfig" | "rolloutPolicy" | "auditConfig">
  > & {
    syncServerConfig: Partial<SyncServerConfig>;
    rolloutPolicy: Partial<RolloutPolicyConfig>;
    auditConfig: Partial<RotatingFileAuditStoreConfig>;
  };
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private syncServer: SyncServer;
  private persistence: FileSystemPersistenceAdapter;
  private authAdapter: JwtAuthAdapter;
  private connections = new Map<WebSocket, ActiveConnection>();
  /** Collab relay for simplified message broadcasting (MVP) */
  private collabRelay = new CollabRelay();
  /** Metrics collector for observability */
  private metrics = new MetricsCollector();
  /** Rollout policy engine */
  private rolloutEngine: RolloutPolicyEngine;
  /** Audit store for durable audit logging */
  private auditStore: RotatingFileAuditStore | null = null;

  constructor(config: CollabServerConfig) {
    const environment = config.environment ?? "dev";
    const isProd = environment === "prod";

    this.config = {
      port: config.port,
      jwtSecret: config.jwtSecret,
      storagePath: config.storagePath ?? ".lfcc/storage",
      corsOrigins: config.corsOrigins ?? ["*"],
      syncServerConfig: config.syncServerConfig ?? {},
      allowAnonymous: config.allowAnonymous ?? false,
      environment,
      rolloutPolicy: config.rolloutPolicy ?? {},
      enableMetrics: config.enableMetrics ?? !isProd, // Off in prod by default
      adminToken: config.adminToken ?? "",
      auditConfig: config.auditConfig ?? {},
      enableAudit: config.enableAudit ?? true,
    };

    // Initialize rollout policy engine
    this.rolloutEngine = new RolloutPolicyEngine(this.config.rolloutPolicy);

    // Initialize audit store (if enabled)
    if (this.config.enableAudit) {
      const auditPath =
        this.config.auditConfig.filePath ?? `${this.config.storagePath}/audit/audit.jsonl`;
      this.auditStore = new RotatingFileAuditStore({
        ...this.config.auditConfig,
        filePath: auditPath,
      });
    }

    // Initialize auth adapter
    const authConfig: JwtAuthConfig = {
      secret: this.config.jwtSecret,
      allowMissingToken: this.config.allowAnonymous,
    };
    this.authAdapter = new JwtAuthAdapter(authConfig);

    // Initialize persistence
    this.persistence = new FileSystemPersistenceAdapter(this.config.storagePath);

    // Initialize sync server
    this.syncServer = new SyncServer(
      {
        authAdapter: this.authAdapter,
        ...this.config.syncServerConfig,
      },
      this.persistence
    );
  }

  /**
   * Start the server.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server
        this.httpServer = createServer((req, res) => {
          void this.handleHttpRequest(req, res);
        });

        // Create WebSocket server
        this.wss = new WebSocketServer({ server: this.httpServer });

        this.wss.on("connection", (ws, request) => {
          this.handleConnection(ws, request);
        });

        this.wss.on("error", (error) => {
          console.error("[CollabServer] WebSocket server error:", error);
        });

        // Start listening
        this.httpServer.listen(this.config.port, () => {
          console.info(`[CollabServer] Listening on port ${this.config.port}`);
          resolve();
        });

        this.httpServer.on("error", reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle new WebSocket connection.
   */
  private handleConnection(ws: WebSocket, request: { url?: string }): void {
    // Extract docId from URL path (e.g., /doc-123)
    const url = request.url ?? "/";
    const docId = url.replace(/^\//, "") || "default";
    const adapter = this.createWebSocketAdapter(ws);
    const pendingId = this.syncServer.handleConnection(adapter, docId);

    const connection: ActiveConnection = {
      ws,
      docId,
      clientId: null,
      pendingId,
    };
    this.connections.set(ws, connection);

    // Handle messages
    ws.on("message", async (data) => {
      await this.handleSocketMessage(ws, data, connection, docId);
    });

    // Handle close
    ws.on("close", () => {
      const conn = this.connections.get(ws);
      if (conn) {
        if (conn.clientId) {
          this.syncServer.handleDisconnect(conn.clientId, conn.docId);
        } else {
          this.syncServer.cancelPendingConnection(conn.pendingId);
        }
        this.connections.delete(ws);
      }
      // Remove from collab relay (broadcasts LEAVE message)
      this.collabRelay.removeFromRoom(ws);
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error("[CollabServer] WebSocket error:", error);
    });
  }

  private createWebSocketAdapter(ws: WebSocket): WebSocketAdapter {
    return {
      send: (data: string) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      },
      close: (code?: number, reason?: string) => {
        ws.close(code, reason);
      },
    };
  }

  private async handleSocketMessage(
    ws: WebSocket,
    data: RawData,
    connection: ActiveConnection,
    docId: string
  ): Promise<void> {
    try {
      const message = data.toString();
      const parsed = JSON.parse(message) as ClientMessage;

      // Try to handle as simplified collab message first (MVP)
      if (this.isCollabMessage(parsed)) {
        this.collabRelay.handleMessage(ws, message);
        return;
      }

      if (parsed.type === "handshake") {
        const ok = await this.handleHandshake(parsed, connection, docId, ws);
        if (!ok) {
          return;
        }
      }

      await this.syncServer.handleMessage(
        this.createWebSocketAdapter(ws),
        message,
        connection.clientId ?? undefined
      );
    } catch (error) {
      console.error("[CollabServer] Message handling error:", error);
    }
  }

  /**
   * Check if a message is a simplified collab message (MVP).
   */
  private isCollabMessage(parsed: ClientMessage): boolean {
    return (
      parsed.type === "CRDT_UPDATE" ||
      parsed.type === "JOIN" ||
      parsed.type === "LEAVE" ||
      parsed.type === "PRESENCE"
    );
  }

  private async handleHandshake(
    parsed: ClientMessage,
    connection: ActiveConnection,
    docId: string,
    ws: WebSocket
  ): Promise<boolean> {
    const protocolVersion = parsed.version;
    if (protocolVersion) {
      const versionError = validateProtocolVersion(protocolVersion);
      if (versionError) {
        this.sendProtocolError(ws, docId, parsed.clientId ?? "", {
          code: "PROTOCOL_VERSION_UNSUPPORTED",
          category: "policy",
          message: versionError,
          retryable: false,
        });
        ws.close(1008, "Unsupported protocol version");
        return false;
      }
    }

    const token = parsed.payload?.userMeta?.token;
    const authResult = await this.authAdapter.authenticate({
      token: typeof token === "string" ? token : undefined,
      docId,
      clientId: parsed.clientId ?? "",
    });

    if (!authResult.authenticated) {
      this.sendProtocolError(ws, docId, parsed.clientId ?? "", {
        code: "UNAUTHORIZED",
        category: "auth",
        message: authResult.reason ?? "Authentication failed",
        retryable: false,
      });
      ws.close(1008, "Unauthorized");
      return false;
    }

    connection.clientId = parsed.clientId ?? null;
    return true;
  }

  private sendProtocolError(
    ws: WebSocket,
    docId: string,
    clientId: string,
    payload: {
      code: string;
      category: string;
      message: string;
      retryable: boolean;
    }
  ): void {
    ws.send(
      JSON.stringify({
        version: "1.0.0",
        type: "error",
        docId,
        clientId,
        seq: 0,
        timestamp: new Date().toISOString(),
        payload,
      })
    );
  }

  /**
   * Main HTTP request router.
   */
  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      this.handleOptions(res);
      return;
    }

    if (await this.handleCoreRoutes(req, res, url)) {
      return;
    }

    if (await this.handleAdminAndAuditRoutes(req, res, url)) {
      return;
    }

    this.sendJson(res, 404, { ok: false, error: "Not found" });
  }

  private handleOptions(res: ServerResponse): void {
    this.setCorsHeaders(res);
    res.writeHead(204);
    res.end();
  }

  private async handleCoreRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (req.method === "GET" && url.pathname === "/health") {
      this.setCorsHeaders(res);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "healthy" }));
      return true;
    }

    if (req.method === "POST" && url.pathname === "/sync/pull") {
      await this.handlePollingPull(req, res);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/sync/push") {
      await this.handlePollingPush(req, res);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/collab/config") {
      await this.handleCollabConfig(req, res, url);
      return true;
    }

    return false;
  }

  private async handleAdminAndAuditRoutes(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<boolean> {
    if (req.method === "GET" && url.pathname === "/metrics") {
      await this.handleMetrics(req, res);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/admin/killswitch") {
      await this.handleKillSwitch(req, res);
      return true;
    }

    if (req.method === "POST" && url.pathname === "/admin/rollout") {
      await this.handleRolloutUpdate(req, res);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/audit/export") {
      await this.handleAuditExport(req, res, url);
      return true;
    }

    return false;
  }

  private async parsePollingPullRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<ValidatedPollingPullRequest | null> {
    const body = await this.readJsonBody(req);
    if (!body) {
      this.sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return null;
    }

    const payload = body as PollingPullRequest;
    if (!isString(payload.docId)) {
      this.sendJson(res, 400, { ok: false, error: "docId is required" });
      return null;
    }

    return payload as ValidatedPollingPullRequest;
  }

  private async parsePollingPushRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<ValidatedPollingPushRequest | null> {
    const body = await this.readJsonBody(req);
    if (!body) {
      this.sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return null;
    }

    const payload = body as PollingPushRequest;
    if (!isString(payload.docId)) {
      this.sendJson(res, 400, { ok: false, error: "docId is required" });
      return null;
    }
    if (!isString(payload.updateData)) {
      this.sendJson(res, 400, { ok: false, error: "updateData is required" });
      return null;
    }
    if (!isBoolean(payload.isBase64)) {
      this.sendJson(res, 400, { ok: false, error: "isBase64 is required" });
      return null;
    }
    if (!isString(payload.frontierTag)) {
      this.sendJson(res, 400, { ok: false, error: "frontierTag is required" });
      return null;
    }
    if (!isString(payload.parentFrontierTag)) {
      this.sendJson(res, 400, { ok: false, error: "parentFrontierTag is required" });
      return null;
    }

    return payload as ValidatedPollingPushRequest;
  }

  private async authenticatePollingAccess(
    res: ServerResponse,
    payload: { docId: string; token?: unknown; clientId?: unknown },
    action: "read" | "write"
  ): Promise<{
    docId: string;
    clientId: string;
    token?: string;
    role: "viewer" | "editor" | "admin";
    userId?: string;
  } | null> {
    const docId = payload.docId;
    const token = isString(payload.token) ? payload.token : undefined;
    const clientIdCandidate = isString(payload.clientId)
      ? payload.clientId
      : `polling-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let authResult: Awaited<ReturnType<JwtAuthAdapter["authenticate"]>>;
    try {
      authResult = await this.authAdapter.authenticate({
        docId,
        clientId: clientIdCandidate,
        token,
      });
    } catch (_error) {
      this.sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return null;
    }

    if (!authResult.authenticated) {
      this.sendJson(res, 401, { ok: false, error: authResult.reason ?? "Unauthorized" });
      return null;
    }

    const clientId = isString(payload.clientId)
      ? payload.clientId
      : (authResult.userId ?? clientIdCandidate);

    const canAccess = await this.authAdapter.authorize(
      { docId, clientId, token, meta: { userId: authResult.userId, role: authResult.role } },
      action
    );
    if (!canAccess) {
      this.sendJson(res, 403, {
        ok: false,
        error: action === "read" ? "Read access denied" : "Write access denied",
      });
      return null;
    }

    return {
      docId,
      clientId,
      token,
      role: authResult.role ?? "viewer",
      userId: authResult.userId,
    };
  }

  private async buildPollingPullResponse(
    docId: string,
    role: "viewer" | "editor" | "admin",
    preferSnapshot: boolean,
    fromFrontierTag: string,
    currentFrontierTag: string
  ): Promise<PollingPullResponse> {
    const baseResponse: PollingPullResponse = {
      ok: true,
      hasUpdates: false,
      frontierTag: currentFrontierTag,
      role,
    };

    if (preferSnapshot) {
      const snapshot = await this.persistence.getSnapshot(docId);
      if (!snapshot) {
        return baseResponse;
      }
      return {
        ok: true,
        hasUpdates: true,
        isSnapshot: true,
        dataB64: encodeBase64(snapshot.data),
        frontierTag: snapshot.frontierTag,
        updateCount: 1,
        role,
      };
    }

    const updates = await this.persistence.getUpdatesSince(docId, fromFrontierTag);
    if (updates) {
      return {
        ok: true,
        hasUpdates: true,
        isSnapshot: false,
        dataB64: encodeBase64(updates.data),
        frontierTag: updates.frontierTag,
        updateCount: 1,
        role,
      };
    }

    const snapshot = await this.persistence.getSnapshot(docId);
    if (!snapshot) {
      return baseResponse;
    }

    return {
      ok: true,
      hasUpdates: true,
      isSnapshot: true,
      dataB64: encodeBase64(snapshot.data),
      frontierTag: snapshot.frontierTag,
      updateCount: 1,
      role,
    };
  }

  private async handlePollingPull(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const payload = await this.parsePollingPullRequest(req, res);
    if (!payload) {
      return;
    }

    const auth = await this.authenticatePollingAccess(res, payload, "read");
    if (!auth) {
      return;
    }

    const preferSnapshot = payload.preferSnapshot === true;
    const fromFrontierTag = isString(payload.fromFrontierTag) ? payload.fromFrontierTag : "0";
    const currentFrontierTag = await this.persistence.getCurrentFrontierTag(auth.docId);
    const response = await this.buildPollingPullResponse(
      auth.docId,
      auth.role,
      preferSnapshot,
      fromFrontierTag,
      currentFrontierTag
    );

    this.sendJson(res, 200, response);
  }

  private async handlePollingPush(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const payload = await this.parsePollingPushRequest(req, res);
    if (!payload) {
      return;
    }

    const auth = await this.authenticatePollingAccess(res, payload, "write");
    if (!auth) {
      return;
    }

    const data = payload.isBase64
      ? decodeBase64(payload.updateData)
      : encodeUtf8(payload.updateData);
    const currentFrontierTag = await this.persistence.getCurrentFrontierTag(auth.docId);

    if (payload.parentFrontierTag !== currentFrontierTag) {
      const response: PollingPushResponse = {
        ok: true,
        applied: false,
        serverFrontierTag: currentFrontierTag,
        rejectionReason: "Frontier conflict - please catch up",
        role: auth.role,
      };
      this.sendJson(res, 200, response);
      return;
    }

    try {
      const response = await this.applyPollingUpdate(payload, auth, data);
      this.sendJson(res, 200, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist update";
      this.sendJson(res, 500, { ok: false, error: message });
    }
  }

  private async applyPollingUpdate(
    payload: ValidatedPollingPushRequest,
    auth: {
      docId: string;
      clientId: string;
      role: "viewer" | "editor" | "admin";
      userId?: string;
    },
    data: Uint8Array
  ): Promise<PollingPushResponse> {
    await this.persistence.saveUpdate(auth.docId, data, payload.frontierTag);
    const actorType = payload.origin?.startsWith(AI_ORIGIN_PREFIX) ? "ai" : "human";
    const baseActorId = auth.userId ?? auth.clientId;
    const actorId =
      actorType === "ai" && !baseActorId.startsWith("ai-") ? `ai-${baseActorId}` : baseActorId;
    const summary = payload.origin?.startsWith(AI_ORIGIN_PREFIX) ? payload.origin : undefined;
    const sizeBytes = isNumber(payload.sizeBytes) ? payload.sizeBytes : data.length;

    await this.persistence.appendOperationLog?.({
      id: `poll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      docId: auth.docId,
      actorId,
      actorType,
      opType: "crdt_update",
      ts: Date.now(),
      frontierTag: payload.frontierTag,
      parentFrontierTag: payload.parentFrontierTag,
      sizeBytes,
      summary,
    });

    return {
      ok: true,
      applied: true,
      serverFrontierTag: payload.frontierTag,
      role: auth.role,
    };
  }

  // ============================================================================
  // Rollout Policy and Admin Endpoints
  // ============================================================================

  /**
   * Handle GET /collab/config - Returns rollout policy evaluation for a context.
   */
  private async handleCollabConfig(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    const docId = url.searchParams.get("docId");
    const userId = url.searchParams.get("userId") ?? undefined;
    const teamId = url.searchParams.get("teamId") ?? undefined;
    const clientVersion = url.searchParams.get("clientVersion") ?? undefined;

    if (!docId) {
      this.sendJson(res, 400, { ok: false, error: "docId is required" });
      return;
    }

    const input: RolloutPolicyInput = {
      docId,
      userId,
      teamId,
      environment: this.config.environment,
      clientVersion,
    };

    const result = this.rolloutEngine.evaluate(input);

    // Strip internal reason in prod
    const isProd = this.config.environment === "prod";
    this.sendJson(res, 200, {
      collabEnabled: result.collabEnabled,
      aiCollabEnabled: result.aiCollabEnabled,
      roleDefault: result.roleDefault,
      policyVersion: result.policyVersion,
      ...(isProd ? {} : { reason: result.reason }),
    });
  }

  /**
   * Handle GET /metrics - Returns Prometheus-format metrics.
   * Protected: requires admin token in prod.
   */
  private async handleMetrics(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Check if metrics are enabled
    if (!this.config.enableMetrics) {
      this.sendJson(res, 404, { ok: false, error: "Metrics disabled" });
      return;
    }

    // In prod, require admin token
    if (this.config.environment === "prod") {
      if (!this.validateAdminToken(req)) {
        this.sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
    }

    this.setCorsHeaders(res);
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
    res.end(this.metrics.toPrometheus());
  }

  /**
   * Handle POST /admin/killswitch - Activate/deactivate kill switch.
   * Protected: requires admin token.
   */
  private async handleKillSwitch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.validateAdminToken(req)) {
      this.sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const body = await this.readJsonBody(req);
    if (!body || typeof body.active !== "boolean") {
      this.sendJson(res, 400, { ok: false, error: "active (boolean) is required" });
      return;
    }

    if (body.active) {
      this.rolloutEngine.activateKillSwitch();
      console.warn("[CollabServer] Kill switch ACTIVATED");
    } else {
      this.rolloutEngine.deactivateKillSwitch();
      console.info("[CollabServer] Kill switch deactivated");
    }

    const config = this.rolloutEngine.getConfig();
    this.sendJson(res, 200, {
      ok: true,
      killSwitch: config.killSwitch,
      policyVersion: config.version,
    });
  }

  /**
   * Handle POST /admin/rollout - Update rollout policy configuration.
   * Protected: requires admin token.
   */
  private async handleRolloutUpdate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.validateAdminToken(req)) {
      this.sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const body = await this.readJsonBody(req);
    if (!body) {
      this.sendJson(res, 400, { ok: false, error: "JSON body required" });
      return;
    }

    // Validate and apply rollout config updates
    const updates: Partial<RolloutPolicyConfig> = {};

    if (Array.isArray(body.userAllowlist)) {
      updates.userAllowlist = body.userAllowlist.filter((v): v is string => typeof v === "string");
    }
    if (Array.isArray(body.userDenylist)) {
      updates.userDenylist = body.userDenylist.filter((v): v is string => typeof v === "string");
    }
    if (Array.isArray(body.docAllowlist)) {
      updates.docAllowlist = body.docAllowlist.filter((v): v is string => typeof v === "string");
    }
    if (Array.isArray(body.docDenylist)) {
      updates.docDenylist = body.docDenylist.filter((v): v is string => typeof v === "string");
    }
    if (Array.isArray(body.teamAllowlist)) {
      updates.teamAllowlist = body.teamAllowlist.filter((v): v is string => typeof v === "string");
    }
    if (typeof body.rolloutPercentage === "number") {
      updates.rolloutPercentage = Math.max(0, Math.min(100, body.rolloutPercentage));
    }
    if (typeof body.minClientVersion === "string") {
      updates.minClientVersion = body.minClientVersion;
    }

    this.rolloutEngine.updateConfig(updates);
    console.info("[CollabServer] Rollout policy updated", updates);

    const config = this.rolloutEngine.getConfig();
    this.sendJson(res, 200, {
      ok: true,
      policyVersion: config.version,
      config: {
        userAllowlist: config.userAllowlist,
        userDenylist: config.userDenylist,
        docAllowlist: config.docAllowlist,
        docDenylist: config.docDenylist,
        teamAllowlist: config.teamAllowlist,
        rolloutPercentage: config.rolloutPercentage,
        minClientVersion: config.minClientVersion,
      },
    });
  }

  /**
   * Handle GET /audit/export - Export audit events.
   * Protected: requires admin token.
   */
  private async handleAuditExport(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    // Always require admin token for audit access
    if (!this.validateAdminToken(req)) {
      this.sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    // Check if audit is enabled
    if (!this.auditStore) {
      this.sendJson(res, 404, { ok: false, error: "Audit logging disabled" });
      return;
    }

    const docId = url.searchParams.get("docId") ?? undefined;
    const sinceParam = url.searchParams.get("since");
    const untilParam = url.searchParams.get("until");

    const since = sinceParam ? Number.parseInt(sinceParam, 10) : undefined;
    const until = untilParam ? Number.parseInt(untilParam, 10) : undefined;

    try {
      const events = await this.auditStore.export({ docId, since, until });

      // Return as JSONL for streaming compatibility
      this.setCorsHeaders(res);
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      for (const event of events) {
        res.write(`${JSON.stringify(event)}\n`);
      }
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      this.sendJson(res, 500, { ok: false, error: message });
    }
  }

  /**
   * Validate admin token from Authorization header.
   */
  private validateAdminToken(req: IncomingMessage): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return false;
    }

    // Expect "Bearer <token>"
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return false;
    }

    const token = parts[1];
    return token === this.config.adminToken && token.length > 0;
  }

  private async readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : null);
        } catch {
          resolve(null);
        }
      });
      req.on("error", () => resolve(null));
    });
  }

  private sendJson(res: ServerResponse, status: number, payload: unknown): void {
    this.setCorsHeaders(res);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  private setCorsHeaders(res: ServerResponse): void {
    const origins = this.config.corsOrigins;
    if (origins.length === 0) {
      return;
    }
    const originHeader = origins.includes("*") ? "*" : origins[0];
    res.setHeader("Access-Control-Allow-Origin", originHeader);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  /**
   * Gracefully shutdown the server.
   */
  async shutdown(): Promise<void> {
    console.info("[CollabServer] Shutting down...");

    // Close all connections
    for (const [ws, conn] of this.connections) {
      if (conn.clientId) {
        this.syncServer.handleDisconnect(conn.clientId, conn.docId);
      }
      ws.close(1001, "Server shutdown");
    }
    this.connections.clear();

    // Clear collab relay
    this.collabRelay.clear();

    // Shutdown sync server
    this.syncServer.shutdown();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
      });
    }

    console.info("[CollabServer] Shutdown complete");
  }

  /**
   * Get server statistics.
   */
  getStats(): {
    activeConnections: number;
    pendingConnections: number;
    rooms: number;
    collabRooms: number;
    collabConnections: number;
  } {
    return {
      activeConnections: this.connections.size,
      pendingConnections: this.syncServer.getPendingConnectionsCount(),
      rooms: this.syncServer.getRooms().size,
      collabRooms: this.collabRelay.getRoomIds().length,
      collabConnections: this.collabRelay.getTotalConnections(),
    };
  }
}

function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function decodeBase64(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64"));
}

function encodeUtf8(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
