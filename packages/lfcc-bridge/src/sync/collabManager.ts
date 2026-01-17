/**
 * Collaboration MVP - CollabManager
 *
 * Orchestrates Loro CRDT updates with the sync layer.
 * Handles local update export, remote update import, echo prevention, and presence.
 */

import { observability } from "@ku0/core";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { CollabAdapter, CollabAdapterStatus } from "./collabAdapter";
import { base64Decode, base64Encode } from "./collabEncoding";
import {
  type CrdtUpdateMessage,
  createCrdtUpdateMessage,
  createPresenceMessage,
  type JoinMessage,
  type LeaveMessage,
  type PresenceMessage,
  type PresencePayload,
  type SyncMessage,
} from "./collabMessages";

const logger = observability.getLogger();

/** Configuration for CollabManager */
export type CollabManagerConfig = {
  /** Loro runtime instance */
  runtime: LoroRuntime;
  /** Sync adapter for network communication */
  adapter: CollabAdapter;
  /** User ID (unique per client) */
  userId: string;
  /** Document ID */
  docId: string;
  /** Debounce interval for local updates in ms (default: 0 = no debounce) */
  debounceMs?: number;
};

/** Participant information */
export type Participant = {
  /** User ID */
  userId: string;
  /** Timestamp when the user joined */
  joinedAt: number;
  /** Optional presence data */
  presence?: PresencePayload;
};

/** CollabManager events */
export type CollabManagerEvents = {
  /** Emitted when participant list changes */
  participantsChange: (participants: Participant[]) => void;
  /** Emitted when connection status changes */
  statusChange: (status: CollabAdapterStatus) => void;
  /** Emitted when an error occurs */
  error: (error: Error) => void;
  /** Emitted when a remote update is applied */
  remoteUpdate: (senderId: string) => void;
};

/**
 * CollabManager orchestrates Loro CRDT synchronization.
 *
 * Features:
 * - Subscribes to local Loro updates and emits CRDT_UPDATE messages
 * - Applies remote updates to the local Loro document
 * - Prevents echo loops by ignoring messages with own senderId
 * - Manages participant list via JOIN/LEAVE messages
 * - Supports presence sharing
 */
export class CollabManager {
  private runtime: LoroRuntime;
  private adapter: CollabAdapter;
  private userId: string;
  private docId: string;
  private debounceMs: number;

  private participants = new Map<string, Participant>();
  private unsubscribeLocalUpdates: (() => void) | null = null;
  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeErrors: (() => void) | null = null;

  private participantListeners = new Set<(participants: Participant[]) => void>();
  private statusListeners = new Set<(status: CollabAdapterStatus) => void>();
  private errorListeners = new Set<(error: Error) => void>();
  private remoteUpdateListeners = new Set<(senderId: string) => void>();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingUpdate: Uint8Array | null = null;

  private isStarted = false;

  constructor(config: CollabManagerConfig) {
    this.runtime = config.runtime;
    this.adapter = config.adapter;
    this.userId = config.userId;
    this.docId = config.docId;
    this.debounceMs = config.debounceMs ?? 0;
  }

  /**
   * Start the collaboration manager.
   * Connects to the adapter and begins synchronization.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error("CollabManager is already started");
    }

    // Subscribe to local Loro updates
    this.unsubscribeLocalUpdates = this.runtime.onLocalUpdate((bytes) => {
      this.handleLocalUpdate(bytes);
    });

    // Subscribe to remote messages
    this.unsubscribeMessages = this.adapter.onMessage((msg) => {
      this.handleMessage(msg);
    });

    // Subscribe to status changes
    this.unsubscribeStatus = this.adapter.onStatusChange((status) => {
      this.emitStatusChange(status);
    });

    // Subscribe to errors
    this.unsubscribeErrors = this.adapter.onError((error) => {
      this.emitError(error);
    });

    // Connect adapter
    await this.adapter.connect({
      docId: this.docId,
      userId: this.userId,
    });

    // Add self to participants
    this.participants.set(this.userId, {
      userId: this.userId,
      joinedAt: Date.now(),
    });

    this.isStarted = true;
  }

  /**
   * Stop the collaboration manager.
   * Disconnects from the adapter and cleans up subscriptions.
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Flush pending update
    if (this.pendingUpdate) {
      this.sendCrdtUpdate(this.pendingUpdate);
      this.pendingUpdate = null;
    }

    // Unsubscribe from all events
    this.unsubscribeLocalUpdates?.();
    this.unsubscribeMessages?.();
    this.unsubscribeStatus?.();
    this.unsubscribeErrors?.();

    this.unsubscribeLocalUpdates = null;
    this.unsubscribeMessages = null;
    this.unsubscribeStatus = null;
    this.unsubscribeErrors = null;

    // Disconnect adapter
    this.adapter.disconnect();

    // Clear participants
    this.participants.clear();

    this.isStarted = false;
  }

  /**
   * Check if the manager is started.
   */
  getIsStarted(): boolean {
    return this.isStarted;
  }

