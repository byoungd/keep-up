/**
 * LFCC v0.9 RC - Drag Handle Interaction Shell
 * @see docs/product/LFCC_v0.9_RC_Parallel_Workstreams/02_UI_Annotation_Panel_and_UX.md Section C
 *
 * Handle UX without computing anchors/spans.
 * Emits events that the bridge can later consume.
 */

import type { HandleDragCallback, HandleDragEvent, HandleSide } from "./types";

/** Drag handle controller state */
export type DragHandleState = {
  /** Whether a drag is in progress */
  isDragging: boolean;
  /** Current annotation being dragged */
  activeAnnotationId: string | null;
  /** Current handle being dragged */
  activeHandle: HandleSide | null;
  /** Start position */
  startX: number;
  startY: number;
  /** Current position */
  currentX: number;
  currentY: number;
};

/** Initial drag handle state */
export const INITIAL_DRAG_STATE: DragHandleState = {
  isDragging: false,
  activeAnnotationId: null,
  activeHandle: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
};

/**
 * Drag Handle Controller
 *
 * Manages drag interactions for annotation handles.
 * Platform-agnostic - works with any DOM event system.
 */
export class DragHandleController {
  private state: DragHandleState = { ...INITIAL_DRAG_STATE };
  private callbacks: Set<HandleDragCallback> = new Set();
  private boundHandlers: {
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: (e: PointerEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onBlur: () => void;
  };

  constructor() {
    // Bind handlers once
    this.boundHandlers = {
      onPointerMove: this.handlePointerMove.bind(this),
      onPointerUp: this.handlePointerUp.bind(this),
      onPointerCancel: this.handlePointerCancel.bind(this),
      onKeyDown: this.handleKeyDown.bind(this),
      onBlur: this.handleBlur.bind(this),
    };
  }

  /** Get current state */
  getState(): DragHandleState {
    return { ...this.state };
  }

  /** Subscribe to drag events */
  subscribe(callback: HandleDragCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /** Start drag on a handle */
  startDrag(
    annotationId: string,
    handle: HandleSide,
    clientX: number,
    clientY: number,
    pmPosHint?: number
  ): void {
    if (this.state.isDragging) {
      this.cancelDrag();
    }

    this.state = {
      isDragging: true,
      activeAnnotationId: annotationId,
      activeHandle: handle,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    };

    // Emit start event
    this.emit({
      annotation_id: annotationId,
      handle,
      pm_pos_hint: pmPosHint,
      client_x: clientX,
      client_y: clientY,
      phase: "start",
      timestamp: Date.now(),
    });

    // Add global listeners
    this.addGlobalListeners();
  }

  /** Cancel current drag */
  cancelDrag(): void {
    if (!this.state.isDragging || !this.state.activeAnnotationId || !this.state.activeHandle) {
      return;
    }

    this.emit({
      annotation_id: this.state.activeAnnotationId,
      handle: this.state.activeHandle,
      client_x: this.state.currentX,
      client_y: this.state.currentY,
      phase: "cancel",
      timestamp: Date.now(),
    });

    this.cleanup();
  }

  /** Destroy controller */
  destroy(): void {
    this.cancelDrag();
    this.callbacks.clear();
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handlePointerMove(e: PointerEvent): void {
    if (!this.state.isDragging || !this.state.activeAnnotationId || !this.state.activeHandle) {
      return;
    }

    this.state.currentX = e.clientX;
    this.state.currentY = e.clientY;

    this.emit({
      annotation_id: this.state.activeAnnotationId,
      handle: this.state.activeHandle,
      client_x: e.clientX,
      client_y: e.clientY,
      phase: "move",
      timestamp: Date.now(),
    });
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.state.isDragging || !this.state.activeAnnotationId || !this.state.activeHandle) {
      return;
    }

    this.emit({
      annotation_id: this.state.activeAnnotationId,
      handle: this.state.activeHandle,
      client_x: e.clientX,
      client_y: e.clientY,
      phase: "end",
      timestamp: Date.now(),
    });

    this.cleanup();
  }

  private handlePointerCancel(_e: PointerEvent): void {
    this.cancelDrag();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.cancelDrag();
    }
  }

  private handleBlur(): void {
    this.cancelDrag();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private emit(event: HandleDragEvent): void {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        if (typeof reportError === "function") {
          const err = error instanceof Error ? error : new Error(String(error));
          reportError(err);
        }
      }
    }
  }

