/**
 * LFCC v0.9 RC - Block Visualizer Tests
 */

import { describe, expect, it } from "vitest";
import {
  buildContainerPath,
  calculateBlockDepth,
  extractDirtyBlockIds,
  formatBlockLabel,
  formatContainerPath,
  generateBlockOverlayCss,
  getBlockOverlayClasses,
  getBlockOverlayStyle,
  renderBlockOverlays,
} from "../blockVisualizer.js";
import { type BlockMeta, type BlockRect, DEFAULT_CSS_TOKENS } from "../types.js";

describe("Block Visualizer", () => {
  describe("renderBlockOverlays", () => {
    it("should render overlays for blocks", () => {
      const rects: BlockRect[] = [
        { blockId: "b1", x: 0, y: 0, width: 100, height: 50 },
        { blockId: "b2", x: 0, y: 50, width: 100, height: 50 },
      ];

      const metas = new Map<string, BlockMeta>([
        [
          "b1",
          {
            blockId: "b1",
            type: "paragraph",
            containerPath: "(root)",
            isDirty: false,
            textPreview: "Hello",
            childCount: 0,
          },
        ],
        [
          "b2",
          {
            blockId: "b2",
            type: "heading",
            containerPath: "(root)",
            isDirty: true,
            textPreview: "Title",
            childCount: 0,
          },
        ],
      ]);

      const result = renderBlockOverlays(rects, metas, "b1");

      expect(result.overlays.length).toBe(2);
      expect(result.overlays[0].isSelected).toBe(true);
      expect(result.overlays[1].isDirty).toBe(true);
      expect(result.cssStyles).toContain(".lfcc-block-overlay");
    });

    it("should skip blocks without metadata", () => {
      const rects: BlockRect[] = [
        { blockId: "b1", x: 0, y: 0, width: 100, height: 50 },
        { blockId: "b2", x: 0, y: 50, width: 100, height: 50 },
      ];

      const metas = new Map<string, BlockMeta>([
        [
          "b1",
          {
            blockId: "b1",
            type: "paragraph",
            containerPath: "(root)",
            isDirty: false,
            textPreview: "Hello",
            childCount: 0,
          },
        ],
      ]);

      const result = renderBlockOverlays(rects, metas, null);
      expect(result.overlays.length).toBe(1);
    });
  });

  describe("generateBlockOverlayCss", () => {
    it("should generate valid CSS", () => {
      const css = generateBlockOverlayCss(DEFAULT_CSS_TOKENS);
      expect(css).toContain(".lfcc-block-overlay");
      expect(css).toContain(".lfcc-block-overlay--dirty");
      expect(css).toContain(".lfcc-block-overlay--selected");
      expect(css).toContain(".lfcc-block-label");
    });
  });

  describe("getBlockOverlayStyle", () => {
    it("should return inline styles", () => {
      const overlay = {
        rect: { blockId: "b1", x: 10, y: 20, width: 100, height: 50 },
        meta: {
          blockId: "b1",
          type: "p",
          containerPath: "",
          isDirty: false,
          textPreview: "",
          childCount: 0,
        },
        isSelected: false,
        isDirty: false,
      };

      const style = getBlockOverlayStyle(overlay);
      expect(style.left).toBe("10px");
      expect(style.top).toBe("20px");
      expect(style.width).toBe("100px");
      expect(style.height).toBe("50px");
    });
  });

  describe("getBlockOverlayClasses", () => {
    it("should return base class", () => {
      const overlay = {
        rect: { blockId: "b1", x: 0, y: 0, width: 100, height: 50 },
        meta: {
          blockId: "b1",
          type: "p",
          containerPath: "",
          isDirty: false,
          textPreview: "",
          childCount: 0,
        },
        isSelected: false,
        isDirty: false,
      };

      const classes = getBlockOverlayClasses(overlay);
      expect(classes).toContain("lfcc-block-overlay");
    });

    it("should add dirty class", () => {
      const overlay = {
        rect: { blockId: "b1", x: 0, y: 0, width: 100, height: 50 },
        meta: {
          blockId: "b1",
          type: "p",
          containerPath: "",
          isDirty: true,
          textPreview: "",
          childCount: 0,
        },
        isSelected: false,
        isDirty: true,
      };

      const classes = getBlockOverlayClasses(overlay);
      expect(classes).toContain("lfcc-block-overlay--dirty");
    });

    it("should add selected class", () => {
      const overlay = {
        rect: { blockId: "b1", x: 0, y: 0, width: 100, height: 50 },
        meta: {
          blockId: "b1",
          type: "p",
          containerPath: "",
          isDirty: false,
          textPreview: "",
          childCount: 0,
        },
        isSelected: true,
        isDirty: false,
      };

      const classes = getBlockOverlayClasses(overlay);
      expect(classes).toContain("lfcc-block-overlay--selected");
    });
  });

  describe("formatBlockLabel", () => {
    it("should format block label", () => {
      const meta: BlockMeta = {
        blockId: "block-12345678-abcd",
        type: "paragraph",
        containerPath: "",
        isDirty: false,
        textPreview: "",
        childCount: 0,
      };

      const label = formatBlockLabel(meta);
      expect(label).toContain("paragraph");
      expect(label).toContain("block-12");
    });
  });

  describe("formatContainerPath", () => {
    it("should return container path", () => {
      const meta: BlockMeta = {
        blockId: "b1",
        type: "p",
        containerPath: "table > row > cell",
        isDirty: false,
        textPreview: "",
        childCount: 0,
      };

      expect(formatContainerPath(meta)).toBe("table > row > cell");
    });
  });

  describe("buildContainerPath", () => {
    it("should build path from parent chain", () => {
      const parentMap = new Map([
        ["b3", "b2"],
        ["b2", "b1"],
      ]);
      const typeMap = new Map([
        ["b1", "table"],
        ["b2", "row"],
        ["b3", "cell"],
      ]);

      const path = buildContainerPath("b3", parentMap, typeMap);
      expect(path).toEqual(["table", "row"]);
    });

    it("should return empty for root blocks", () => {
      const path = buildContainerPath("b1", new Map(), new Map());
      expect(path).toEqual([]);
    });
  });

  describe("extractDirtyBlockIds", () => {
    it("should extract dirty block IDs", () => {
      const dirtyInfo = {
        dirty_block_ids: ["b1", "b2"],
        dirty_span_ids: ["s1"],
      };

      const ids = extractDirtyBlockIds(dirtyInfo);
      expect(ids.has("b1")).toBe(true);
      expect(ids.has("b2")).toBe(true);
      expect(ids.size).toBe(2);
    });

    it("should handle missing dirty_block_ids", () => {
      const ids = extractDirtyBlockIds({});
      expect(ids.size).toBe(0);
    });
  });

  describe("calculateBlockDepth", () => {
    it("should calculate depth from path", () => {
      expect(calculateBlockDepth("(root)")).toBe(0);
      expect(calculateBlockDepth("table")).toBe(1);
      expect(calculateBlockDepth("table > row > cell")).toBe(3);
    });
  });
});