  /**
   * Get the current list of participants.
   */
  getParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get the current connection status.
   */
  getStatus(): CollabAdapterStatus {
    return this.adapter.status;
  }

  /**
   * Send a presence update to other participants.
   */
  sendPresence(payload: PresencePayload): void {
    if (!this.isStarted) {
      return;
    }

    // Update own presence
    const self = this.participants.get(this.userId);
    if (self) {
      self.presence = payload;
    }

    // Send presence message
    const msg = createPresenceMessage(this.docId, this.userId, payload);
    this.adapter.send(msg);
  }

  /**
   * Register a callback for participant list changes.
   */
  onParticipantsChange(cb: (participants: Participant[]) => void): () => void {
    this.participantListeners.add(cb);
    return () => this.participantListeners.delete(cb);
  }

  /**
   * Register a callback for status changes.
   */
  onStatusChange(cb: (status: CollabAdapterStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  /**
   * Register a callback for errors.
   */
  onError(cb: (error: Error) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  /**
   * Register a callback for remote updates.
   */
  onRemoteUpdate(cb: (senderId: string) => void): () => void {
    this.remoteUpdateListeners.add(cb);
    return () => this.remoteUpdateListeners.delete(cb);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleLocalUpdate(bytes: Uint8Array): void {
    if (!this.isStarted) {
      return;
    }

    if (this.debounceMs > 0) {
      // Debounce: accumulate updates and send after delay
      this.pendingUpdate = bytes;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        if (this.pendingUpdate) {
          this.sendCrdtUpdate(this.pendingUpdate);
          this.pendingUpdate = null;
        }
        this.debounceTimer = null;
      }, this.debounceMs);
    } else {
      // No debounce: send immediately
      this.sendCrdtUpdate(bytes);
    }
  }

  private sendCrdtUpdate(bytes: Uint8Array): void {
    const bytesB64 = base64Encode(bytes);
    const msg = createCrdtUpdateMessage(this.docId, this.userId, bytesB64);
    this.adapter.send(msg);
  }

  private handleMessage(msg: SyncMessage): void {
    // Echo prevention: ignore own messages
    if (msg.senderId === this.userId) {
      return;
    }

    switch (msg.type) {
      case "CRDT_UPDATE":
        this.handleCrdtUpdate(msg);
        break;
      case "JOIN":
        this.handleJoin(msg);
        break;
      case "LEAVE":
        this.handleLeave(msg);
        break;
      case "PRESENCE":
        this.handlePresence(msg);
        break;
    }
  }

  private handleCrdtUpdate(msg: CrdtUpdateMessage): void {
    try {
      const bytes = base64Decode(msg.bytesB64);
      this.runtime.importBytes(bytes);
      this.emitRemoteUpdate(msg.senderId);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error("Failed to apply remote update"));
    }
  }

  private handleJoin(msg: JoinMessage): void {
    this.participants.set(msg.senderId, {
      userId: msg.senderId,
      joinedAt: msg.ts,
    });
    this.emitParticipantsChange();
  }

  private handleLeave(msg: LeaveMessage): void {
    this.participants.delete(msg.senderId);
    this.emitParticipantsChange();
  }

  private handlePresence(msg: PresenceMessage): void {
    const participant = this.participants.get(msg.senderId);
    if (participant) {
      participant.presence = msg.payload;
      this.emitParticipantsChange();
    } else {
      // Participant not in list yet, add them
      this.participants.set(msg.senderId, {
        userId: msg.senderId,
        joinedAt: msg.ts,
        presence: msg.payload,
      });
      this.emitParticipantsChange();
    }
  }

  private emitParticipantsChange(): void {
    const participants = this.getParticipants();
    for (const cb of this.participantListeners) {
      try {
        cb(participants);
      } catch (error) {
        logger.error(
          "sync",
          "Participant listener error",
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  private emitStatusChange(status: CollabAdapterStatus): void {
    for (const cb of this.statusListeners) {
      try {
        cb(status);
      } catch (error) {
        logger.error(
          "sync",
          "Status listener error",
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorListeners) {
      try {
        cb(error);
      } catch (err) {
        logger.error(
          "sync",
          "Error listener error",
          err instanceof Error ? err : new Error(String(err))
        );
      }
    }
  }

  private emitRemoteUpdate(senderId: string): void {
    for (const cb of this.remoteUpdateListeners) {
      try {
        cb(senderId);
      } catch (error) {
        logger.error(
          "sync",
          "Remote update listener error",
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }
}
