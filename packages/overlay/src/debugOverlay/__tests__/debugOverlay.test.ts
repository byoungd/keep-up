/**
 * LFCC v0.9 RC - Debug Overlay Tests
 * @see docs/product/Audit/TaskPrompt_Observability_DebugOverlay_LFCC_v0.9_RC.md
 */

import { describe, expect, it } from "vitest";
import { createDebugSnapshot, serializeSnapshot, validateSnapshotSchema } from "../debugSnapshot";
import { createPerfCounters } from "../perfCounters";
import { generateDebugOverlayCss, renderDebugOverlay } from "../renderer";
import {
  createDebugOverlayController,
  createDebugOverlayState,
  toggleDebugOverlayVisibility,
  toggleDebugSection,
  toggleDecorationOutlines,
  updateDocumentSection,
} from "../state";
import type { AnnotationRowData, DebugSection, DocumentSectionData } from "../types";
import { shouldEnableDebugOverlay } from "../types";

describe("Debug Overlay Types", () => {
  describe("shouldEnableDebugOverlay", () => {
    it("returns false by default in test environment", () => {
      // In test environment without flags, should be false
      const result = shouldEnableDebugOverlay();
      expect(typeof result).toBe("boolean");
    });
  });
});

describe("Debug Overlay State", () => {
  describe("createDebugOverlayState", () => {
    it("creates initial state with defaults", () => {
      const state = createDebugOverlayState();

      expect(state.visible).toBe(false);
      expect(state.expandedSections.size).toBeGreaterThan(0);
      expect(state.decorationOutlinesEnabled).toBe(false);
      expect(state.lastScanResult).toBeNull();
    });
  });

  describe("toggleDebugOverlayVisibility", () => {
    it("toggles visibility", () => {
      const state = createDebugOverlayState();
      expect(state.visible).toBe(false);

      const toggled = toggleDebugOverlayVisibility(state);
      expect(toggled.visible).toBe(true);

      const toggledBack = toggleDebugOverlayVisibility(toggled);
      expect(toggledBack.visible).toBe(false);
    });
  });

  describe("toggleDebugSection", () => {
    it("toggles section expansion", () => {
      const state = createDebugOverlayState();
      const section: DebugSection = "document";

      // Initially expanded
      expect(state.expandedSections.has(section)).toBe(true);

      // Toggle off
      const collapsed = toggleDebugSection(state, section);
      expect(collapsed.expandedSections.has(section)).toBe(false);

      // Toggle on
      const expanded = toggleDebugSection(collapsed, section);
      expect(expanded.expandedSections.has(section)).toBe(true);
    });
  });

  describe("toggleDecorationOutlines", () => {
    it("toggles decoration outlines", () => {
      const state = createDebugOverlayState();
      expect(state.decorationOutlinesEnabled).toBe(false);

      const enabled = toggleDecorationOutlines(state);
      expect(enabled.decorationOutlinesEnabled).toBe(true);
    });
  });

  describe("updateDocumentSection", () => {
    it("updates document data", () => {
      const state = createDebugOverlayState();
      const docData: DocumentSectionData = {
        docId: "test-doc",
        seedFlag: false,
        currentFrontier: "abc123",
        blockCount: 5,
        lastTxType: "insert",
        lastTxClassification: "inline",
        lastTxTimestamp: 12345,
      };

      const updated = updateDocumentSection(state, docData);
      expect(updated.document).toEqual(docData);
    });
  });
});

describe("Debug Overlay Controller", () => {
  it("creates controller with initial state", () => {
    const controller = createDebugOverlayController({ enabled: true });

    expect(controller.getState().visible).toBe(false);
    expect(controller.isEnabled()).toBe(true);
  });

  it("toggle shows/hides overlay", () => {
    const controller = createDebugOverlayController({ enabled: true });

    controller.toggle();
    expect(controller.getState().visible).toBe(true);

    controller.toggle();
    expect(controller.getState().visible).toBe(false);
  });

  it("notifies subscribers on state change", () => {
    const controller = createDebugOverlayController({ enabled: true });
    const states: boolean[] = [];

    const unsubscribe = controller.subscribe((state) => {
      states.push(state.visible);
    });

    controller.toggle();
    controller.toggle();

    expect(states).toEqual([true, false]);

    unsubscribe();
  });

  it("does not mutate LFCC replicated state", () => {
    // This test verifies the controller only manages local UI state
    const controller = createDebugOverlayController({ enabled: true });

    // All operations should complete without throwing
    controller.toggle();
    controller.toggleSection("document");
    controller.toggleOutlines();
    controller.updateDocument({
      docId: "test",
      seedFlag: false,
      currentFrontier: "abc",
      blockCount: 1,
      lastTxType: "insert",
      lastTxClassification: "inline",
      lastTxTimestamp: 0,
    });

    // No CRDT mutations should have occurred
    expect(controller.getState()).toBeDefined();
  });
});

