/**
 * Collaboration MVP - WebSocket Collab Adapter
 *
 * WebSocket implementation of the CollabAdapter interface.
 * Handles connection lifecycle, message serialization, and reconnection.
 */

import type { CollabAdapter, CollabAdapterStatus, CollabSession } from "./collabAdapter";
import {
  type SyncMessage,
  createJoinMessage,
  createLeaveMessage,
  isValidSyncMessage,
  serializeSyncMessage,
} from "./collabMessages";

/** Configuration for WebSocketCollabAdapter */
export type WebSocketCollabAdapterConfig = {
  /** WebSocket server URL (e.g., "ws://localhost:8080") */
  url: string;
  /** Reconnection options */
  reconnect?: {
    /** Enable automatic reconnection (default: true) */
    enabled: boolean;
    /** Maximum reconnection attempts (default: 5) */
    maxAttempts: number;
    /** Base delay in ms for exponential backoff (default: 1000) */
    baseDelayMs: number;
    /** Maximum delay in ms (default: 30000) */
    maxDelayMs: number;
  };
  /** Connection timeout in ms (default: 10000) */
  connectTimeoutMs?: number;
};

const DEFAULT_RECONNECT_CONFIG = {
  enabled: true,
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

/**
 * WebSocket implementation of CollabAdapter.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - JOIN/LEAVE message handling
 * - Message serialization/deserialization
 * - Event-based API for status changes, messages, and errors
 */
export class WebSocketCollabAdapter implements CollabAdapter {
  private config: Required<WebSocketCollabAdapterConfig>;
  private ws: WebSocket | null = null;
  private session: CollabSession | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionalDisconnect = false;

  private messageListeners = new Set<(msg: SyncMessage) => void>();
  private statusListeners = new Set<(status: CollabAdapterStatus) => void>();
  private errorListeners = new Set<(error: Error) => void>();

  private _status: CollabAdapterStatus = "idle";

  constructor(config: WebSocketCollabAdapterConfig) {
    this.config = {
      url: config.url,
      reconnect: { ...DEFAULT_RECONNECT_CONFIG, ...config.reconnect },
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    };
  }

  get status(): CollabAdapterStatus {
    return this._status;
  }

  async connect(session: CollabSession): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") {
      throw new Error(`Cannot connect in status: ${this._status}`);
    }

    this.session = session;
    this.isIntentionalDisconnect = false;
    this.reconnectAttempts = 0;

    return this.doConnect();
  }

  send(msg: SyncMessage): void {
    if (this._status !== "connected" || !this.ws) {
      // Silently drop messages when not connected
      return;
    }

    try {
      const serialized = serializeSyncMessage(msg);
      this.ws.send(serialized);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error("Failed to send message"));
    }
  }

  onMessage(cb: (msg: SyncMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  onStatusChange(cb: (status: CollabAdapterStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onError(cb: (error: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  disconnect(): void {
    this.isIntentionalDisconnect = true;
    this.clearReconnectTimer();

    if (this.session && this.ws?.readyState === WebSocket.OPEN) {
      // Send LEAVE message before closing
      const leaveMsg = createLeaveMessage(this.session.docId, this.session.userId);
      try {
        this.ws.send(serializeSyncMessage(leaveMsg));
      } catch {
        // Ignore send errors during disconnect
      }
    }

    this.closeWebSocket();
    this.setStatus("disconnected");
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async doConnect(): Promise<void> {
    if (!this.session) {
      throw new Error("No session configured");
    }

    this.setStatus("connecting");

    return new Promise((resolve, reject) => {
      const url = `${this.config.url}/${this.session?.docId}`;

      try {
        this.ws = new WebSocket(url);
      } catch (error) {
        this.setStatus("error");
        reject(error instanceof Error ? error : new Error("Failed to create WebSocket"));
        return;
      }

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
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

      // Connection timeout
      timeoutId = setTimeout(() => {
        if (!settled) {
          this.closeWebSocket();
          this.setStatus("error");
          settle(() => reject(new Error("Connection timeout")));
        }
      }, this.config.connectTimeoutMs);

      this.ws.onopen = () => {
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        this.sendJoin();
        settle(() => resolve());
      };

      this.ws.onerror = (_event) => {
        const error = new Error("WebSocket error");
        this.emitError(error);
        if (!settled) {
          this.setStatus("error");
          settle(() => reject(error));
        }
      };

      this.ws.onclose = (event) => {
        cleanup();
        this.handleClose(event.code, event.reason);
        if (!settled) {
          settle(() => reject(new Error(`Connection closed: ${event.reason || event.code}`)));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };
    });
  }

  private handleMessage(data: string): void {
    try {
      const parsed: unknown = JSON.parse(data);
      if (!isValidSyncMessage(parsed)) {
        // Log warning but don't emit error for invalid messages
        console.warn("[WebSocketCollabAdapter] Received invalid message:", data);
        return;
      }
      this.emitMessage(parsed);
    } catch (error) {
      console.warn("[WebSocketCollabAdapter] Failed to parse message:", error);
    }
  }

  private handleClose(code: number, reason: string): void {
    this.ws = null;

    if (this.isIntentionalDisconnect) {
      this.setStatus("disconnected");
      return;
    }

    // Attempt reconnection if enabled
    if (this.config.reconnect.enabled && this.shouldReconnect()) {
      this.attemptReconnect();
    } else {
      this.setStatus("disconnected");
      this.emitError(new Error(`Connection closed: ${reason || code}`));
    }
  }

  private shouldReconnect(): boolean {
    return this.reconnectAttempts < this.config.reconnect.maxAttempts;
  }

  private attemptReconnect(): void {
    this.setStatus("reconnecting");
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnect.baseDelayMs * 2 ** (this.reconnectAttempts - 1),
      this.config.reconnect.maxDelayMs
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect().catch((error) => {
        if (this.shouldReconnect() && !this.isIntentionalDisconnect) {
          this.attemptReconnect();
        } else {
          this.setStatus("error");
          this.emitError(error instanceof Error ? error : new Error("Reconnection failed"));
        }
      });
    }, delay);
  }

  private sendJoin(): void {
    if (!this.session) {
      return;
    }
    const joinMsg = createJoinMessage(this.session.docId, this.session.userId);
    this.send(joinMsg);
  }

  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: CollabAdapterStatus): void {
    if (this._status !== status) {
      this._status = status;
      for (const cb of this.statusListeners) {
        try {
          cb(status);
        } catch (error) {
          console.error("[WebSocketCollabAdapter] Status listener error:", error);
        }
      }
    }
  }

  private emitMessage(msg: SyncMessage): void {
    for (const cb of this.messageListeners) {
      try {
        cb(msg);
      } catch (error) {
        console.error("[WebSocketCollabAdapter] Message listener error:", error);
      }
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorListeners) {
      try {
        cb(error);
      } catch (err) {
        console.error("[WebSocketCollabAdapter] Error listener error:", err);
      }
    }
  }
}
