// @vitest-environment jsdom
/**
 * Unit tests for blockTargeting utility functions.
 *
 * Tests the container-first targeting policy for block handles.
 */

import { describe, expect, it } from "vitest";
import { getBlockIdFromDom, isContainerBlockDom } from "../blockTargeting";

describe("blockTargeting", () => {
  describe("isContainerBlockDom", () => {
    it("returns true for blockquote elements", () => {
      const el = document.createElement("blockquote");
      expect(isContainerBlockDom(el)).toBe(true);
    });

    it("returns true for elements with data-block-type=blockquote", () => {
      const el = document.createElement("div");
      el.setAttribute("data-block-type", "blockquote");
      expect(isContainerBlockDom(el)).toBe(true);
    });

    it("returns true for elements with data-node-type=callout", () => {
      const el = document.createElement("div");
      el.setAttribute("data-node-type", "callout");
      expect(isContainerBlockDom(el)).toBe(true);
    });

    it("returns false for paragraph elements", () => {
      const el = document.createElement("p");
      expect(isContainerBlockDom(el)).toBe(false);
    });

    it("returns false for heading elements", () => {
      const el = document.createElement("h1");
      expect(isContainerBlockDom(el)).toBe(false);
    });

    it("returns false for div without container attributes", () => {
      const el = document.createElement("div");
      expect(isContainerBlockDom(el)).toBe(false);
    });
  });

  describe("getBlockIdFromDom", () => {
    it("extracts block ID from data-block-id attribute", () => {
      const el = document.createElement("div");
      el.setAttribute("data-block-id", "block_123");
      expect(getBlockIdFromDom(el)).toBe("block_123");
    });

    it("returns null when no data-block-id attribute", () => {
      const el = document.createElement("div");
      expect(getBlockIdFromDom(el)).toBeNull();
    });

    it("handles empty data-block-id attribute", () => {
      const el = document.createElement("div");
      el.setAttribute("data-block-id", "");
      // Empty string is falsy but getAttribute returns it
      expect(getBlockIdFromDom(el)).toBe("");
    });
  });

  // Note: findHandleTarget and getHandleTargetFromCoords require a ProseMirror EditorView
  // and are better tested via integration/E2E tests
});