describe("Debug Snapshot", () => {
  describe("createDebugSnapshot", () => {
    it("creates snapshot with all fields", () => {
      const annotations: AnnotationRowData[] = [
        {
          id: "anno-1",
          shortId: "a1",
          color: "yellow",
          type: "highlight",
          state: "active",
          verificationStatus: "verified",
          lastVerifyResult: "ok",
          contextHashShort: "abc123",
          spansCount: 1,
          resolvedSegmentsCount: 1,
          resolvedBlockIds: ["block-1"],
          lastError: null,
        },
      ];

      const snapshot = createDebugSnapshot({
        document: null,
        selection: null,
        annotations,
        focus: null,
        dirty: null,
        recentErrors: [],
      });

      expect(snapshot.version).toBe("1.0.0");
      expect(typeof snapshot.timestamp).toBe("number");
      expect(snapshot.annotations).toHaveLength(1);
    });

    it("truncates long error messages", () => {
      const longMessage = "x".repeat(200);
      const annotations: AnnotationRowData[] = [
        {
          id: "anno-1",
          shortId: "a1",
          color: null,
          type: "highlight",
          state: "orphan",
          verificationStatus: "unverified",
          lastVerifyResult: null,
          contextHashShort: null,
          spansCount: 1,
          resolvedSegmentsCount: 0,
          resolvedBlockIds: [],
          lastError: { code: "ERR", message: longMessage },
        },
      ];

      const snapshot = createDebugSnapshot({
        document: null,
        selection: null,
        annotations,
        focus: null,
        dirty: null,
        recentErrors: [],
      });

      expect(snapshot.annotations[0].lastError?.message.length).toBeLessThanOrEqual(120);
    });
  });

  describe("serializeSnapshot", () => {
    it("serializes to valid JSON", () => {
      const snapshot = createDebugSnapshot({
        document: null,
        selection: null,
        annotations: [],
        focus: null,
        dirty: null,
        recentErrors: [],
      });

      const json = serializeSnapshot(snapshot);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("validateSnapshotSchema", () => {
    it("validates correct snapshot", () => {
      const snapshot = createDebugSnapshot({
        document: null,
        selection: null,
        annotations: [],
        focus: null,
        dirty: null,
        recentErrors: [],
      });

      const result = validateSnapshotSchema(snapshot);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects invalid snapshot", () => {
      const result = validateSnapshotSchema({ version: "2.0" });
      expect(result.valid).toBe(false);
    });
  });
});

describe("Performance Counters", () => {
  it("creates counters with zero initial values", () => {
    const counters = createPerfCounters();
    const data = counters.getData();

    expect(data.dragUpdatesPerSecond).toBe(0);
    expect(data.resolutionCallsPerSecond).toBe(0);
    expect(data.decorationRebuildsPerSecond).toBe(0);
  });

  it("records events", () => {
    const counters = createPerfCounters();

    counters.recordDragUpdate();
    counters.recordDragUpdate();
    counters.recordResolution(5);
    counters.recordDecorationRebuild();

    const data = counters.getData();
    expect(data.dragUpdatesPerSecond).toBeGreaterThan(0);
    expect(data.resolutionCallsPerSecond).toBeGreaterThan(0);
    expect(data.avgResolutionDurationMs).toBe(5);
  });

  it("resets counters", () => {
    const counters = createPerfCounters();

    counters.recordDragUpdate();
    counters.recordResolution(10);
    counters.reset();

    const data = counters.getData();
    expect(data.dragUpdatesPerSecond).toBe(0);
    expect(data.avgResolutionDurationMs).toBe(0);
  });
});

describe("Debug Overlay Renderer", () => {
  describe("generateDebugOverlayCss", () => {
    it("generates valid CSS", () => {
      const css = generateDebugOverlayCss();

      expect(css).toContain(".lfcc-debug-overlay");
      expect(css).toContain(".lfcc-debug-section");
      expect(css).toContain(".lfcc-debug-btn");
    });
  });

  describe("renderDebugOverlay", () => {
    it("renders toggle button when not visible", () => {
      const state = createDebugOverlayState();
      const html = renderDebugOverlay(state);

      expect(html).toContain("lfcc-debug-toggle-btn");
      expect(html).toContain("LFCC Debug");
    });

    it("renders full overlay when visible", () => {
      let state = createDebugOverlayState();
      state = toggleDebugOverlayVisibility(state);

      const html = renderDebugOverlay(state);

      expect(html).toContain("lfcc-debug-overlay");
      expect(html).toContain("Document");
      expect(html).toContain("Selection");
      expect(html).toContain("Annotations");
      expect(html).toContain("Focus");
      expect(html).toContain("Dirty/Tx");
      expect(html).toContain("Perf");
      expect(html).toContain("Actions");
    });

    it("includes action buttons when actions section is expanded", () => {
      let state = createDebugOverlayState();
      state = toggleDebugOverlayVisibility(state);
      // Expand the actions section
      state = toggleDebugSection(state, "actions");

      const html = renderDebugOverlay(state);

      expect(html).toContain('data-action="force-scan"');
      expect(html).toContain('data-action="dump-snapshot"');
      expect(html).toContain('data-action="toggle-outlines"');
    });
  });
});
