/**
 * LFCC v0.9 RC - Visual Spec Tests
 */

import { describe, expect, it } from "vitest";
import {
  ANIMATION,
  ANNOTATION_HIGHLIGHT_COLORS,
  BORDER_STYLES,
  KIND_COLORS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  generateAllCss,
  generateBadgeCss,
  generateCssVariables,
  generateHighlightCss,
  getAnnotationHighlightColor,
  getBadgeStyle,
  getHighlightStyle,
  getKindColor,
} from "../visualSpec.js";

describe("Visual Spec", () => {
  describe("STATUS_COLORS", () => {
    it("should have colors for all statuses", () => {
      expect(STATUS_COLORS.active).toBeDefined();
      expect(STATUS_COLORS.active_unverified).toBeDefined();
      expect(STATUS_COLORS.broken_grace).toBeDefined();
      expect(STATUS_COLORS.active_partial).toBeDefined();
      expect(STATUS_COLORS.orphan).toBeDefined();
    });

    it("should have required color properties", () => {
      for (const colors of Object.values(STATUS_COLORS)) {
        expect(colors.primary).toBeDefined();
        expect(colors.border).toBeDefined();
        expect(colors.badge).toBeDefined();
        expect(colors.badgeText).toBeDefined();
      }
    });
  });

  describe("BORDER_STYLES", () => {
    it("should have correct styles", () => {
      expect(BORDER_STYLES.active).toBe("solid");
      expect(BORDER_STYLES.active_unverified).toBe("dotted");
      expect(BORDER_STYLES.broken_grace).toBe("dashed");
      expect(BORDER_STYLES.orphan).toBe("none");
    });
  });

  describe("STATUS_LABELS", () => {
    it("should have labels for all statuses", () => {
      expect(STATUS_LABELS.active).toBe("Active");
      expect(STATUS_LABELS.active_unverified).toBe("Syncing");
      expect(STATUS_LABELS.broken_grace).toBe("Recovering");
      expect(STATUS_LABELS.active_partial).toBe("Partial");
      expect(STATUS_LABELS.orphan).toBe("Orphaned");
    });
  });

  describe("STATUS_ICONS", () => {
    it("should have icons for all statuses", () => {
      expect(STATUS_ICONS.active).toBe("✓");
      expect(STATUS_ICONS.active_unverified).toBe("↻");
      expect(STATUS_ICONS.broken_grace).toBe("⏳");
      expect(STATUS_ICONS.active_partial).toBe("◐");
      expect(STATUS_ICONS.orphan).toBe("⚠");
    });
  });

  describe("ANIMATION", () => {
    it("should have animation timings", () => {
      expect(ANIMATION.loadingDelay).toBeGreaterThan(0);
      expect(ANIMATION.stateTransition).toBeGreaterThan(0);
      expect(ANIMATION.stateDebounce).toBeGreaterThan(0);
      expect(ANIMATION.gracePulse).toBeGreaterThan(0);
    });
  });

  describe("getHighlightStyle", () => {
    it("should return style for active", () => {
      const style = getHighlightStyle("active");
      expect(style.backgroundColor).toBe(STATUS_COLORS.active.primary);
      expect(style.borderStyle).toBe("solid");
    });

    it("should return style for orphan", () => {
      const style = getHighlightStyle("orphan");
      expect(style.backgroundColor).toBe("transparent");
      expect(style.borderStyle).toBe("none");
    });
  });

  describe("getBadgeStyle", () => {
    it("should return badge style", () => {
      const style = getBadgeStyle("active");
      expect(style.backgroundColor).toBe(STATUS_COLORS.active.badge);
      expect(style.label).toBe("Active");
      expect(style.icon).toBe("✓");
    });
  });

  describe("getKindColor", () => {
    it("should return kind colors", () => {
      expect(getKindColor("highlight")).toBe(KIND_COLORS.highlight);
      expect(getKindColor("comment")).toBe(KIND_COLORS.comment);
      expect(getKindColor("suggestion")).toBe(KIND_COLORS.suggestion);
    });

    it("should return default for unknown kind", () => {
      expect(getKindColor("unknown")).toBe(KIND_COLORS.default);
    });
  });

  describe("getAnnotationHighlightColor", () => {
    it("should return highlight color token", () => {
      expect(getAnnotationHighlightColor("yellow")).toBe(ANNOTATION_HIGHLIGHT_COLORS.yellow);
    });

    it("should return default for unknown color", () => {
      expect(getAnnotationHighlightColor("unknown")).toBe(ANNOTATION_HIGHLIGHT_COLORS.yellow);
    });
  });

  describe("generateCssVariables", () => {
    it("should generate CSS variables", () => {
      const css = generateCssVariables();
      expect(css).toContain(":root {");
      expect(css).toContain("--lfcc-active-primary");
      expect(css).toContain("--lfcc-orphan-badge");
      expect(css).toContain("--lfcc-kind-highlight");
      expect(css).toContain("--lfcc-annotation-yellow");
    });
  });

  describe("generateHighlightCss", () => {
    it("should generate highlight classes", () => {
      const css = generateHighlightCss();
      expect(css).toContain(".lfcc-highlight--active");
      expect(css).toContain(".lfcc-highlight--orphan");
      expect(css).toContain(".lfcc-highlight-gap");
    });
  });

  describe("generateBadgeCss", () => {
    it("should generate badge classes", () => {
      const css = generateBadgeCss();
      expect(css).toContain(".lfcc-badge");
      expect(css).toContain(".lfcc-badge--active");
      expect(css).toContain("@keyframes lfcc-spin");
      expect(css).toContain("@keyframes lfcc-pulse");
    });
  });

  describe("generateAllCss", () => {
    it("should generate complete CSS", () => {
      const css = generateAllCss();
      expect(css).toContain("LFCC Annotation UI Styles");
      expect(css).toContain(":root {");
      expect(css).toContain(".lfcc-highlight--active");
      expect(css).toContain(".lfcc-badge");
    });
  });
});
