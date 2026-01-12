/**
 * Collaboration MVP - CollabAdapter Interface
 *
 * Defines the transport-agnostic interface for collaboration synchronization.
 * Implementations can use WebSocket, WebRTC, or other transports.
 */

import type { SyncMessage } from "./collabMessages";

/** Session information for connecting to a collaboration session */
export type CollabSession = {
  /** Document identifier */
  docId: string;
  /** User identifier (unique per client) */
  userId: string;
  /** Optional authentication token */
  token?: string;
};

/** Connection status of the adapter */
export type CollabAdapterStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

/** Event types emitted by the adapter */
export type CollabAdapterEvents = {
  /** Emitted when connection status changes */
  statusChange: (status: CollabAdapterStatus) => void;
  /** Emitted when a message is received */
  message: (msg: SyncMessage) => void;
  /** Emitted when an error occurs */
  error: (error: Error) => void;
};

/**
 * Transport-agnostic interface for collaboration synchronization.
 *
 * Implementations must:
 * - Handle connection lifecycle (connect, disconnect, reconnect)
 * - Serialize and deserialize SyncMessages
 * - Emit events for status changes, messages, and errors
 * - NOT interpret CRDT bytes (pass-through only)
 */
export interface CollabAdapter {
  /** Current connection status */
  readonly status: CollabAdapterStatus;

  /**
   * Connect to a collaboration session.
   * @param session - Session information including docId and userId
   * @returns Promise that resolves when connected
   * @throws Error if connection fails
   */
  connect(session: CollabSession): Promise<void>;

  /**
   * Send a message to other participants.
   * @param msg - The SyncMessage to send
   */
  send(msg: SyncMessage): void;

  /**
   * Register a callback for incoming messages.
   * @param cb - Callback function invoked when a message is received
   * @returns Unsubscribe function
   */
  onMessage(cb: (msg: SyncMessage) => void): () => void;

  /**
   * Register a callback for status changes.
   * @param cb - Callback function invoked when status changes
   * @returns Unsubscribe function
   */
  onStatusChange(cb: (status: CollabAdapterStatus) => void): () => void;

  /**
   * Register a callback for errors.
   * @param cb - Callback function invoked when an error occurs
   * @returns Unsubscribe function
   */
  onError(cb: (error: Error) => void): () => void;

  /**
   * Disconnect from the collaboration session.
   * Sends a LEAVE message before closing the connection.
   */
  disconnect(): void;
}

/**
 * No-op implementation of CollabAdapter for testing or single-user mode.
 */
export class NoopCollabAdapter implements CollabAdapter {
  status: CollabAdapterStatus = "idle";

  async connect(_session: CollabSession): Promise<void> {
    this.status = "connected";
  }

  send(_msg: SyncMessage): void {
    // No-op: messages are not sent anywhere
  }

  onMessage(_cb: (msg: SyncMessage) => void): () => void {
    return () => {
      // No-op unsubscribe
    };
  }

  onStatusChange(_cb: (status: CollabAdapterStatus) => void): () => void {
    return () => {
      // No-op unsubscribe
    };
  }

  onError(_cb: (error: Error) => void): () => void {
    return () => {
      // No-op unsubscribe
    };
  }

  disconnect(): void {
    this.status = "disconnected";
  }
}