  private addGlobalListeners(): void {
    if (typeof document === "undefined") {
      return;
    }

    document.addEventListener("pointermove", this.boundHandlers.onPointerMove);
    document.addEventListener("pointerup", this.boundHandlers.onPointerUp);
    document.addEventListener("pointercancel", this.boundHandlers.onPointerCancel);
    document.addEventListener("keydown", this.boundHandlers.onKeyDown);
    window.addEventListener("blur", this.boundHandlers.onBlur);
  }

  private removeGlobalListeners(): void {
    if (typeof document === "undefined") {
      return;
    }

    document.removeEventListener("pointermove", this.boundHandlers.onPointerMove);
    document.removeEventListener("pointerup", this.boundHandlers.onPointerUp);
    document.removeEventListener("pointercancel", this.boundHandlers.onPointerCancel);
    document.removeEventListener("keydown", this.boundHandlers.onKeyDown);
    window.removeEventListener("blur", this.boundHandlers.onBlur);
  }

  private cleanup(): void {
    this.removeGlobalListeners();
    this.state = { ...INITIAL_DRAG_STATE };
  }
}

// ============================================================================
// Handle Hit Testing
// ============================================================================

/** Handle hit target dimensions */
export type HandleHitTarget = {
  annotationId: string;
  handle: HandleSide;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Check if a point is within a handle hit target
 */
export function isPointInHandle(
  x: number,
  y: number,
  target: HandleHitTarget,
  padding = 4
): boolean {
  return (
    x >= target.x - padding &&
    x <= target.x + target.width + padding &&
    y >= target.y - padding &&
    y <= target.y + target.height + padding
  );
}

/**
 * Find handle at point from a list of targets
 */
export function findHandleAtPoint(
  x: number,
  y: number,
  targets: HandleHitTarget[],
  padding = 4
): HandleHitTarget | null {
  for (const target of targets) {
    if (isPointInHandle(x, y, target, padding)) {
      return target;
    }
  }
  return null;
}

// ============================================================================
// CSS for Handles
// ============================================================================

/**
 * Generate CSS for drag handles
 */
export function generateHandleCss(): string {
  return `
.lfcc-handle {
  position: absolute;
  width: 8px;
  height: 16px;
  background: #3b82f6;
  border-radius: 2px;
  cursor: ew-resize;
  opacity: 0;
  transition: opacity 150ms ease;
  z-index: 10;
}

.lfcc-handle:hover,
.lfcc-handle--active {
  opacity: 1;
}

.lfcc-handle--start {
  left: -4px;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}

.lfcc-handle--end {
  right: -4px;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.lfcc-highlight:hover .lfcc-handle {
  opacity: 0.6;
}

.lfcc-highlight:hover .lfcc-handle:hover {
  opacity: 1;
}

/* Prevent text selection during drag */
.lfcc-dragging {
  user-select: none;
  cursor: ew-resize !important;
}

.lfcc-dragging * {
  cursor: ew-resize !important;
}
`.trim();
}

/**
 * Singleton fallback for non-React usage.
 * Prefer DragHandleControllerProvider for injected instances.
 */
let globalController: DragHandleController | null = null;
export function getDragHandleController(): DragHandleController {
  if (!globalController) {
    globalController = new DragHandleController();
  }
  return globalController;
}

export function destroyDragHandleController(): void {
  if (globalController) {
    globalController.destroy();
    globalController = null;
  }
}

/**
 * Resets the global controller instance.
 * Useful for testing or when unmounting the root application.
 */
export function resetDragHandleController(): void {
  destroyDragHandleController();
}
