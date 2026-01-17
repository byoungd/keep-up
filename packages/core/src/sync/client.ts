/**
 * LFCC v0.9 RC - Sync Client Adapter
 *
 * WebSocket client for Loro document synchronization.
 */

import { LfccError } from "../errors.js";
import {
  computePolicyManifestHash,
  type PolicyManifestV09,
  validateManifest,
} from "../kernel/policy/index.js";
import { getLogger } from "../observability/logger.js";
import { getMetrics, hasMetricsRegistry } from "../observability/metrics.js";
import { base64Decode, base64Encode } from "./encoding.js";
import { createDefaultSyncManifest, negotiateManifests } from "./negotiate.js";
import {
  type CatchUpRequestPayload,
  type CatchUpResponseMessage,
  type ClientCapabilities,
  type CursorPosition,
  createMessage,
  type DocAckMessage,
  type DocUpdateMessage,
  type DocUpdatePayload,
  deserializeMessage,
  type ErrorMessage,
  type HandshakeAckMessage,
  type HandshakePayload,
  type PresenceAckMessage,
  type PresencePayload,
  type SelectionRange,
  type SyncMessage,
  serializeMessage,
  type UserMeta,
} from "./protocol.js";
import { validateClientInboundMessage } from "./validation.js";

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_PING_INTERVAL_MS = 30000;
const DEFAULT_RECONNECT_MAX_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;
const INVALID_MESSAGE_METRIC = "lfcc_sync_invalid_messages_total";

