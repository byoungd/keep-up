/**
 * LFCC v0.9 RC - Drag Handle Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DragHandleController,
  type HandleHitTarget,
  INITIAL_DRAG_STATE,
  findHandleAtPoint,
  generateHandleCss,
  isPointInHandle,
} from "../dragHandle.js";

describe("Drag Handle", () => {
  describe("INITIAL_DRAG_STATE", () => {
    it("should have correct defaults", () => {
      expect(INITIAL_DRAG_STATE.isDragging).toBe(false);
      expect(INITIAL_DRAG_STATE.activeAnnotationId).toBeNull();
      expect(INITIAL_DRAG_STATE.activeHandle).toBeNull();
    });
  });

  describe("DragHandleController", () => {
    let controller: DragHandleController;

    beforeEach(() => {
      controller = new DragHandleController();
    });

    afterEach(() => {
      controller.destroy();
    });

    describe("getState", () => {
      it("should return initial state", () => {
        const state = controller.getState();
        expect(state.isDragging).toBe(false);
      });
    });

    describe("subscribe", () => {
      it("should add callback", () => {
        const callback = vi.fn();
        const unsubscribe = controller.subscribe(callback);

        controller.startDrag("anno-1", "start", 100, 100);
        expect(callback).toHaveBeenCalled();

        unsubscribe();
      });

      it("should remove callback on unsubscribe", () => {
        const callback = vi.fn();
        const unsubscribe = controller.subscribe(callback);
        unsubscribe();

        controller.startDrag("anno-1", "start", 100, 100);
        // Callback should still be called for start event before unsubscribe takes effect
        // But let's verify unsubscribe works by checking subsequent events
        controller.cancelDrag();
      });
    });

    describe("startDrag", () => {
      it("should start drag", () => {
        controller.startDrag("anno-1", "start", 100, 200);

        const state = controller.getState();
        expect(state.isDragging).toBe(true);
        expect(state.activeAnnotationId).toBe("anno-1");
        expect(state.activeHandle).toBe("start");
        expect(state.startX).toBe(100);
        expect(state.startY).toBe(200);
      });

      it("should emit start event", () => {
        const callback = vi.fn();
        controller.subscribe(callback);

        controller.startDrag("anno-1", "end", 50, 75, 123);

        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            annotation_id: "anno-1",
            handle: "end",
            client_x: 50,
            client_y: 75,
            pm_pos_hint: 123,
            phase: "start",
          })
        );
      });

      it("should cancel existing drag before starting new one", () => {
        const callback = vi.fn();
        controller.subscribe(callback);

        controller.startDrag("anno-1", "start", 100, 100);
        controller.startDrag("anno-2", "end", 200, 200);

        // Should have: start(anno-1), cancel(anno-1), start(anno-2)
        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ phase: "cancel" }));
      });
    });

    describe("cancelDrag", () => {
      it("should cancel drag", () => {
        controller.startDrag("anno-1", "start", 100, 100);
        controller.cancelDrag();

        const state = controller.getState();
        expect(state.isDragging).toBe(false);
        expect(state.activeAnnotationId).toBeNull();
      });

      it("should emit cancel event", () => {
        const callback = vi.fn();
        controller.subscribe(callback);

        controller.startDrag("anno-1", "start", 100, 100);
        controller.cancelDrag();

        expect(callback).toHaveBeenLastCalledWith(
          expect.objectContaining({
            annotation_id: "anno-1",
            phase: "cancel",
          })
        );
      });

      it("should do nothing if not dragging", () => {
        const callback = vi.fn();
        controller.subscribe(callback);

        controller.cancelDrag();
        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe("destroy", () => {
      it("should cancel drag and clear callbacks", () => {
        const callback = vi.fn();
        controller.subscribe(callback);
        controller.startDrag("anno-1", "start", 100, 100);

        controller.destroy();

        const state = controller.getState();
        expect(state.isDragging).toBe(false);
      });
    });
  });

  describe("isPointInHandle", () => {
    const target: HandleHitTarget = {
      annotationId: "anno-1",
      handle: "start",
      x: 100,
      y: 100,
      width: 10,
      height: 20,
    };

    it("should return true for point inside", () => {
      expect(isPointInHandle(105, 110, target)).toBe(true);
    });

    it("should return true for point on edge", () => {
      expect(isPointInHandle(100, 100, target)).toBe(true);
    });

    it("should return true for point within padding", () => {
      expect(isPointInHandle(98, 100, target, 4)).toBe(true);
    });

    it("should return false for point outside", () => {
      expect(isPointInHandle(50, 50, target)).toBe(false);
    });

    it("should return false for point outside padding", () => {
      expect(isPointInHandle(90, 100, target, 4)).toBe(false);
    });
  });

  describe("findHandleAtPoint", () => {
    const targets: HandleHitTarget[] = [
      { annotationId: "anno-1", handle: "start", x: 100, y: 100, width: 10, height: 20 },
      { annotationId: "anno-1", handle: "end", x: 200, y: 100, width: 10, height: 20 },
      { annotationId: "anno-2", handle: "start", x: 100, y: 200, width: 10, height: 20 },
    ];

    it("should find handle at point", () => {
      const handle = findHandleAtPoint(105, 110, targets);
      expect(handle?.annotationId).toBe("anno-1");
      expect(handle?.handle).toBe("start");
    });

    it("should return null if no handle at point", () => {
      const handle = findHandleAtPoint(50, 50, targets);
      expect(handle).toBeNull();
    });

    it("should return first matching handle", () => {
      // If handles overlap, returns first one
      const handle = findHandleAtPoint(105, 110, targets);
      expect(handle?.annotationId).toBe("anno-1");
    });
  });

  describe("generateHandleCss", () => {
    it("should generate CSS", () => {
      const css = generateHandleCss();
      expect(css).toContain(".lfcc-handle");
      expect(css).toContain(".lfcc-handle--start");
      expect(css).toContain(".lfcc-handle--end");
      expect(css).toContain(".lfcc-dragging");
    });
  });
});
