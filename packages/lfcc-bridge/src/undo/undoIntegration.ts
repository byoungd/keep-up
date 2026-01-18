import { observability } from "@ku0/core";
import type { LoroRuntime } from "../runtime/loroRuntime";

/**
 * P0-1 FIX: Enhanced UndoEvent with sync tracking
 */
export type UndoEvent = {
  /** Whether the operation succeeded */
  success: boolean;
  /** Direction of operation */
  direction: "undo" | "redo";
  /** Timestamp of the operation */
  timestamp: number;
  /** P0-1: Whether PM sync is pending after this operation */
  syncPending?: boolean;
};

export type UndoCallbacks = {
  /** Called when undo is performed */
  onUndo?: (event: UndoEvent) => void;
  /** Called when redo is performed */
  onRedo?: (event: UndoEvent) => void;
  /** P0-1: Called when sync completes after undo/redo */
  onSyncComplete?: (direction: "undo" | "redo") => void;
};

/**
 * P0-1: Undo operation state for preventing rapid consecutive operations
 */
export type UndoState = "idle" | "pending" | "syncing";

export type UndoController = {
  undo: () => boolean;
  redo: () => boolean;
  /** UX-002: Set callbacks for visual feedback */
  setCallbacks: (callbacks: UndoCallbacks) => void;
  /** P0-1: Get current undo state */
  getState: () => UndoState;
  /** P0-1: Check if undo/redo can be performed */
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** P0-1: Notify that PM sync completed */
  notifySyncComplete: () => void;
};

/**
 * P0-1: Debounce timeout for rapid undo/redo operations
 * Prevents user from triggering undo before previous sync completes
 */
const UNDO_DEBOUNCE_MS = 20;

/**
 * P0-1: Maximum time to wait for sync before allowing next operation
 */
const SYNC_TIMEOUT_MS = 500;

const logger = observability.getLogger();

export function createUndoController(
  runtime: LoroRuntime,
  excludeOriginPrefix = "lfcc:"
): UndoController {
  runtime.undoManager.addExcludeOriginPrefix(excludeOriginPrefix);

  let callbacks: UndoCallbacks = {};
  let state: UndoState = "idle";
  let lastOperationTime = 0;
  let pendingDirection: "undo" | "redo" | null = null;
  let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const resetState = () => {
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
    }
    const direction = pendingDirection;
    state = "idle";
    pendingDirection = null;
    if (direction) {
      callbacks.onSyncComplete?.(direction);
    }
  };

  const startSyncTimeout = () => {
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
    }
    syncTimeoutId = setTimeout(() => {
      // P0-1: Auto-recover from stuck sync state
      if (state === "syncing") {
        logger.warn("undo", "Sync timeout, auto-recovering");
        resetState();
      }
    }, SYNC_TIMEOUT_MS);
  };

  const performOperation = (direction: "undo" | "redo"): boolean => {
    const now = Date.now();

    // P0-1: Debounce rapid operations
    if (now - lastOperationTime < UNDO_DEBOUNCE_MS) {
      return false;
    }

    // P0-1: Block if sync is in progress
    if (state === "syncing") {
      logger.warn("undo", "Undo/redo blocked: sync in progress", { direction });
      return false;
    }

    lastOperationTime = now;
    state = "pending";
    pendingDirection = direction;

    const success = direction === "undo" ? runtime.undoManager.undo() : runtime.undoManager.redo();

    if (success) {
      state = "syncing";
      startSyncTimeout();
    } else {
      state = "idle";
      pendingDirection = null;
    }

    const callback = direction === "undo" ? callbacks.onUndo : callbacks.onRedo;
    callback?.({
      success,
      direction,
      timestamp: now,
      syncPending: success,
    });

    return success;
  };

  return {
    undo: () => performOperation("undo"),
    redo: () => performOperation("redo"),

    setCallbacks: (newCallbacks: UndoCallbacks) => {
      callbacks = newCallbacks;
    },

    getState: () => state,

    canUndo: () => state === "idle" && runtime.undoManager.canUndo(),
    canRedo: () => state === "idle" && runtime.undoManager.canRedo(),

    notifySyncComplete: () => {
      if (state === "syncing") {
        resetState();
      }
    },
  };
}
