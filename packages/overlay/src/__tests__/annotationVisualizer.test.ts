/**
 * LFCC v0.9 RC - Annotation Visualizer Tests
 */

import { describe, expect, it } from "vitest";
import {
  filterEventsByAnnotation,
  formatGraceRemaining,
  formatStateLabel,
  formatTimeAgo,
  formatTimestamp,
  generateAnnotationVisualizerCss,
  getEventTypeColor,
  getStateColor,
  renderAnnotationVisualizer,
} from "../annotationVisualizer.js";
import type { AnnotationDisplayData, OverlayEvent } from "../types.js";

describe("Annotation Visualizer", () => {
  describe("renderAnnotationVisualizer", () => {
    it("should render annotation data", () => {
      const annotation: AnnotationDisplayData = {
        annoId: "anno-1",
        spanIds: ["s1", "s2"],
        targetBlockIds: ["b1"],
        currentState: "active",
        graceToken: null,
        graceExpiresAt: null,
        lastVerifyTime: Date.now() - 1000,
        lastVerifyReason: "checkpoint",
        contextHash: "hash-123",
      };

      const result = renderAnnotationVisualizer(annotation, []);

      expect(result.annotation).toBe(annotation);
      expect(result.stateLabel).toBe("Active");
      expect(result.graceStatus).toBeNull();
      expect(result.verificationStatus).not.toBeNull();
    });

    it("should calculate grace status", () => {
      const now = Date.now();
      const annotation: AnnotationDisplayData = {
        annoId: "anno-1",
        spanIds: [],
        targetBlockIds: [],
        currentState: "broken_grace",
        graceToken: "token-123",
        graceExpiresAt: now + 5000,
        lastVerifyTime: null,
        lastVerifyReason: null,
        contextHash: null,
      };

      const result = renderAnnotationVisualizer(annotation, []);

      expect(result.graceStatus).not.toBeNull();
      expect(result.graceStatus?.token).toBe("token-123");
      expect(result.graceStatus?.remainingMs).toBeGreaterThan(0);
      expect(result.graceStatus?.isExpired).toBe(false);
    });

    it("should detect expired grace", () => {
      const annotation: AnnotationDisplayData = {
        annoId: "anno-1",
        spanIds: [],
        targetBlockIds: [],
        currentState: "broken_grace",
        graceToken: "token-123",
        graceExpiresAt: Date.now() - 1000,
        lastVerifyTime: null,
        lastVerifyReason: null,
        contextHash: null,
      };

      const result = renderAnnotationVisualizer(annotation, []);

      expect(result.graceStatus?.isExpired).toBe(true);
      expect(result.graceStatus?.remainingMs).toBe(0);
    });

    it("should filter recent events", () => {
      const annotation: AnnotationDisplayData = {
        annoId: "anno-1",
        spanIds: [],
        targetBlockIds: [],
        currentState: "active",
        graceToken: null,
        graceExpiresAt: null,
        lastVerifyTime: null,
        lastVerifyReason: null,
        contextHash: null,
      };

      const events: OverlayEvent[] = [
        {
          id: "e1",
          timestamp: Date.now(),
          type: "state_transition",
          source: "anno-1",
          detail: "test",
        },
        { id: "e2", timestamp: Date.now(), type: "checkpoint", source: "anno-2", detail: "other" },
        { id: "e3", timestamp: Date.now(), type: "grace_enter", source: "anno-1", detail: "grace" },
      ];

      const result = renderAnnotationVisualizer(annotation, events);

      expect(result.recentEvents.length).toBe(2);
    });

    it("should detect stale verification", () => {
      const annotation: AnnotationDisplayData = {
        annoId: "anno-1",
        spanIds: [],
        targetBlockIds: [],
        currentState: "active",
        graceToken: null,
        graceExpiresAt: null,
        lastVerifyTime: Date.now() - 120000, // 2 minutes ago
        lastVerifyReason: "checkpoint",
        contextHash: "hash",
      };

      const result = renderAnnotationVisualizer(annotation, [], 10, 60000);

      expect(result.verificationStatus?.isStale).toBe(true);
    });
  });

  describe("getStateColor", () => {
    it("should return correct colors", () => {
      expect(getStateColor("active")).toBe("#4caf50");
      expect(getStateColor("active_unverified")).toBe("#2196f3");
      expect(getStateColor("broken_grace")).toBe("#ff9800");
      expect(getStateColor("broken_partial")).toBe("#f44336");
      expect(getStateColor("orphan")).toBe("#9e9e9e");
    });

    it("should handle unknown states", () => {
      expect(getStateColor("unknown")).toBe("#2196f3"); // defaults to unverified
    });
  });

  describe("formatStateLabel", () => {
    it("should format state labels", () => {
      expect(formatStateLabel("active")).toBe("Active");
      expect(formatStateLabel("active_unverified")).toBe("Active Unverified");
      expect(formatStateLabel("broken_grace")).toBe("Broken Grace");
    });
  });

  describe("formatGraceRemaining", () => {
    it("should format remaining time", () => {
      expect(formatGraceRemaining(0)).toBe("Expired");
      expect(formatGraceRemaining(-100)).toBe("Expired");
      expect(formatGraceRemaining(500)).toBe("500ms");
      expect(formatGraceRemaining(5000)).toBe("5.0s");
    });
  });

  describe("formatTimestamp", () => {
    it("should format timestamp", () => {
      const timestamp = new Date("2024-01-15T10:30:45.123Z").getTime();
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("formatTimeAgo", () => {
    it("should format time ago", () => {
      const now = Date.now();
      expect(formatTimeAgo(now)).toBe("just now");
      expect(formatTimeAgo(now - 5000)).toBe("5s ago");
      expect(formatTimeAgo(now - 120000)).toBe("2m ago");
      expect(formatTimeAgo(now - 7200000)).toBe("2h ago");
    });
  });

  describe("generateAnnotationVisualizerCss", () => {
    it("should generate valid CSS", () => {
      const css = generateAnnotationVisualizerCss();
      expect(css).toContain(".lfcc-anno-card");
      expect(css).toContain(".lfcc-anno-state-badge");
      expect(css).toContain(".lfcc-grace-indicator");
      expect(css).toContain(".lfcc-event-list");
    });
  });

  describe("getEventTypeColor", () => {
    it("should return colors for event types", () => {
      expect(getEventTypeColor("checkpoint")).toBe("#4caf50");
      expect(getEventTypeColor("mismatch_detected")).toBe("#f44336");
      expect(getEventTypeColor("grace_enter")).toBe("#ff9800");
    });
  });

  describe("filterEventsByAnnotation", () => {
    it("should filter events by annotation ID", () => {
      const events: OverlayEvent[] = [
        { id: "e1", timestamp: 1, type: "checkpoint", source: "anno-1", detail: "" },
        { id: "e2", timestamp: 2, type: "checkpoint", source: "anno-2", detail: "" },
        {
          id: "e3",
          timestamp: 3,
          type: "checkpoint",
          source: "other",
          detail: "",
          metadata: { annoId: "anno-1" },
        },
      ];

      const filtered = filterEventsByAnnotation(events, "anno-1");
      expect(filtered.length).toBe(2);
    });
  });
});
