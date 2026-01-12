/**
 * LFCC v0.9 RC - Overlay Controller Tests
 */

import { describe, expect, it, vi } from "vitest";
import { OverlayController, createOverlayController } from "../overlayController.js";
import type { BlockMeta, BlockRect } from "../types.js";

describe("Overlay Controller", () => {
  describe("createOverlayController", () => {
    it("should create controller with default config", () => {
      const controller = createOverlayController();
      expect(controller.getState().visible).toBe(false);
    });

    it("should create controller with custom config", () => {
      const controller = createOverlayController({ toggleShortcut: "Ctrl+D" });
      expect(controller.getConfig().toggleShortcut).toBe("Ctrl+D");
    });
  });

  describe("visibility", () => {
    it("should toggle visibility", () => {
      const controller = new OverlayController();
      expect(controller.getState().visible).toBe(false);

      controller.toggle();
      expect(controller.getState().visible).toBe(true);

      controller.toggle();
      expect(controller.getState().visible).toBe(false);
    });

    it("should show/hide", () => {
      const controller = new OverlayController();

      controller.show();
      expect(controller.getState().visible).toBe(true);

      controller.hide();
      expect(controller.getState().visible).toBe(false);
    });
  });

  describe("panel management", () => {
    it("should toggle panels", () => {
      const controller = new OverlayController({ defaultPanels: ["blocks"] });

      expect(controller.getState().activePanels.has("blocks")).toBe(true);

      controller.togglePanelVisibility("blocks");
      expect(controller.getState().activePanels.has("blocks")).toBe(false);

      controller.togglePanelVisibility("integrity");
      expect(controller.getState().activePanels.has("integrity")).toBe(true);
    });
  });

  describe("selection", () => {
    it("should select block", () => {
      const controller = new OverlayController();
      const listener = vi.fn();
      controller.on("blockSelected", listener);

      controller.setSelectedBlock("block-1");

      expect(controller.getState().selectedBlockId).toBe("block-1");
      expect(listener).toHaveBeenCalledWith("block-1");
    });

    it("should select annotation", () => {
      const controller = new OverlayController();
      const listener = vi.fn();
      controller.on("annotationSelected", listener);

      controller.setSelectedAnnotation("anno-1");

      expect(controller.getState().selectedAnnoId).toBe("anno-1");
      expect(listener).toHaveBeenCalledWith("anno-1");
    });
  });

  describe("data updates", () => {
    it("should update blocks", () => {
      const controller = new OverlayController();

      const rects: BlockRect[] = [{ blockId: "b1", x: 0, y: 0, width: 100, height: 50 }];
      const metas = new Map<string, BlockMeta>([
        [
          "b1",
          {
            blockId: "b1",
            type: "p",
            containerPath: "",
            isDirty: false,
            textPreview: "",
            childCount: 0,
          },
        ],
      ]);

      controller.updateBlocks(rects, metas);

      const result = controller.renderBlocks();
      expect(result.overlays.length).toBe(1);
    });

    it("should update annotations", () => {
      const controller = new OverlayController();

      controller.updateAnnotations([
        {
          annoId: "a1",
          spanIds: [],
          targetBlockIds: [],
          currentState: "active",
          graceToken: null,
          graceExpiresAt: null,
          lastVerifyTime: null,
          lastVerifyReason: null,
          contextHash: null,
        },
      ]);

      const result = controller.renderAnnotations();
      expect(result.length).toBe(1);
    });

    it("should update scan results", () => {
      const controller = new OverlayController();
      const listener = vi.fn();
      controller.on("stateChange", listener);

      controller.updateScanResults(
        {
          timestamp: Date.now(),
          duration_ms: 100,
          blocks_scanned: 10,
          annotations_scanned: 5,
          summary: {
            total_mismatches: 0,
            missed_by_dirty: 0,
            hash_mismatches: 0,
            chain_violations: 0,
          },
        },
        []
      );

      expect(controller.getState().lastScanReport).not.toBeNull();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("event logging", () => {
    it("should log events", () => {
      const controller = new OverlayController();

      controller.logEvent("checkpoint", "test", "Test event");

      expect(controller.getEventLog().length).toBe(1);
      expect(controller.getEventLog()[0].type).toBe("checkpoint");
    });

    it("should clear events", () => {
      const controller = new OverlayController();

      controller.logEvent("checkpoint", "test", "Test event");
      controller.clearEvents();

      expect(controller.getEventLog().length).toBe(0);
    });
  });

  describe("force scan", () => {
    it("should request force scan", () => {
      const controller = new OverlayController();
      const listener = vi.fn();
      controller.on("scanRequested", listener);

      controller.requestForceScan({ compareDirty: true, generateJson: true });

      expect(listener).toHaveBeenCalledWith({ compareDirty: true, generateJson: true });
    });
  });

  describe("dev assertions", () => {
    it("should enable/disable dev assertions", () => {
      const controller = new OverlayController();

      expect(controller.isDevAssertionsEnabled()).toBe(false);

      controller.setDevAssertionsEnabled(true);
      expect(controller.isDevAssertionsEnabled()).toBe(true);
    });
  });

  describe("event listeners", () => {
    it("should add and remove listeners", () => {
      const controller = new OverlayController();
      const listener = vi.fn();

      controller.on("stateChange", listener);
      controller.toggle();
      expect(listener).toHaveBeenCalledTimes(1);

      controller.off("stateChange", listener);
      controller.toggle();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("keyboard shortcut", () => {
    it("should handle matching shortcut", () => {
      const controller = new OverlayController({ toggleShortcut: "Ctrl+Shift+D" });

      const handled = controller.handleKeyboardShortcut({
        key: "d",
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
      });

      expect(handled).toBe(true);
      expect(controller.getState().visible).toBe(true);
    });

    it("should ignore non-matching shortcut", () => {
      const controller = new OverlayController({ toggleShortcut: "Ctrl+Shift+D" });

      const handled = controller.handleKeyboardShortcut({
        key: "d",
        ctrlKey: true,
        shiftKey: false,
        metaKey: false,
      });

      expect(handled).toBe(false);
      expect(controller.getState().visible).toBe(false);
    });
  });

  describe("rendering", () => {
    it("should render selected annotation", () => {
      const controller = new OverlayController();

      controller.updateAnnotations([
        {
          annoId: "a1",
          spanIds: [],
          targetBlockIds: [],
          currentState: "active",
          graceToken: null,
          graceExpiresAt: null,
          lastVerifyTime: null,
          lastVerifyReason: null,
          contextHash: null,
        },
      ]);

      expect(controller.renderSelectedAnnotation()).toBeNull();

      controller.setSelectedAnnotation("a1");
      const result = controller.renderSelectedAnnotation();

      expect(result).not.toBeNull();
      expect(result?.annotation.annoId).toBe("a1");
    });

    it("should render integrity panel", () => {
      const controller = new OverlayController();

      const result = controller.renderIntegrity();

      expect(result.lastReport).toBeNull();
      expect(result.isScanning).toBe(false);
    });
  });
});
