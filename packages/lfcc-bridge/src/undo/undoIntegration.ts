import type { LoroRuntime } from "../runtime/loroRuntime";

export type UndoEvent = {
  /** Whether the operation succeeded */
  success: boolean;
  /** Direction of operation */
  direction: "undo" | "redo";
  /** Timestamp of the operation */
  timestamp: number;
};

export type UndoCallbacks = {
  /** Called when undo is performed */
  onUndo?: (event: UndoEvent) => void;
  /** Called when redo is performed */
  onRedo?: (event: UndoEvent) => void;
};

export type UndoController = {
  undo: () => boolean;
  redo: () => boolean;
  /** UX-002: Set callbacks for visual feedback */
  setCallbacks: (callbacks: UndoCallbacks) => void;
};

export function createUndoController(
  runtime: LoroRuntime,
  excludeOriginPrefix = "lfcc"
): UndoController {
  runtime.undoManager.addExcludeOriginPrefix(excludeOriginPrefix);

  let callbacks: UndoCallbacks = {};

  return {
    undo: () => {
      const success = runtime.undoManager.undo();
      callbacks.onUndo?.({
        success,
        direction: "undo",
        timestamp: Date.now(),
      });
      return success;
    },
    redo: () => {
      const success = runtime.undoManager.redo();
      callbacks.onRedo?.({
        success,
        direction: "redo",
        timestamp: Date.now(),
      });
      return success;
    },
    setCallbacks: (newCallbacks: UndoCallbacks) => {
      callbacks = newCallbacks;
    },
  };
}