/** Sync client configuration */
export type SyncClientConfig = {
  /** WebSocket URL */
  url: string;
  /** Document ID */
  docId: string;
  /** Client ID (generated if not provided) */
  clientId?: string;
  /** Policy manifest */
  policyManifest?: PolicyManifestV09;
  /** Client capabilities */
  capabilities?: Partial<ClientCapabilities>;
  /** User metadata */
  userMeta?: UserMeta;
  /** Authorization token */
  token?: string;
  /** Reconnect options */
  reconnect?: {
    enabled: boolean;
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  /** Ping interval in ms */
  pingIntervalMs?: number;
};

type ResolvedSyncClientConfig = Omit<Required<SyncClientConfig>, "token"> & { token?: string };

/** Sync client state */
export type SyncClientState =
  | "disconnected"
  | "connecting"
  | "handshaking"
  | "connected"
  | "reconnecting"
  | "error";

/** Sync client events */
export type SyncClientEvents = {
  stateChange: (state: SyncClientState) => void;
  connected: (sessionId: string) => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  remoteUpdate: (data: Uint8Array, frontierTag: string) => void;
  updateAck: (seq: number, applied: boolean, reason?: string) => void;
  presenceUpdate: (presences: Array<{ clientId: string; presence: PresencePayload }>) => void;
  catchUpComplete: (isSnapshot: boolean, frontierTag: string) => void;
};

/** Event listener */
type EventListener<K extends keyof SyncClientEvents> = SyncClientEvents[K];

/**
 * Sync client for WebSocket communication
 */
export class SyncClient {
  private config: ResolvedSyncClientConfig;
  private ws: WebSocket | null = null;
  private state: SyncClientState = "disconnected";
  private sessionId: string | null = null;
  private effectiveManifest: PolicyManifestV09 | null = null;
  private lastFrontierTag: string | null = null;
  private serverFrontierTag: string | null = null;
  private role: "viewer" | "editor" | "admin" | null = null;
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingAcks = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
  private listeners = new Map<keyof SyncClientEvents, Set<EventListener<keyof SyncClientEvents>>>();

  constructor(config: SyncClientConfig) {
    this.config = {
      url: config.url,
      docId: config.docId,
      clientId: config.clientId ?? generateClientId(),
      policyManifest: config.policyManifest ?? createDefaultSyncManifest(),
      capabilities: {
        features: [],
        maxUpdateSize: 1024 * 1024,
        supportsBinary: true,
        supportsCompression: false,
        ...config.capabilities,
      },
      userMeta: config.userMeta ?? { userId: "anonymous", displayName: "Anonymous" },
      token: config.token,
      reconnect: {
        enabled: true,
        maxAttempts: DEFAULT_RECONNECT_MAX_ATTEMPTS,
        baseDelayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
        maxDelayMs: DEFAULT_RECONNECT_MAX_DELAY_MS,
        ...config.reconnect,
      },
      pingIntervalMs: config.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS,
    };
  }

  /** Get current state */
  getState(): SyncClientState {
    return this.state;
  }

  /** Get session ID */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Get effective manifest */
  getEffectiveManifest(): PolicyManifestV09 | null {
    return this.effectiveManifest;
  }

  /** Get server frontier tag from the last handshake */
  getServerFrontierTag(): string | null {
    return this.serverFrontierTag;
  }

  /** Get role assigned by the server */
  getRole(): "viewer" | "editor" | "admin" | null {
    return this.role;
  }

  /** Get last frontier tag */
  getLastFrontierTag(): string | null {
    return this.lastFrontierTag;
  }

  /** Add event listener */
  on<K extends keyof SyncClientEvents>(event: K, listener: SyncClientEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener as EventListener<keyof SyncClientEvents>);
  }

  /** Remove event listener */
  off<K extends keyof SyncClientEvents>(event: K, listener: SyncClientEvents[K]): void {
    this.listeners.get(event)?.delete(listener as EventListener<keyof SyncClientEvents>);
  }

  /** Emit event */
  private emit<K extends keyof SyncClientEvents>(
    event: K,
    ...args: Parameters<SyncClientEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        (listener as (...args: unknown[]) => void)(...args);
      }
    }
  }

  /** Connect to server */
  async connect(): Promise<void> {
    if (this.state !== "disconnected" && this.state !== "error" && this.state !== "reconnecting") {
      throw new LfccError("INVALID_STATE", `Cannot connect in state: ${this.state}`, {
        context: { state: this.state },
      });
    }

    this.setState("connecting");

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let connectedHandler: (() => void) | null = null;
        let errorHandler: ((error: Error) => void) | null = null;

        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (connectedHandler) {
            this.off("connected", connectedHandler);
          }
          if (errorHandler) {
            this.off("error", errorHandler);
          }
        };

        const settle = (action: () => void) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          action();
        };

        this.ws.onopen = () => {
          this.setState("handshaking");
          void this.sendHandshake();
        };

        this.ws.onmessage = (event) => {
          void this.handleMessage(event.data as string);
        };

        this.ws.onerror = (_event) => {
          const error = new LfccError("WEBSOCKET_ERROR", "WebSocket error", {
            context: { docId: this.config.docId, clientId: this.config.clientId },
          });
          this.emit("error", error);
          this.ws?.close();
          settle(() => reject(error));
        };

        this.ws.onclose = (event) => {
          this.handleClose(event.code, event.reason);
        };

        // Set up connection timeout
        timeoutId = setTimeout(() => {
          if (this.state === "connecting" || this.state === "handshaking") {
            this.ws?.close();
            settle(() =>
              reject(
                new LfccError("CONNECTION_TIMEOUT", "Connection timeout", {
                  context: { docId: this.config.docId, clientId: this.config.clientId },
                })
              )
            );
          }
        }, DEFAULT_CONNECT_TIMEOUT_MS);

        // Resolve when connected
        connectedHandler = () => {
          settle(() => resolve());
        };
        this.on("connected", connectedHandler);

        errorHandler = (error: Error) => {
          settle(() => reject(error));
        };
        this.on("error", errorHandler);
      } catch (error) {
        this.setState("error");
        reject(
          error instanceof Error
            ? error
            : new LfccError("WEBSOCKET_ERROR", "WebSocket error", { cause: error })
        );
      }
    });
  }

  /** Disconnect from server */
  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.role = null;
    this.setState("disconnected");
    this.emit("disconnected", "Client initiated");
  }

  /** Send document update */
  sendUpdate(
    data: Uint8Array,
    frontierTag: string,
    parentFrontierTag: string,
    origin?: string
  ): number {
    if (this.state !== "connected") {
      throw new LfccError("INVALID_STATE", `Cannot send update in state: ${this.state}`, {
        context: { state: this.state },
      });
    }

    const payload: DocUpdatePayload = {
      updateData: base64Encode(data),
      isBase64: true,
      frontierTag,
      parentFrontierTag,
      sizeBytes: data.length,
      origin,
    };

    const msg = createMessage("doc_update", this.config.docId, this.config.clientId, payload);
    this.send(msg);
    this.lastFrontierTag = frontierTag;

    return msg.seq;
  }

  /** Send presence update */
  sendPresence(
    cursor?: CursorPosition,
    selection?: SelectionRange,
    status: "active" | "idle" | "away" = "active"
  ): void {
    if (this.state !== "connected") {
      return;
    }

    const payload: PresencePayload = {
      userMeta: this.config.userMeta,
      cursor,
      selection,
      status,
      lastActivity: new Date().toISOString(),
    };

    const msg = createMessage("presence", this.config.docId, this.config.clientId, payload);
    this.send(msg);
  }

  /** Request catch-up from server */
  requestCatchUp(preferSnapshot = false): void {
    if (this.state !== "connected") {
      return;
    }

    const payload: CatchUpRequestPayload = {
      fromFrontierTag: this.lastFrontierTag ?? "",
      preferSnapshot,
    };

    const msg = createMessage("catch_up_request", this.config.docId, this.config.clientId, payload);
    this.send(msg);
  }

  /** Set last frontier tag (for reconnect) */
  setLastFrontierTag(tag: string): void {
    this.lastFrontierTag = tag;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setState(state: SyncClientState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit("stateChange", state);
    }
  }

  private send(msg: SyncMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(msg));
    }
  }

  private async sendHandshake(): Promise<void> {
    const validation = validateManifest(this.config.policyManifest);
    if (!validation.valid) {
      this.emit(
        "error",
        new LfccError("POLICY_INVALID", "Client policy manifest is invalid", {
          context: { errors: validation.errors },
        })
      );
      this.disconnect();
      return;
    }

    const manifestHash = await computePolicyManifestHash(this.config.policyManifest);

    const payload: HandshakePayload = {
      client_manifest_v09: this.config.policyManifest,
      client_manifest_hash: manifestHash,
      capabilities: this.config.capabilities as ClientCapabilities,
      lastFrontierTag: this.lastFrontierTag ?? undefined,
      token: this.config.token,
      userMeta: this.config.userMeta,
    };

    const msg = createMessage("handshake", this.config.docId, this.config.clientId, payload);
    this.send(msg);
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const msg = deserializeMessage(data);
      const validation = validateClientInboundMessage(msg);
      if (!validation.ok) {
        this.recordInvalidMessage(validation.errors);
        return;
      }

      switch (validation.message.type) {
        case "handshake_ack":
          await this.handleHandshakeAck(validation.message);
          break;
        case "doc_update":
          this.handleRemoteUpdate(validation.message);
          break;
        case "doc_ack":
          this.handleDocAck(validation.message);
          break;
        case "presence_ack":
          this.handlePresenceAck(validation.message);
          break;
        case "catch_up_response":
          this.handleCatchUpResponse(validation.message);
          break;
        case "error":
          this.handleError(validation.message);
          break;
        case "pong":
          // Pong received, connection is alive
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.recordInvalidMessage([message]);
    }
  }

  private async handleHandshakeAck(msg: HandshakeAckMessage): Promise<void> {
    const {
      effective_manifest_v09,
      server_manifest_v09,
      chosen_manifest_hash,
      sessionId,
      needsCatchUp,
      serverFrontierTag,
      role,
    } = msg.payload;

    const serverValidation = validateManifest(server_manifest_v09);
    if (!serverValidation.valid) {
      this.emit(
        "error",
        new LfccError("POLICY_INVALID", "Server policy manifest is invalid", {
          context: { errors: serverValidation.errors },
        })
      );
      this.disconnect();
      return;
    }

    const negotiation = negotiateManifests(this.config.policyManifest, server_manifest_v09);
    if (!negotiation.success || !negotiation.effectiveManifest) {
      this.emit(
        "error",
        new LfccError("POLICY_NEGOTIATION_FAILED", "Policy negotiation failed", {
          context: {
            rejectionReason: negotiation.rejectionReason,
            errors: negotiation.errors,
          },
        })
      );
      this.disconnect();
      return;
    }

    const effectiveHash = await computePolicyManifestHash(effective_manifest_v09);
    const negotiatedHash = await computePolicyManifestHash(negotiation.effectiveManifest);

    if (effectiveHash !== chosen_manifest_hash || negotiatedHash !== chosen_manifest_hash) {
      this.emit(
        "error",
        new LfccError("POLICY_HASH_MISMATCH", "Manifest hash mismatch during handshake", {
          context: {
            chosen_manifest_hash,
            effectiveHash,
            negotiatedHash,
          },
        })
      );
      this.disconnect();
      return;
    }

    this.effectiveManifest = effective_manifest_v09;
    this.sessionId = sessionId;
    this.serverFrontierTag = serverFrontierTag;
    this.role = role ?? null;
    this.setState("connected");
    this.reconnectAttempts = 0;
    this.startPing();

    this.emit("connected", sessionId);

    // Request catch-up if needed
    if (needsCatchUp && this.lastFrontierTag && this.lastFrontierTag !== serverFrontierTag) {
      this.requestCatchUp();
    }
  }

  private handleRemoteUpdate(msg: DocUpdateMessage): void {
    const data = msg.payload.isBase64
      ? base64Decode(msg.payload.updateData)
      : new TextEncoder().encode(msg.payload.updateData);
    this.lastFrontierTag = msg.payload.frontierTag;
    this.emit("remoteUpdate", data, msg.payload.frontierTag);
  }

  private handleDocAck(msg: DocAckMessage): void {
    const { ackedSeq, applied, rejectionReason, serverFrontierTag } = msg.payload;
    this.lastFrontierTag = serverFrontierTag;
    this.emit("updateAck", ackedSeq, applied, rejectionReason);

    const pending = this.pendingAcks.get(ackedSeq);
    if (pending) {
      if (applied) {
        pending.resolve();
      } else {
        pending.reject(
          new LfccError("UPDATE_REJECTED", rejectionReason ?? "Update rejected", {
            context: { seq: ackedSeq },
          })
        );
      }
      this.pendingAcks.delete(ackedSeq);
    }
  }

  private handlePresenceAck(msg: PresenceAckMessage): void {
    this.emit("presenceUpdate", msg.payload.presences);
  }

  private handleCatchUpResponse(msg: CatchUpResponseMessage): void {
    const { isSnapshot, data, frontierTag } = msg.payload;
    const bytes = base64Decode(data);
    this.lastFrontierTag = frontierTag;
    this.emit("remoteUpdate", bytes, frontierTag);
    this.emit("catchUpComplete", isSnapshot, frontierTag);
  }

  private handleError(msg: ErrorMessage): void {
    const { code, message, retryable, category, details, retryAfterMs } = msg.payload;
    const error = new LfccError(code, message, {
      context: {
        docId: this.config.docId,
        clientId: this.config.clientId,
        category,
        retryable,
        retryAfterMs,
        details,
      },
    });
    this.emit("error", error);

    if (!retryable) {
      this.setState("error");
    }
  }

  private shouldAttemptReconnect(): boolean {
    if (!this.config.reconnect.enabled) {
      return false;
    }
    return (
      this.state === "connected" ||
      this.state === "connecting" ||
      this.state === "handshaking" ||
      this.state === "reconnecting"
    );
  }

  private hasReconnectBudget(): boolean {
    const maxAttempts = this.config.reconnect.maxAttempts;
    if (maxAttempts < 0) {
      return true;
    }
    return this.reconnectAttempts < maxAttempts;
  }

  private handleClose(code: number, reason: string): void {
    this.stopPing();
    this.ws = null;

    if (this.shouldAttemptReconnect()) {
      this.attemptReconnect();
    } else {
      this.role = null;
      this.setState("disconnected");
      this.emit("disconnected", reason || `Code: ${code}`);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.hasReconnectBudget()) {
      this.setState("error");
      this.emit(
        "error",
        new LfccError("MAX_RECONNECT_ATTEMPTS", "Max reconnect attempts reached", {
          context: { attempts: this.reconnectAttempts },
        })
      );
      return;
    }

    this.setState("reconnecting");
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnect.baseDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.config.reconnect.maxDelayMs
    );

    await sleep(delay);

    try {
      await this.connect();
    } catch {
      // Will retry via handleClose
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.state === "connected") {
        const msg = createMessage("ping", this.config.docId, this.config.clientId, {});
        this.send(msg);
      }
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private recordInvalidMessage(errors: string[]): void {
    getLogger().warn("sync", "Rejected invalid inbound message", {
      docId: this.config.docId,
      clientId: this.config.clientId,
      errors,
    });

    if (hasMetricsRegistry()) {
      getMetrics().incCounter(INVALID_MESSAGE_METRIC, {
        source: "client",
      });
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Moved to encoding.ts

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
