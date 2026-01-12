import {
  EphemeralStore,
  type Frontiers,
  LoroDoc,
  LoroList,
  LoroMap,
  type UndoConfig,
  UndoManager,
  type VersionVector,
} from "loro-crdt";

export { LoroDoc, LoroList, LoroMap };

export type LoroFrontiers = Frontiers;

export type LoroRuntimeOptions = {
  doc?: LoroDoc;
  docId?: string;
  peerId?: number | bigint | `${number}`;
  presenceTimeoutMs?: number;
  undoConfig?: UndoConfig;
};

export class LoroRuntime {
  readonly doc: LoroDoc;
  readonly docId: string;
  readonly presence: EphemeralStore;
  readonly undoManager: UndoManager;

  private _isDegraded = false;

  constructor(options: LoroRuntimeOptions = {}) {
    const { doc, docId, peerId, presenceTimeoutMs = 30000, undoConfig } = options;

    this.doc = doc ?? new LoroDoc();
    this.docId = docId ?? `doc-${Date.now()}`;
    if (peerId) {
      this.doc.setPeerId(peerId);
    }

    this.presence = new EphemeralStore(presenceTimeoutMs);
    this.undoManager = new UndoManager(this.doc, {
      // UX-001: Group operations within 500ms for natural undo behavior.
      // This matches user expectations from top editors (Notion, Linear, Google Docs).
      // Without this, each keystroke would be a separate undo step.
      mergeInterval: 500,
      ...undoConfig,
    });
  }

  /**
   * Check if the runtime is in a degraded state.
   * Degraded state indicates the bridge encountered an error and
   * further operations should be rejected until recovery.
   */
  isDegraded(): boolean {
    return this._isDegraded;
  }

  /**
   * Set the degraded state of the runtime.
   * @param value - true to mark as degraded, false to recover
   */
  setDegraded(value: boolean): void {
    this._isDegraded = value;
  }

  get frontiers(): LoroFrontiers {
    return this.doc.frontiers();
  }

  get versionVector(): VersionVector {
    return this.doc.version();
  }

  exportSnapshot(): Uint8Array {
    return this.doc.export({ mode: "snapshot" });
  }

  exportUpdate(from?: VersionVector): Uint8Array {
    return this.doc.export({ mode: "update", from });
  }

  importBytes(bytes: Uint8Array): void {
    this.doc.import(bytes);
  }

  onLocalUpdate(callback: (bytes: Uint8Array) => void): () => void {
    return this.doc.subscribeLocalUpdates(callback);
  }

  onLocalUpdateWithOrigin(callback: (bytes: Uint8Array, origin: string) => void): () => void {
    const originQueue: string[] = [];
    const unsubscribePreCommit = this.doc.subscribePreCommit((event) => {
      originQueue.push(event.origin ?? "unknown");
    });
    const unsubscribeUpdates = this.doc.subscribeLocalUpdates((bytes) => {
      const origin = originQueue.shift() ?? "unknown";
      callback(bytes, origin);
    });
    return () => {
      unsubscribeUpdates();
      unsubscribePreCommit();
    };
  }

  commit(origin: string): void {
    this.doc.commit({ origin });
  }

  // ============================================================================
  // Collaborative Cursor API (P0 Optimization)
  // ============================================================================

  /**
   * Broadcast local cursor position to other peers via EphemeralStore.
   * Uses stable Loro cursor encoding for position stability across edits.
   *
   * @param blockId - Current block ID where cursor is positioned
   * @param offset - Offset within the block
   * @param selection - Optional selection range { anchor, head }
   */
  broadcastCursor(
    blockId: string,
    offset: number,
    selection?: { anchorOffset: number; headOffset: number }
  ): void {
    const cursorData: CollaborativeCursor = {
      peerId: this.doc.peerIdStr,
      blockId,
      offset,
      selection,
      timestamp: Date.now(),
    };
    this.presence.set("cursor", cursorData);
  }

  /**
   * Subscribe to remote cursor updates.
   *
   * @param callback - Called when remote cursor positions change
   * @returns Unsubscribe function
   */
  onCursorUpdate(callback: (cursors: Map<string, CollaborativeCursor>) => void): () => void {
    // Subscribe to presence changes and filter cursor data
    const unsubscribe = this.presence.subscribe(() => {
      callback(this.getRemoteCursors());
    });
    return unsubscribe;
  }

  /**
   * Get current remote cursors from EphemeralStore.
   * Note: Uses defensive coding due to EphemeralStore's complex Value types.
   */
  getRemoteCursors(): Map<string, CollaborativeCursor> {
    const cursors = new Map<string, CollaborativeCursor>();
    try {
      const allPeers = this.presence.getAllStates();
      if (!allPeers || typeof allPeers !== "object") {
        return cursors;
      }

      // EphemeralStore returns Map<string, Map<string, Value>>
      const peers = allPeers as unknown as Map<string, Map<string, unknown>>;
      for (const [peerId, peerState] of peers.entries()) {
        if (!peerState || typeof peerState.get !== "function") {
          continue;
        }
        const cursorData = peerState.get("cursor") as CollaborativeCursor | undefined;
        if (cursorData?.peerId && cursorData.peerId !== this.doc.peerIdStr) {
          cursors.set(peerId, cursorData);
        }
      }
    } catch {
      // Ignore errors from EphemeralStore access
    }
    return cursors;
  }
}

/**
 * Collaborative cursor position data.
 * Stored in EphemeralStore for real-time presence.
 */
export type CollaborativeCursor = {
  /** Peer ID of the cursor owner */
  peerId: string;
  /** Block ID where cursor is positioned */
  blockId: string;
  /** Offset within the block text */
  offset: number;
  /** Optional selection range */
  selection?: {
    anchorOffset: number;
    headOffset: number;
  };
  /** Timestamp for ordering */
  timestamp: number;
};

export function createLoroRuntime(options?: LoroRuntimeOptions): LoroRuntime {
  return new LoroRuntime(options);
}
