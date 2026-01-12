/**
 * LFCC v0.9 RC - Overlay State Tests
 */

import { describe, expect, it } from "vitest";
import {
  addEvent,
  clearEventLog,
  createOverlayState,
  extractAnnotationData,
  extractBlockMeta,
  hideOverlay,
  selectAnnotation,
  selectBlock,
  showOverlay,
  toScanReportSummary,
  toggleOverlay,
  togglePanel,
  updateScanReport,
} from "../state.js";

describe("Overlay State", () => {
  describe("createOverlayState", () => {
    it("should create initial state", () => {
      const state = createOverlayState();
      expect(state.visible).toBe(false);
      expect(state.activePanels.size).toBeGreaterThan(0);
      expect(state.selectedBlockId).toBeNull();
      expect(state.selectedAnnoId).toBeNull();
      expect(state.eventLog).toEqual([]);
    });

    it("should respect config", () => {
      const state = createOverlayState({ defaultPanels: ["integrity"] });
      expect(state.activePanels.has("integrity")).toBe(true);
    });
  });

  describe("toggleOverlay", () => {
    it("should toggle visibility", () => {
      let state = createOverlayState();
      expect(state.visible).toBe(false);

      state = toggleOverlay(state);
      expect(state.visible).toBe(true);

      state = toggleOverlay(state);
      expect(state.visible).toBe(false);
    });
  });

  describe("showOverlay / hideOverlay", () => {
    it("should show overlay", () => {
      const state = showOverlay(createOverlayState());
      expect(state.visible).toBe(true);
    });

    it("should hide overlay", () => {
      let state = showOverlay(createOverlayState());
      state = hideOverlay(state);
      expect(state.visible).toBe(false);
    });
  });

  describe("togglePanel", () => {
    it("should toggle panel visibility", () => {
      let state = createOverlayState({ defaultPanels: ["blocks"] });
      expect(state.activePanels.has("blocks")).toBe(true);

      state = togglePanel(state, "blocks");
      expect(state.activePanels.has("blocks")).toBe(false);

      state = togglePanel(state, "blocks");
      expect(state.activePanels.has("blocks")).toBe(true);
    });

    it("should add new panel", () => {
      let state = createOverlayState({ defaultPanels: [] });
      state = togglePanel(state, "events");
      expect(state.activePanels.has("events")).toBe(true);
    });
  });

  describe("selectBlock / selectAnnotation", () => {
    it("should select block", () => {
      const state = selectBlock(createOverlayState(), "block-1");
      expect(state.selectedBlockId).toBe("block-1");
    });

    it("should deselect block", () => {
      let state = selectBlock(createOverlayState(), "block-1");
      state = selectBlock(state, null);
      expect(state.selectedBlockId).toBeNull();
    });

    it("should select annotation", () => {
      const state = selectAnnotation(createOverlayState(), "anno-1");
      expect(state.selectedAnnoId).toBe("anno-1");
    });
  });

  describe("updateScanReport", () => {
    it("should update scan report", () => {
      const report = {
        timestamp: Date.now(),
        durationMs: 100,
        blocksScanned: 10,
        annotationsScanned: 5,
        totalMismatches: 0,
        missedByDirty: 0,
        hashMismatches: 0,
        chainViolations: 0,
      };

      const state = updateScanReport(createOverlayState(), report);
      expect(state.lastScanReport).toEqual(report);
    });
  });

  describe("addEvent / clearEventLog", () => {
    it("should add event to log", () => {
      const state = addEvent(
        createOverlayState(),
        "state_transition",
        "anno-1",
        "Transitioned to active"
      );

      expect(state.eventLog.length).toBe(1);
      expect(state.eventLog[0].type).toBe("state_transition");
      expect(state.eventLog[0].source).toBe("anno-1");
    });

    it("should limit event log size", () => {
      let state = createOverlayState();
      for (let i = 0; i < 150; i++) {
        state = addEvent(state, "checkpoint", "test", `Event ${i}`, undefined, 100);
      }

      expect(state.eventLog.length).toBe(100);
    });

    it("should clear event log", () => {
      let state = addEvent(createOverlayState(), "checkpoint", "test", "Test");
      state = clearEventLog(state);
      expect(state.eventLog.length).toBe(0);
    });
  });

  describe("extractBlockMeta", () => {
    it("should extract block metadata", () => {
      const meta = extractBlockMeta(
        "block-1",
        "paragraph",
        ["table", "row", "cell"],
        "Hello world",
        0,
        new Set(["block-1"])
      );

      expect(meta.blockId).toBe("block-1");
      expect(meta.type).toBe("paragraph");
      expect(meta.containerPath).toBe("table > row > cell");
      expect(meta.isDirty).toBe(true);
      expect(meta.textPreview).toBe("Hello world");
    });

    it("should truncate long text preview", () => {
      const longText = "a".repeat(100);
      const meta = extractBlockMeta("b1", "p", [], longText, 0, new Set());
      expect(meta.textPreview.length).toBeLessThan(100);
      expect(meta.textPreview.endsWith("...")).toBe(true);
    });
  });

  describe("extractAnnotationData", () => {
    it("should extract annotation data", () => {
      const data = extractAnnotationData(
        "anno-1",
        ["span-1", "span-2"],
        ["block-1"],
        "active",
        "token-123",
        Date.now() + 5000,
        Date.now() - 1000,
        "checkpoint",
        "hash-abc"
      );

      expect(data.annoId).toBe("anno-1");
      expect(data.spanIds).toEqual(["span-1", "span-2"]);
      expect(data.currentState).toBe("active");
      expect(data.graceToken).toBe("token-123");
    });
  });

  describe("toScanReportSummary", () => {
    it("should convert full report to summary", () => {
      const fullReport = {
        timestamp: 1234567890,
        duration_ms: 150,
        blocks_scanned: 20,
        annotations_scanned: 10,
        summary: {
          total_mismatches: 2,
          missed_by_dirty: 1,
          hash_mismatches: 1,
          chain_violations: 1,
        },
      };

      const summary = toScanReportSummary(fullReport);

      expect(summary.timestamp).toBe(1234567890);
      expect(summary.durationMs).toBe(150);
      expect(summary.blocksScanned).toBe(20);
      expect(summary.totalMismatches).toBe(2);
      expect(summary.missedByDirty).toBe(1);
    });
  });
});
